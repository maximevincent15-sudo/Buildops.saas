// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : webhook Stripe (sync subscriptions)
//
// Reçoit les events Stripe et met à jour la table subscriptions :
//   • customer.subscription.created  → trial → active (ou trialing si trial CB)
//   • customer.subscription.updated  → changement plan / période / statut
//   • customer.subscription.deleted  → annulation effective
//   • invoice.payment_failed         → status = 'past_due'
//
// Setup (UNE fois) :
//   1. Dans Stripe Dashboard → Developers → Webhooks → Add endpoint
//   2. URL : https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   3. Events à écouter : les 4 ci-dessus
//   4. Copier le "Signing secret" (whsec_...)
//   5. supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
//   6. supabase functions deploy stripe-webhook --no-verify-jwt
//
//   (--no-verify-jwt obligatoire : Stripe n'a pas de JWT Supabase, on
//    vérifie l'authenticité via la signature Stripe-Signature)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'

type PlanInfo = { plan: 'starter' | 'pro'; billing_period: 'monthly' | 'yearly' }

function buildPriceMap(): Record<string, PlanInfo> {
  const map: Record<string, PlanInfo> = {}
  const starterMonthly = Deno.env.get('STRIPE_PRICE_STARTER_MONTHLY')
  const starterYearly  = Deno.env.get('STRIPE_PRICE_STARTER_YEARLY')
  const proMonthly     = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')
  const proYearly      = Deno.env.get('STRIPE_PRICE_PRO_YEARLY')
  if (starterMonthly) map[starterMonthly] = { plan: 'starter', billing_period: 'monthly' }
  if (starterYearly)  map[starterYearly]  = { plan: 'starter', billing_period: 'yearly'  }
  if (proMonthly)     map[proMonthly]     = { plan: 'pro',     billing_period: 'monthly' }
  if (proYearly)      map[proYearly]      = { plan: 'pro',     billing_period: 'yearly'  }
  return map
}

async function resolveOrgFromCustomer(supabase, customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_customer_id', customerId)
    .single()
  return data?.organization_id ?? null
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toISOString()
}

serve(async (req) => {
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response('Stripe not configured', { status: 503 })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })

  // ─── Vérification signature Stripe ────────────────────────
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature', { status: 400 })

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    )
  } catch (e) {
    console.error('[stripe-webhook] signature invalide', e)
    return new Response(
      `Webhook signature verification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      { status: 400 },
    )
  }

  // Client service_role (bypass RLS) — seule façon d'écrire dans subscriptions
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const priceMap = buildPriceMap()

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const priceId = subscription.items.data[0]?.price?.id ?? null
        const planInfo = priceId ? priceMap[priceId] : null

        const orgId =
          (subscription.metadata?.organization_id as string | undefined) ??
          (await resolveOrgFromCustomer(supabase, subscription.customer as string))

        if (!orgId) {
          console.warn('[stripe-webhook] no organization_id for', subscription.id)
          break
        }

        await supabase
          .from('subscriptions')
          .update({
            stripe_customer_id:     subscription.customer as string,
            stripe_subscription_id: subscription.id,
            stripe_price_id:        priceId,
            plan:                   planInfo?.plan ?? null,
            billing_period:         planInfo?.billing_period ?? null,
            status:                 subscription.status,
            current_period_end:     toIso(subscription.current_period_end),
            cancel_at_period_end:   subscription.cancel_at_period_end ?? false,
            trial_ends_at:          toIso(subscription.trial_end),
          })
          .eq('organization_id', orgId)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const orgId =
          (subscription.metadata?.organization_id as string | undefined) ??
          (await resolveOrgFromCustomer(supabase, subscription.customer as string))
        if (orgId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('organization_id', orgId)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string | null
        if (customerId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      default:
        // Event ignoré — pas d'erreur, Stripe attend juste un 200.
        break
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', event.type, e)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true, type: event.type }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
