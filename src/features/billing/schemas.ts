// Types miroir de la table public.subscriptions (voir migration
// 20260630120000_create_subscriptions_table.sql).

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'

export type Plan = 'essentiel' | 'starter' | 'pro' | 'enterprise'
export type BillingPeriod = 'monthly' | 'yearly'

export interface Subscription {
  id: string
  organization_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  plan: Plan | null
  billing_period: BillingPeriod | null
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  /** Abonnement facturé par technicien actif (prix Stripe à paliers) */
  seat_based: boolean
  /** Nombre de techniciens facturés sur l'abonnement Stripe */
  seats: number | null
  created_at: string
  updated_at: string
}

// Vue "PlanOffer" utilisée dans l'UI (page /abonnement + PlanCard).

/** Prix d'une formule facturée par technicien actif, pour une périodicité. */
export interface PlanPrice {
  priceId: string
  /** Prix HT par technicien, du 1er au 10e */
  unit: number
  /** Prix HT par technicien à partir du 11e */
  unitAfter10: number
  per: 'mois' | 'an'
}

export interface PlanOffer {
  plan: Plan
  label: string
  tagline: string
  /** Nombre minimum de techniciens facturés */
  minSeats: number
  /** Comptes bureau inclus, en plus d'un compte par technicien facturé */
  officeAccounts: number
  prices: {
    monthly: PlanPrice
    yearly: PlanPrice
  }
  features: string[]
  /** Mise en avant visuelle (bord bleu, badge "Recommandé") */
  accent: boolean
}
