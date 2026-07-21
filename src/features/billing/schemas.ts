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

export type Plan = 'starter' | 'pro'
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
  created_at: string
  updated_at: string
}

// Vue "PlanOffer" utilisée dans l'UI (page /abonnement + PlanCard).

export interface PlanPrice {
  priceId: string
  amount: number
  per: 'mois' | 'an'
}

export interface PlanOffer {
  plan: Plan
  label: string
  tagline: string
  prices: {
    monthly: PlanPrice
    yearly: PlanPrice
  }
  features: string[]
  /** Mise en avant visuelle (bord bleu, badge "Recommandé") */
  accent: boolean
}
