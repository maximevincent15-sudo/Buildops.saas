import { listQuotes } from '../devis/api'
import type { Quote } from '../devis/schemas'
import { listInvoices } from '../factures/api'
import type { Invoice } from '../factures/schemas'
import { effectiveStatus } from '../factures/constants'
import { listInterventions } from '../planning/api'
import type { Intervention } from '../planning/schemas'
import { supabase } from '../../shared/lib/supabase'

export type BusinessStats = {
  // KPIs principales
  caEncaisseMonth: number          // total_ttc des factures soldées du mois
  caEncaissePrevMonth: number      // mois précédent (pour évolution %)
  caImpaye: number                  // reste à payer sur factures sent/partial/overdue
  caEnRetard: number                // reste à payer sur factures overdue uniquement
  acceptanceRate: number | null     // % devis acceptés / (acceptés + refusés)
  acceptanceTotal: number           // base de calcul (nb de réponses)
  averagePaymentDays: number | null // délai moyen paiement (jours)
  // Top clients
  topClients: Array<{ name: string; amount: number; count: number }>
  // Top techniciens
  topTechnicians: Array<{ name: string; amount: number; count: number }>
  // Évolution mensuelle (12 derniers mois)
  monthlyRevenue: Array<{ key: string; label: string; amount: number }>
}

function isoMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { month: 'short' })
}

export async function fetchBusinessStats(): Promise<BusinessStats> {
  const [invoices, quotes, interventions] = await Promise.all([
    listInvoices(),
    listQuotes(),
    listInterventions(),
  ])

  return computeBusinessStats(invoices, quotes, interventions)
}

export function computeBusinessStats(
  invoices: Invoice[],
  quotes: Quote[],
  interventions: Intervention[],
): BusinessStats {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  // Enrichit avec statut effectif (overdue auto)
  const enrichedInvoices = invoices.map((i) => ({
    ...i,
    eff: effectiveStatus(
      i.status,
      i.due_date,
      Number(i.amount_paid ?? 0),
      Number(i.total_ttc ?? 0),
    ),
  }))

  // ─── CA encaissé ────────────────────────────────────────────────
  const inDateRange = (iso: string | null, start: Date, end: Date): boolean => {
    if (!iso) return false
    const d = new Date(iso)
    return d >= start && d <= end
  }

  const caEncaisseMonth = enrichedInvoices
    .filter((i) => i.eff === 'paid' && inDateRange(i.paid_at, thisMonthStart, thisMonthEnd))
    .reduce((sum, i) => sum + Number(i.total_ttc), 0)

  const caEncaissePrevMonth = enrichedInvoices
    .filter((i) => i.eff === 'paid' && inDateRange(i.paid_at, prevMonthStart, prevMonthEnd))
    .reduce((sum, i) => sum + Number(i.total_ttc), 0)

  // ─── Impayés / Retards ────────────────────────────────────────
  const caImpaye = enrichedInvoices
    .filter((i) => i.eff === 'sent' || i.eff === 'partially_paid' || i.eff === 'overdue')
    .reduce((sum, i) => sum + (Number(i.total_ttc) - Number(i.amount_paid ?? 0)), 0)

  const caEnRetard = enrichedInvoices
    .filter((i) => i.eff === 'overdue')
    .reduce((sum, i) => sum + (Number(i.total_ttc) - Number(i.amount_paid ?? 0)), 0)

  // ─── Taux d'acceptation des devis ─────────────────────────────
  const accepted = quotes.filter((q) => q.status === 'accepted').length
  const refused = quotes.filter((q) => q.status === 'refused').length
  const acceptanceTotal = accepted + refused
  const acceptanceRate = acceptanceTotal > 0 ? (accepted / acceptanceTotal) * 100 : null

  // ─── Délai moyen de paiement ──────────────────────────────────
  const paidWithDates = enrichedInvoices.filter(
    (i) => i.eff === 'paid' && i.paid_at && i.issue_date,
  )
  const averagePaymentDays =
    paidWithDates.length > 0
      ? paidWithDates.reduce((sum, i) => {
          const issued = new Date(i.issue_date)
          const paid = new Date(i.paid_at!)
          return sum + (paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)
        }, 0) / paidWithDates.length
      : null

  // ─── Top clients (toutes factures émises non annulées) ────────
  const clientsMap = new Map<string, { amount: number; count: number }>()
  for (const i of enrichedInvoices) {
    if (i.eff === 'cancelled' || i.eff === 'draft') continue
    const cur = clientsMap.get(i.client_name) ?? { amount: 0, count: 0 }
    cur.amount += Number(i.total_ttc)
    cur.count += 1
    clientsMap.set(i.client_name, cur)
  }
  const topClients = Array.from(clientsMap.entries())
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // ─── Top techniciens (via intervention_id de la facture) ──────
  // On joint invoices.intervention_id → interventions.technician_name
  const interventionById = new Map(interventions.map((iv) => [iv.id, iv]))
  const techsMap = new Map<string, { amount: number; count: number }>()
  for (const i of enrichedInvoices) {
    if (i.eff === 'cancelled' || i.eff === 'draft') continue
    if (!i.intervention_id) continue
    const interv = interventionById.get(i.intervention_id)
    if (!interv?.technician_name) continue
    const cur = techsMap.get(interv.technician_name) ?? { amount: 0, count: 0 }
    cur.amount += Number(i.total_ttc)
    cur.count += 1
    techsMap.set(interv.technician_name, cur)
  }
  const topTechnicians = Array.from(techsMap.entries())
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // ─── Évolution mensuelle (12 derniers mois) ───────────────────
  const monthlyMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthlyMap.set(isoMonthKey(d), 0)
  }
  for (const inv of enrichedInvoices) {
    if (inv.eff !== 'paid' || !inv.paid_at) continue
    const d = new Date(inv.paid_at)
    const key = isoMonthKey(d)
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(inv.total_ttc))
    }
  }
  const monthlyRevenue = Array.from(monthlyMap.entries()).map(([key, amount]) => {
    const [year, month] = key.split('-').map(Number)
    const d = new Date(year, month - 1, 1)
    return {
      key,
      label: monthLabel(d),
      amount,
    }
  })

  return {
    caEncaisseMonth,
    caEncaissePrevMonth,
    caImpaye,
    caEnRetard,
    acceptanceRate,
    acceptanceTotal,
    averagePaymentDays,
    topClients,
    topTechnicians,
    monthlyRevenue,
  }
}

// Pour un fetch léger côté Sidebar / autres widgets si besoin
export async function getBusinessStatsLight() {
  // Reuse: simple wrapper, peut être étendu pour limiter le payload
  return fetchBusinessStats()
}

// Fallback gracieux : si les tables quotes/invoices n'existent pas encore
// (migrations 018/019 pas appliquées), retourne des stats vides au lieu de crash.
export async function fetchBusinessStatsSafe(): Promise<BusinessStats | null> {
  try {
    return await fetchBusinessStats()
  } catch (err) {
    if (err instanceof Error && /quotes|invoices|relation .* does not exist/i.test(err.message)) {
      console.warn('Migrations 018/019 non appliquées — KPIs CA désactivés.', err.message)
      return null
    }
    throw err
  }
}

// Convenience export pour compat (au cas où on veut requêter une seule table directement)
export { supabase }
