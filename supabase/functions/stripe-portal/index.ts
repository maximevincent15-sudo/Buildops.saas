// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : ouvre le Customer Portal Stripe
//
// Renvoie une URL vers le portail Stripe où le client peut :
//   • Mettre à jour sa carte bancaire
//   • Télécharger ses factures
//   • Annuler son abonnement (ou réactiver)
//   • Changer de plan (si configuré dans Stripe → Settings → Billing Portal)
//
// Setup (UNE fois) :
//   1. Stripe Dashboard → Settings → Billing → Customer portal
//      → Activer les fonctionnalités souhaitées (cancellation, plan switching…)
//   2. supabase functions deploy stripe-portal --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'

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
    const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'
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

    const { data: profile } = await userClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
    if (!profile?.organization_id) return jsonResponse({ error: 'no_organization' }, 400, corsHeaders)

    const { data: sub } = await userClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', profile.organization_id)
      .single()

    if (!sub?.stripe_customer_id) {
      // Le user est encore en trial local (jamais passé par Checkout)
      return jsonResponse({ error: 'no_stripe_customer' }, 400, corsHeaders)
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${SITE_URL}/abonnement`,
    })

    return jsonResponse({ url: session.url }, 200, corsHeaders)
  } catch (e) {
    console.error('Erreur stripe-portal:', e)
    return jsonResponse(
      { error: 'internal_error', message: e instanceof Error ? e.message : String(e) },
      500,
      corsHeaders,
    )
  }
})
