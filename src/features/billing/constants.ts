import type { Plan, BillingPeriod, PlanOffer } from './schemas'

// Les price IDs sont exposés côté client (public, Stripe s'attend à ce qu'ils
// le soient). Seule la clé secrète Stripe reste server-side (Edge Function).
// Ces IDs correspondent aux Prices créés dans le Dashboard Stripe le 30/06/2026.

const PRICE_STARTER_MONTHLY = 'price_1Tnx8a2KbFmYQD889c1DfKJC'
const PRICE_STARTER_YEARLY = 'price_1Tnx2o2KbFmYQD886Fw6uOlk'
const PRICE_PRO_MONTHLY = 'price_1TnxJX2KbFmYQD88TyrumqBu'
const PRICE_PRO_YEARLY = 'price_1TnxIc2KbFmYQD88vYU0K21o'

export const PLAN_OFFERS: PlanOffer[] = [
  {
    plan: 'starter',
    label: 'Starter',
    tagline: 'Pour les PME de 1 à 5 techniciens',
    prices: {
      monthly: { priceId: PRICE_STARTER_MONTHLY, amount: 299, per: 'mois' },
      yearly: { priceId: PRICE_STARTER_YEARLY, amount: 2990, per: 'an' },
    },
    features: [
      'Jusqu\'à 5 techniciens',
      'Planning centralisé',
      'Rapports terrain mobile',
      'Registre APSAD automatique',
      'Devis & factures illimités',
      'Envoi email automatique',
      'Support par email',
      'Hébergement France (RGPD)',
    ],
    accent: false,
  },
  {
    plan: 'pro',
    label: 'Pro',
    tagline: 'Pour les PME de 6 à 20 techniciens',
    prices: {
      monthly: { priceId: PRICE_PRO_MONTHLY, amount: 499, per: 'mois' },
      yearly: { priceId: PRICE_PRO_YEARLY, amount: 4990, per: 'an' },
    },
    features: [
      'Tout de Starter, plus :',
      'Jusqu\'à 20 techniciens',
      'Multi-sites avancé',
      'Exports comptables',
      'Support prioritaire',
      'Onboarding humain 1h',
      'Intégrations à venir',
    ],
    accent: true,
  },
]

export function getOffer(plan: Plan): PlanOffer | null {
  return PLAN_OFFERS.find((o) => o.plan === plan) ?? null
}

export function getPriceId(plan: Plan, period: BillingPeriod): string {
  const offer = getOffer(plan)
  if (!offer) throw new Error(`Plan inconnu : ${plan}`)
  return offer.prices[period].priceId
}

// Économie affichée sur l'annuel (12 x mensuel - annuel). Convention : ~17%.
export function computeYearlySavings(offer: PlanOffer): number {
  return offer.prices.monthly.amount * 12 - offer.prices.yearly.amount
}

// Nombre de jours restants dans le trial (peut être négatif si expiré).
export function computeTrialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null
  const end = new Date(trialEndsAt).getTime()
  const now = Date.now()
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.ceil((end - now) / msPerDay)
}

export function trialUrgency(daysLeft: number | null): 'safe' | 'warning' | 'urgent' | 'expired' {
  if (daysLeft === null) return 'safe'
  if (daysLeft <= 0) return 'expired'
  if (daysLeft <= 2) return 'urgent'
  if (daysLeft <= 7) return 'warning'
  return 'safe'
}
