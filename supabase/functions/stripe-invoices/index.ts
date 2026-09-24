// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : liste des factures Stripe de l'organisation
//
// Alimente la rubrique « Mes factures » de la page /abonnement :
// numéro, date, période, montant, statut, lien PDF et lien de paiement.
// Réservé aux administrateurs de l'organisation.
//
// Déploiement : supabase functions deploy stripe-invoices --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { checkRateLimit } from '../_shared/rateLimit.ts'

// Liste blanche d'origines autorisées à appeler cette fonction.
const ALLOWED_ORIGINS = [
  'https://app.firovia.fr',
  'https://firovia.fr',
  'http://localhost:5173',
  'http://localhost:4173',
]

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+-firovia[a-z0-9-]*\.vercel\.app$/.test(origin) ||
    /^https:\/\/buildops-saas[a-z0-9-]*\.vercel\.app$/.test(origin)
  ) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function jsonResponse(payload: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    if (!STRIPE_SECRET_KEY) return jsonResponse({ error: 'stripe_not_configured' }, 503, corsHeaders)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'unauthenticated' }, 401, corsHeaders)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return jsonResponse({ error: 'unauthenticated' }, 401, corsHeaders)

    // ─── Rate limit : 20 consultations / min / user ─────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const rl = await checkRateLimit(adminClient, {
      bucket: `stripe-invoices:user:${user.id}`,
      limit: 20,
      windowSeconds: 60,
    })
    if (!rl.ok) {
      return jsonResponse(
        { error: 'rate_limited', retry_after_s: rl.retryAfterS },
        429,
        { ...corsHeaders, 'Retry-After': String(rl.retryAfterS ?? 60) },
      )
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('organization_id, user_role')
      .eq('id', user.id)
      .single()
    if (!profile?.organization_id) return jsonResponse({ error: 'no_organization' }, 400, corsHeaders)
    if (profile.user_role === 'member') return jsonResponse({ error: 'forbidden' }, 403, corsHeaders)

    const { data: sub } = await userClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', profile.organization_id)
      .single()

    // Jamais passé par Stripe (essai, accès offert) → aucune facture
    if (!sub?.stripe_customer_id) return jsonResponse({ invoices: [] }, 200, corsHeaders)

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
    const list = await stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 36 })

    const invoices = list.data
      .filter((inv) => inv.status !== 'draft')
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        created: inv.created,
        period_start: inv.lines?.data?.[0]?.period?.start ?? inv.period_start,
        period_end: inv.lines?.data?.[0]?.period?.end ?? inv.period_end,
        total: inv.total,
        amount_due: inv.amount_due,
        currency: inv.currency,
        status: inv.status,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
      }))

    return jsonResponse({ invoices }, 200, corsHeaders)
  } catch (e) {
    console.error('Erreur stripe-invoices:', e)
    return jsonResponse({ error: 'internal_error' }, 500, corsHeaders)
  }
})
