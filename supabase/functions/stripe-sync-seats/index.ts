// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : aligne la quantité de l'abonnement Stripe sur le
// nombre de techniciens actifs (formules facturées par technicien).
//
// Appelée par :
//   1. le trigger technicians_sync_seats (pg_net, après commit) à chaque
//      ajout, retrait, activation ou désactivation → { organization_id }
//   2. le cron quotidien firovia-seats-sync → { all: true }
//
// Idempotente : recompte toujours depuis la base et ne touche à Stripe que si
// la quantité diffère. Un appel externe ne peut donc qu'aligner la facture
// sur la réalité.
//
// Prorata (art. 6 des CGV) :
//   • mensuel : ajustement au prorata sur la facture suivante
//   • annuel  : facture immédiate au prorata pour un ajout, crédit déduit
//               des factures suivantes pour un retrait
// Le minimum facturé de chaque formule est porté par le premier palier du
// prix Stripe : 1 ou 2 techniciens coûtent le même prix en Essentiel.
//
// Déploiement :
//   supabase functions deploy stripe-sync-seats --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { checkRateLimit } from '../_shared/rateLimit.ts'

interface RequestBody {
  organization_id?: string
  all?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function syncOne(stripe: Stripe, supabase, sub: { organization_id: string; stripe_subscription_id: string }) {
  const { count, error } = await supabase
    .from('technicians')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', sub.organization_id)
    .eq('active', true)
  if (error) throw error
  const quantity = Math.max(1, count ?? 0)

  const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
  if (['canceled', 'incomplete_expired'].includes(subscription.status)) {
    return { organization_id: sub.organization_id, skipped: subscription.status }
  }
  const item = subscription.items.data[0]
  if (!item || item.price?.billing_scheme !== 'tiered') {
    return { organization_id: sub.organization_id, skipped: 'not_seat_based' }
  }

  const current = item.quantity ?? 1
  if (current !== quantity) {
    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: item.id, quantity }],
      proration_behavior: item.price.recurring?.interval === 'year' ? 'always_invoice' : 'create_prorations',
    })
  }

  await supabase
    .from('subscriptions')
    .update({ seats: quantity })
    .eq('organization_id', sub.organization_id)

  return { organization_id: sub.organization_id, from: current, to: quantity }
}

serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
  if (!STRIPE_SECRET_KEY) return jsonResponse({ error: 'stripe_not_configured' }, 503)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }
  if (!body.all && !(typeof body.organization_id === 'string' && UUID_RE.test(body.organization_id))) {
    return jsonResponse({ error: 'missing_organization_id' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Un import de 30 techniciens = 30 appels : le premier aligne tout, les
  // suivants ne font qu'un comptage. La limite protège Stripe des abus.
  const rl = await checkRateLimit(supabase, {
    bucket: body.all ? 'stripe-sync-seats:all' : `stripe-sync-seats:org:${body.organization_id}`,
    limit: body.all ? 2 : 60,
    windowSeconds: 60,
  })
  if (!rl.ok) return jsonResponse({ error: 'rate_limited', retry_after_s: rl.retryAfterS }, 429)

  let query = supabase
    .from('subscriptions')
    .select('organization_id, stripe_subscription_id')
    .eq('seat_based', true)
    .not('stripe_subscription_id', 'is', null)
    .in('status', ['active', 'past_due'])
  if (!body.all) query = query.eq('organization_id', body.organization_id)

  const { data: subs, error } = await query
  if (error) {
    console.error('[stripe-sync-seats] lecture subscriptions', error)
    return jsonResponse({ error: 'internal_error' }, 500)
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  const results = []
  for (const sub of subs ?? []) {
    try {
      results.push(await syncOne(stripe, supabase, sub))
    } catch (e) {
      console.error('[stripe-sync-seats] échec', sub.organization_id, e)
      results.push({ organization_id: sub.organization_id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return jsonResponse({ synced: results }, 200)
})
