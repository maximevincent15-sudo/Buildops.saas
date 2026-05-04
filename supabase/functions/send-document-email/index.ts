// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// BuildOps — Edge Function : envoi d'un document (rapport / devis / facture)
// par email avec le PDF en pièce jointe via Resend.
//
// Setup nécessaire (à faire UNE fois par l'utilisateur) :
//
// 1. Créer un compte Resend : https://resend.com (gratuit jusqu'à 3000 mails/mois)
//
// 2. (Recommandé) Configurer un nom de domaine dans Resend pour éviter le spam :
//    - Dans Resend → Domains → Add domain → entrer "tonentreprise.fr"
//    - Ajouter les enregistrements DNS suggérés (SPF, DKIM) chez ton registrar
//    - Sans domaine, tu peux quand même tester avec onboarding@resend.dev
//      (limité aux emails autorisés sur ton compte Resend)
//
// 3. Récupérer la clé API Resend (Settings → API Keys)
//
// 4. Définir les secrets côté Supabase (CLI ou Dashboard) :
//      supabase secrets set RESEND_API_KEY=re_xxxxx
//      supabase secrets set RESEND_FROM_EMAIL=contact@tonentreprise.fr
//      supabase secrets set RESEND_FROM_NAME="Maintenance Incendie"
//
//    (Si tu n'as pas de domaine encore, mets RESEND_FROM_EMAIL=onboarding@resend.dev)
//
// 5. Déployer la fonction :
//      supabase functions deploy send-document-email --no-verify-jwt
//
//    (--no-verify-jwt car on gère l'auth manuellement avec le client Supabase)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type DocumentKind = 'report' | 'quote' | 'invoice'

interface RequestBody {
  kind: DocumentKind
  documentId: string
  recipientEmail: string
  subject: string
  body: string
  /** URL publique du PDF déjà uploadé (Supabase Storage) */
  pdfUrl?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
    const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'BuildOps'

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'resend_not_configured',
          message: 'La clé API Resend n\'est pas configurée. Voir les instructions dans les paramètres.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Auth : on utilise le JWT de l'utilisateur pour vérifier qu'il a le droit
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'unauthenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
      error: userErr,
    } = await supabaseClient.auth.getUser()

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload: RequestBody = await req.json()

    // Vérification simple : l'utilisateur a bien accès au document via RLS
    const tableMap = { report: 'reports', quote: 'quotes', invoice: 'invoices' }
    const table = tableMap[payload.kind]
    if (!table) {
      return new Response(
        JSON.stringify({ error: 'invalid_kind' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: doc, error: docErr } = await supabaseClient
      .from(table)
      .select('id, pdf_url')
      .eq('id', payload.documentId)
      .single()

    if (docErr || !doc) {
      return new Response(
        JSON.stringify({ error: 'document_not_found_or_no_access' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const pdfUrl = payload.pdfUrl ?? doc.pdf_url
    let attachments: { filename: string; content: string }[] = []

    if (pdfUrl) {
      // Téléchargement du PDF
      try {
        const pdfRes = await fetch(pdfUrl)
        if (pdfRes.ok) {
          const buf = new Uint8Array(await pdfRes.arrayBuffer())
          // Convert to base64 (Resend attend du base64 dans `content`)
          let binary = ''
          for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
          const b64 = btoa(binary)
          // Nom de fichier : derive de l'URL
          const urlParts = pdfUrl.split('/')
          const lastPart = urlParts[urlParts.length - 1]?.split('?')[0]
          const filename = lastPart && lastPart.endsWith('.pdf') ? lastPart : 'document.pdf'
          attachments = [{ filename, content: b64 }]
        }
      } catch (e) {
        console.warn('Échec téléchargement PDF, envoi sans pièce jointe:', e)
      }
    }

    // Envoi via Resend API
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
        to: [payload.recipientEmail],
        subject: payload.subject,
        text: payload.body,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      return new Response(
        JSON.stringify({
          error: 'resend_failed',
          status: resendRes.status,
          details: resendData,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailId: resendData.id,
        sentTo: payload.recipientEmail,
        attached: attachments.length > 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('Erreur send-document-email:', e)
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
