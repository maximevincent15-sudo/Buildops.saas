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

/** Nombre de techniciens actifs de l'organisation (= techniciens facturés). */
export async function countActiveTechnicians(): Promise<number> {
  const { count, error } = await supabase
    .from('technicians')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
  if (error) throw error
  return count ?? 0
}

/** Comptes de l'équipe : membres + invitations en attente non expirées (comme la limite SQL) */
export async function countTeamAccounts(): Promise<number> {
  const now = new Date().toISOString()
  const [members, pending] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('organization_invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', now),
  ])
  if (members.error) throw members.error
  if (pending.error) throw pending.error
  return (members.count ?? 0) + (pending.count ?? 0)
}

/**
 * Crée une Stripe Checkout Session et renvoie l'URL vers laquelle rediriger
 * le user. Il paye chez Stripe, puis retour sur /abonnement?status=success.
 */
export async function createCheckoutSession(priceId: string, cgvVersion: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { priceId, cgvVersion },
  })
  if (error) {
    // Plus de comptes que la formule n'en inclut : message clair plutôt que l'erreur brute
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    if (body?.error === 'too_many_accounts') {
      const n = Number(body.missing_technicians) || 1
      throw new Error(
        `Votre équipe compte ${body.accounts} comptes, cette formule en inclut ${body.account_limit}. `
        + `Ajoutez ${n} technicien${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''} dans Techniciens (facturé${n > 1 ? 's' : ''}), `
        + 'ou retirez des comptes dans Équipe, puis réessayez.',
      )
    }
    throw error
  }
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

export type StripeInvoice = {
  id: string
  number: string | null
  created: number
  period_start: number | null
  period_end: number | null
  total: number
  amount_due: number
  currency: string
  status: 'open' | 'paid' | 'void' | 'uncollectible'
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

/**
 * Factures Stripe de l'organisation (rubrique « Mes factures »).
 * Réservé aux administrateurs ; renvoie [] si l'org n'est jamais passée
 * par Stripe (essai, accès offert).
 */
export async function listStripeInvoices(): Promise<StripeInvoice[]> {
  const { data, error } = await supabase.functions.invoke('stripe-invoices', { body: {} })
  if (error) throw error
  return ((data as { invoices?: StripeInvoice[] })?.invoices ?? [])
}
