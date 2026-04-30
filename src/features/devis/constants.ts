import { CheckCircle2, Clock, Edit3, Send, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'expired'

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  refused: 'Refusé',
  expired: 'Expiré',
}

export const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: 'b-gry',
  sent: 'b-org',
  accepted: 'b-grn',
  refused: 'b-red',
  expired: 'b-gry',
}

export const QUOTE_STATUS_ICON: Record<QuoteStatus, LucideIcon> = {
  draft: Edit3,
  sent: Send,
  accepted: CheckCircle2,
  refused: XCircle,
  expired: Clock,
}

export const VAT_RATES = [0, 5.5, 10, 20] as const

export function formatAmount(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * Calcule les totaux d'un ensemble de lignes de devis/facture.
 * Gère la TVA détaillée par taux (obligatoire en V1 pour les factures).
 */
export type QuoteLineCompute = {
  quantity: number
  unit_price_ht: number
  vat_rate: number
}

export type QuoteTotals = {
  total_ht: number
  total_vat: number
  total_ttc: number
  /** TVA détaillée par taux : { '20': 12.5, '10': 3.0 } */
  vat_by_rate: Record<string, number>
  /** HT détaillé par taux (utile sur la facture) */
  ht_by_rate: Record<string, number>
}

export function computeQuoteTotals(lines: QuoteLineCompute[]): QuoteTotals {
  let total_ht = 0
  let total_vat = 0
  const vat_by_rate: Record<string, number> = {}
  const ht_by_rate: Record<string, number> = {}
  for (const line of lines) {
    const lineHt = line.quantity * line.unit_price_ht
    const lineVat = lineHt * (line.vat_rate / 100)
    total_ht += lineHt
    total_vat += lineVat
    const key = String(line.vat_rate)
    vat_by_rate[key] = (vat_by_rate[key] ?? 0) + lineVat
    ht_by_rate[key] = (ht_by_rate[key] ?? 0) + lineHt
  }
  return {
    total_ht: round2(total_ht),
    total_vat: round2(total_vat),
    total_ttc: round2(total_ht + total_vat),
    vat_by_rate: Object.fromEntries(Object.entries(vat_by_rate).map(([k, v]) => [k, round2(v)])),
    ht_by_rate: Object.fromEntries(Object.entries(ht_by_rate).map(([k, v]) => [k, round2(v)])),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
