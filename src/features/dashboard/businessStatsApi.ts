import { listQuotes } from '../devis/api'
import type { Quote } from '../devis/schemas'
import { listInvoices } from '../factures/api'
import type { Invoice } from '../factures/schemas'
import { docEffectiveStatus, isCreditNote, netTotalTtc, remainingDue } from '../factures/constants'
import { listInterventions } from '../planning/api'
import type { Intervention } from '../planning/schemas'
import { supabase } from '../../shared/lib/supabase'
import { listVisitsToInvoice } from '../factures/visitBilling'
import { listTechnicians } from '../technicians/api'
import { technicianFullName } from '../technicians/schemas'
import type { Technician } from '../technicians/schemas'

export type BusinessStats = {
  // KPIs principales
  caEncaisseMonth: number          // total_ttc des factures soldées du mois
  caEncaissePrevMonth: number      // mois précédent (pour évolution %)
  caImpaye: number                  // reste à payer sur factures sent/partial/overdue
  caEnRetard: number                // reste à payer sur factures overdue uniquement
  acceptanceRate: number | null     // % devis acceptés / (acceptés + refusés)
  acceptanceTotal: number           // base de calcul (nb de réponses)
  averagePaymentDays: number | null // délai moyen paiement (jours)
  visitsToInvoice: number           // visites terminées (rapport finalisé), hors contrat, sans facture
  // Top clients
  topClients: Array<{ name: string; amount: number; count: number }>
  // CA par technicien : tous les techniciens actifs (même à 0 €) + les anciens qui ont du CA
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
  const [invoices, quotes, interventions, visitsToInvoice, technicians] = await Promise.all([
    listInvoices(),
    listQuotes(),
    listInterventions(),
    listVisitsToInvoice().catch(() => []),
    listTechnicians().catch(() => [] as Technician[]),
  ])

  return computeBusinessStats(invoices, quotes, interventions, visitsToInvoice.length, technicians)
}

export function computeBusinessStats(
  invoices: Invoice[],
  quotes: Quote[],
  interventions: Intervention[],
  visitsToInvoice = 0,
  technicians: Technician[] = [],
): BusinessStats {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  // Factures seules (les avoirs sont déjà déduits de leur facture), statut effectif (overdue auto)
  const enrichedInvoices = invoices.filter((i) => !isCreditNote(i)).map((i) => ({
    ...i,
    eff: docEffectiveStatus(i),
    net: netTotalTtc(i),
  }))

  // ─── CA encaissé ────────────────────────────────────────────────
  const inDateRange = (iso: string | null, start: Date, end: Date): boolean => {
    if (!iso) return false
    const d = new Date(iso)
    return d >= start && d <= end
  }

  const caEncaisseMonth = enrichedInvoices
    .filter((i) => i.eff === 'paid' && inDateRange(i.paid_at, thisMonthStart, thisMonthEnd))
    .reduce((sum, i) => sum + i.net, 0)

  const caEncaissePrevMonth = enrichedInvoices
    .filter((i) => i.eff === 'paid' && inDateRange(i.paid_at, prevMonthStart, prevMonthEnd))
    .reduce((sum, i) => sum + i.net, 0)

  // ─── Impayés / Retards ────────────────────────────────────────
  const caImpaye = enrichedInvoices
    .filter((i) => i.eff === 'sent' || i.eff === 'partially_paid' || i.eff === 'overdue')
    .reduce((sum, i) => sum + remainingDue(i), 0)

  const caEnRetard = enrichedInvoices
    .filter((i) => i.eff === 'overdue')
    .reduce((sum, i) => sum + remainingDue(i), 0)

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
    cur.amount += i.net
    cur.count += 1
    clientsMap.set(i.client_name, cur)
  }
  const topClients = Array.from(clientsMap.entries())
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // ─── CA par technicien (via intervention_id de la facture) ────
  // Tous les techniciens, pas seulement un top 5 : les techniciens actifs
  // apparaissent même sans facture (0 €), les anciens seulement s'ils ont
  // du CA. Clé = technician_id (repli sur le nom pour les anciennes
  // interventions sans id).
  const interventionById = new Map(interventions.map((iv) => [iv.id, iv]))
  const techNameById = new Map(technicians.map((t) => [t.id, technicianFullName(t)]))
  const techsMap = new Map<string, { name: string; amount: number; count: number }>()
  for (const i of enrichedInvoices) {
    if (i.eff === 'cancelled' || i.eff === 'draft') continue
    if (!i.intervention_id) continue
    const interv = interventionById.get(i.intervention_id)
    if (!interv?.technician_name && !interv?.technician_id) continue
    const key = interv.technician_id ?? `nom:${interv.technician_name}`
    const name = (interv.technician_id && techNameById.get(interv.technician_id)) || interv.technician_name || '?'
    const cur = techsMap.get(key) ?? { name, amount: 0, count: 0 }
    cur.amount += i.net
    cur.count += 1
    techsMap.set(key, cur)
  }
  for (const t of technicians) {
    if (!t.active || techsMap.has(t.id)) continue
    techsMap.set(t.id, { name: technicianFullName(t), amount: 0, count: 0 })
  }
  const topTechnicians = Array.from(techsMap.values())
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fr'))

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
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + inv.net)
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
    visitsToInvoice,
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
