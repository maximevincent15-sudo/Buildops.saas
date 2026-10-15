import type { Plan, BillingPeriod, PlanOffer } from './schemas'

// Les price IDs sont exposés côté client (public, Stripe s'attend à ce qu'ils
// le soient). Seule la clé secrète Stripe reste server-side (Edge Function).

// Version des CGV en vigueur (firovia.fr/cgv.html) — à mettre à jour à chaque
// modification des CGV. Transmise à Stripe comme preuve d'acceptation.
export const CGV_VERSION = '2026-10-15'
export const CGV_URL = 'https://firovia.fr/cgv.html'

// Identité légale de Firovia (émetteur des devis d'abonnement)
export const FIROVIA_ISSUER = {
  legalName: 'Maxime Vincent EI',
  signatory: 'Maxime Vincent',
  address: '15 Rue Charles Edouard Jeanneret, 78300 Poissy',
  siret: '106 429 749 00018',
  email: 'contact@firovia.fr',
  vatMention: 'TVA non applicable, art. 293 B du CGI',
} as const

// Prix Stripe « progressifs » créés le 13/10/2026 : premier palier = forfait
// minimum, puis prix par technicien, dégressif à partir du 11e.
const PRICE_ESSENTIEL_MONTHLY = 'price_1UQ13C2KbFmYQD88IgXAJzkb'
const PRICE_ESSENTIEL_YEARLY = 'price_1UQ15a2KbFmYQD88Yv284sG1'
const PRICE_PRO_MONTHLY = 'price_1UQ18Y2KbFmYQD88467baI77'
const PRICE_PRO_YEARLY = 'price_1UQ19a2KbFmYQD88wfLBT8Ap'

/** Rang du premier technicien au tarif dégressif */
export const SEAT_DISCOUNT_FROM = 11

// Formules en libre-service. Liste alignée sur firovia.fr/tarifs
// (référence contractuelle des CGV).
export const PLAN_OFFERS: PlanOffer[] = [
  {
    plan: 'essentiel',
    label: 'Essentiel',
    tagline: 'Tout le terrain, du planning à la facture',
    minSeats: 2,
    officeAccounts: 2,
    prices: {
      monthly: { priceId: PRICE_ESSENTIEL_MONTHLY, unit: 49, unitAfter10: 39, per: 'mois' },
      yearly: { priceId: PRICE_ESSENTIEL_YEARLY, unit: 490, unitAfter10: 390, per: 'an' },
    },
    features: [
      'Planning + rapports terrain mobile',
      'Registres équipements format APSAD',
      'Visites préventives programmées automatiquement',
      'Contrats de maintenance : échéances, révision, facturation du mois en un clic',
      'Alertes échéances',
      "Devis & factures illimités, catalogue d'articles",
      'Export comptable pour votre expert-comptable',
      'Envoi automatique par email',
      'Portail client',
      'Reprise de vos données incluse',
      'Support email',
      'Hébergement UE, export de vos données à tout moment',
    ],
    accent: false,
  },
  {
    plan: 'pro',
    label: 'Pro',
    tagline: "Le terrain + le pilotage de l'activité",
    minSeats: 3,
    officeAccounts: 5,
    prices: {
      monthly: { priceId: PRICE_PRO_MONTHLY, unit: 69, unitAfter10: 59, per: 'mois' },
      yearly: { priceId: PRICE_PRO_YEARLY, unit: 690, unitAfter10: 590, per: 'an' },
    },
    features: [
      'Tout le plan Essentiel, plus :',
      'Pilotage business (CA, impayés)',
      'Tops clients / techniciens',
      'Évolution du CA, marge et bénéfice estimés',
      'Temps passé réel par intervention',
      'Export paie (heures sup, frais)',
      'Support prioritaire',
    ],
    accent: true,
  },
]

/** Libellés de toutes les formules, y compris les anciennes formules forfaitaires */
export const PLAN_LABELS: Record<Plan, string> = {
  essentiel: 'Essentiel',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Entreprise',
}

// ─── Droits par formule ─────────────────────────────────────
// Abonnement par technicien (seat_based) : pas de limite, chaque technicien
// actif est facturé (cf. useSubscription). Starter 5 et Pro forfaitaire 20 :
// anciennes formules, aussi appliquées en base (technician_limit_for_org).
export const PLAN_LIMITS: Record<Plan, { maxTechnicians: number | null; proFeatures: boolean }> = {
  essentiel: { maxTechnicians: null, proFeatures: false },
  starter: { maxTechnicians: 5, proFeatures: false },
  pro: { maxTechnicians: 20, proFeatures: true },
  enterprise: { maxTechnicians: null, proFeatures: true },
}

/**
 * Formule effective pour les droits : l'essai donne le niveau Pro (sans limite
 * de techniciens, cf. useSubscription) ; une
 * formule inconnue (ou abonnement introuvable) → Pro (fail open).
 */
export function effectiveTier(sub: { status: string; plan: Plan | null } | null): Plan {
  if (!sub || sub.status === 'trialing') return 'pro'
  return sub.plan ?? 'pro'
}

export function getOffer(plan: Plan): PlanOffer | null {
  return PLAN_OFFERS.find((o) => o.plan === plan) ?? null
}

/** Nombre de techniciens facturés : les techniciens actifs, au minimum celui de la formule. */
export function billedSeats(offer: PlanOffer, technicians: number): number {
  return Math.max(offer.minSeats, Math.round(technicians))
}

/**
 * Montant HT d'une formule pour un nombre de techniciens actifs, identique au
 * calcul des paliers Stripe (forfait minimum, puis prix par technicien,
 * dégressif à partir du 11e).
 */
export function computePlanTotal(offer: PlanOffer, period: BillingPeriod, technicians: number): number {
  const price = offer.prices[period]
  const seats = billedSeats(offer, technicians)
  const full = Math.min(seats, SEAT_DISCOUNT_FROM - 1)
  return full * price.unit + (seats - full) * price.unitAfter10
}

/**
 * Comptes de connexion autorisés (CGV art. 4) : un par technicien facturé +
 * les comptes bureau de la formule. null = pas de limite (essai, anciennes
 * formules, accès offerts). Aligné sur account_limit_for_org (SQL).
 */
export function computeAccountLimit(
  sub: { status: string; plan: Plan | null; seat_based: boolean } | null,
  technicians: number,
): number | null {
  if (!sub || sub.status === 'trialing' || !sub.seat_based || !sub.plan) return null
  const offer = getOffer(sub.plan)
  if (!offer) return null
  return billedSeats(offer, technicians) + offer.officeAccounts
}

// Économie affichée sur l'annuel (12 x mensuel - annuel) = 2 mois offerts.
export function computeYearlySavings(offer: PlanOffer, technicians: number): number {
  return computePlanTotal(offer, 'monthly', technicians) * 12 - computePlanTotal(offer, 'yearly', technicians)
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
