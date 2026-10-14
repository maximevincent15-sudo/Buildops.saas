// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : créer une Stripe Checkout Session pour
// passer du trial local 14j à un abonnement payant Essentiel ou Pro.
//
// Flow :
//   1. Le user clique "Choisir un plan" dans le SaaS.
//   2. Le front appelle cette fonction avec { priceId }.
//   3. La fonction crée (si besoin) un Customer Stripe lié à l'org,
//      persiste le stripe_customer_id, puis crée une Checkout Session
//      dont la quantité = nombre de techniciens actifs.
//   4. Le front redirige le user vers l'URL Stripe Checkout retournée.
//   5. Stripe encaisse, puis envoie un webhook → stripe-webhook met à
//      jour la table subscriptions.
//
// Organisation déjà abonnée : changement de formule appliqué directement
// sur l'abonnement existant (prorata facturé tout de suite), sans
// repasser par Checkout ni créer un second abonnement.
//
// Setup nécessaire (à faire UNE fois) :
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
//   supabase secrets set SITE_URL=https://app.firovia.fr
//   supabase functions deploy stripe-checkout --no-verify-jwt
//
//   (--no-verify-jwt car on gère l'auth manuellement avec le JWT user)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { checkRateLimit, getClientIp } from '../_shared/rateLimit.ts'

// Liste blanche d'origines autorisées à appeler cette fonction.
// Un attaquant sur un site tiers ne peut PAS appeler cette fonction
// même s'il vole le JWT d'un user (le navigateur bloque la requête).
const ALLOWED_ORIGINS = [
  'https://app.firovia.fr',
  'https://firovia.fr',
  'http://localhost:5173',
  'http://localhost:4173',
]

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    // Autorise aussi les preview Vercel (*.vercel.app) du projet Firovia
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

// Formules en libre-service (prix par technicien, grille du 13/10/2026).
// Les anciens prix forfaitaires et l'Entreprise ne s'achètent plus en ligne :
// ils sont créés à la main dans Stripe pour les offres négociées.
const SELF_SERVE_PRICES = new Set([
  'price_1UQ13C2KbFmYQD88IgXAJzkb', // Essentiel mensuel
  'price_1UQ15a2KbFmYQD88Yv284sG1', // Essentiel annuel
  'price_1UQ18Y2KbFmYQD88467baI77', // Pro mensuel par technicien
  'price_1UQ19a2KbFmYQD88wfLBT8Ap', // Pro annuel par technicien
])

interface RequestBody {
  priceId: string
  /** Version des CGV acceptée par le client (case cochée sur /abonnement) */
  cgvVersion?: string
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

    // ─── Auth utilisateur ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'unauthenticated' }, 401, corsHeaders)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return jsonResponse({ error: 'unauthenticated' }, 401, corsHeaders)

    const { priceId, cgvVersion } = (await req.json()) as RequestBody
    if (!priceId) return jsonResponse({ error: 'missing_priceId' }, 400, corsHeaders)
    if (!SELF_SERVE_PRICES.has(priceId)) return jsonResponse({ error: 'invalid_price' }, 400, corsHeaders)

    // ─── Récupère l'organization du user ──────────────────
    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
    if (profileErr || !profile?.organization_id) {
      return jsonResponse({ error: 'no_organization' }, 400, corsHeaders)
    }

    // ─── Client admin (bypass RLS) pour subscriptions ─────
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ─── Rate limit : 5 tentatives / min / user ────────────
    // Un checkout n'est jamais massif : 5 essais/min est très large mais
    // bloque un compte compromis qui tenterait de spammer.
    const rl = await checkRateLimit(adminClient, {
      bucket: `stripe-checkout:user:${user.id}`,
      limit: 5,
      windowSeconds: 60,
    })
    if (!rl.ok) {
      return jsonResponse(
        { error: 'rate_limited', retry_after_s: rl.retryAfterS },
        429,
        { ...corsHeaders, 'Retry-After': String(rl.retryAfterS ?? 60) },
      )
    }

    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status')
      .eq('organization_id', profile.organization_id)
      .single()

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })

    // Quantité facturée = techniciens actifs (le minimum de la formule est
    // porté par le premier palier du prix Stripe)
    const { count: activeTechnicians } = await adminClient
      .from('technicians')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('active', true)
    const quantity = Math.max(1, activeTechnicians ?? 0)

    // Preuve d'acceptation des CGV (art. 18 CGV) : version + date + auteur
    const cgvMetadata = {
      organization_id: profile.organization_id,
      cgv_version: typeof cgvVersion === 'string' ? cgvVersion.slice(0, 32) : 'non-transmise',
      cgv_accepted_at: new Date().toISOString(),
      cgv_accepted_by: user.email ?? user.id,
    }

    // ─── Déjà abonné : changement de formule sur place ───
    if (sub?.stripe_subscription_id && ['active', 'past_due'].includes(sub.status)) {
      const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      const item = current.items.data[0]
      if (item && !['canceled', 'incomplete_expired'].includes(current.status)) {
        await stripe.subscriptions.update(current.id, {
          items: [{ id: item.id, price: priceId, quantity }],
          proration_behavior: 'always_invoice',
          cancel_at_period_end: false,
          metadata: { ...current.metadata, ...cgvMetadata },
        })
        return jsonResponse({ url: `${SITE_URL}/abonnement?status=success`, updated: true }, 200, corsHeaders)
      }
    }

    // Crée le Customer Stripe au premier passage (réutilise sinon)
    let customerId = sub?.stripe_customer_id ?? null
    if (!customerId) {
      const { data: org } = await adminClient
        .from('organizations')
        .select('name, siret')
        .eq('id', profile.organization_id)
        .single()

      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: org?.name ?? undefined,
        metadata: {
          organization_id: profile.organization_id,
          siret: org?.siret ?? '',
        },
      })
      customerId = customer.id

      await adminClient
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('organization_id', profile.organization_id)
    }

    // ─── Crée la Checkout Session ─────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      success_url: `${SITE_URL}/abonnement?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/abonnement?status=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      subscription_data: {
        metadata: cgvMetadata,
      },
      // Réglementaire FR : l'auto-collect de la TVA peut être activé plus
      // tard via stripe.tax.settings (nécessite ID TVA intracom — l'EI à
      // l'inscription n'en a pas).
    })

    return jsonResponse({ url: session.url, sessionId: session.id }, 200, corsHeaders)
  } catch (e) {
    console.error('Erreur stripe-checkout:', e)
    return jsonResponse(
      { error: 'internal_error', message: e instanceof Error ? e.message : String(e) },
      500,
      corsHeaders,
    )
  }
})
