import { supabase } from '../../shared/lib/supabase'
import type { Subscription } from './schemas'

/**
 * Charge l'abonnement de l'organisation courante.
 * RLS filtre automatiquement sur current_user_organization_id().
 */
export async function fetchSubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data as Subscription | null
}

/**
 * Crée une Stripe Checkout Session et renvoie l'URL vers laquelle rediriger
 * le user. Il paye chez Stripe, puis retour sur /abonnement?status=success.
 */
export async function createCheckoutSession(priceId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { priceId },
  })
  if (error) throw error
  const url = (data as { url?: string })?.url
  if (!url) throw new Error('URL Checkout Stripe manquante dans la réponse')
  return url
}

/**
 * Ouvre le Customer Portal Stripe. L'utilisateur peut y :
 *  - changer sa carte bancaire
 *  - télécharger ses factures
 *  - annuler ou réactiver son abo
 *  - changer de plan (si configuré côté Stripe)
 * Renvoie l'URL vers laquelle rediriger.
 */
export async function createPortalSession(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-portal', {
    body: {},
  })
  if (error) throw error
  const url = (data as { url?: string })?.url
  if (!url) throw new Error('URL Portail Stripe manquante dans la réponse')
  return url
}
