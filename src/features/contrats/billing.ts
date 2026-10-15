import { computeQuoteTotals } from '../devis/constants'
import { addMonths, VISITS_PER_YEAR } from './schemas'
import type { ContractLine, ContractWithDetails } from './schemas'

/**
 * « Facturer le mois » (contrats, étape B) — calcul pur, sans accès réseau.
 *
 * Contrat facturé après chaque visite : une facture par contrat et par mois,
 * qui reprend les visites terminées du mois pas encore facturées. Chaque
 * visite facture ce qui est dû : une prestation de fréquence f (1, 2 ou 4
 * fois par an) est due à la PREMIÈRE visite de chaque tranche de 12/f mois
 * de l'année du contrat (même site si la ligne vise un site, sinon tous les
 * sites du contrat). Une visite supplémentaire dans la même tranche ne
 * refacture donc rien.
 *
 * Contrat facturé d'avance : une facture au début de chaque période
 * (annuelle, semestrielle ou trimestrielle depuis la date de début), proposée
 * le mois où la période commence. Montant = total annuel ÷ nombre d'échéances.
 */

export type BillingVisit = {
  id: string
  contract_id: string
  site_id: string | null
  site_name: string | null
  /** Date de fin de visite (AAAA-MM-JJ) */
  done_on: string
  /** Déjà couverte par une facture non annulée */
  billed: boolean
}

export type BillingInvoiceLine = { description: string; quantity: number; unit_price_ht: number; vat_rate: number }

export type BillingProposal = {
  key: string
  contract: ContractWithDetails
  kind: 'per_visit' | 'advance'
  /** Visites couvertes (après visite) */
  visits: BillingVisit[]
  /** Période facturée (d'avance) */
  periodStart: string | null
  periodEnd: string | null
  /** « Échéance 1/2 » pour les factures d'avance fractionnées */
  installment: string | null
  lines: BillingInvoiceLine[]
  totals: { ht: number; vat: number; ttc: number }
  /** Résumé lisible (liste et notes de la facture) */
  summary: string
}

export type BillingSkip = { key: string; contract: ContractWithDetails; reason: string }

export function frDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty! - fy!) * 12 + (tm! - fm!)
}

function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!, 12)
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Début de la tranche de `stepMonths` mois (comptée depuis `anchor`) qui contient `date` */
export function periodStartFor(anchor: string, stepMonths: number, date: string): string {
  let idx = Math.floor(monthDiff(anchor, date) / stepMonths)
  while (addMonths(anchor, idx * stepMonths) > date) idx--
  while (addMonths(anchor, (idx + 1) * stepMonths) <= date) idx++
  return addMonths(anchor, idx * stepMonths)
}

const round2 = (n: number) => Math.round(n * 100) / 100

function totalsOf(lines: BillingInvoiceLine[]) {
  const t = computeQuoteTotals(lines)
  return { ht: t.total_ht, vat: t.total_vat, ttc: t.total_ttc }
}

/** La ligne est-elle due à cette visite ? (première visite de sa tranche) */
export function isLineDueAtVisit(contract: ContractWithDetails, line: ContractLine, visit: BillingVisit, contractVisits: BillingVisit[]): boolean {
  if (line.site_id && line.site_id !== visit.site_id) return false
  const step = 12 / VISITS_PER_YEAR[line.frequency]
  const start = periodStartFor(contract.start_date, step, visit.done_on)
  const end = addMonths(start, step)
  const first = contractVisits
    .filter((v) => (!line.site_id || v.site_id === line.site_id) && v.done_on >= start && v.done_on < end)
    .sort((a, b) => a.done_on.localeCompare(b.done_on) || a.id.localeCompare(b.id))[0]
  return first?.id === visit.id
}

export function planMonthBilling(
  month: string,
  contracts: ContractWithDetails[],
  visits: BillingVisit[],
  billedPeriods: Set<string>,
): { proposals: BillingProposal[]; skipped: BillingSkip[] } {
  const proposals: BillingProposal[] = []
  const skipped: BillingSkip[] = []

  for (const contract of contracts) {
    if (contract.status === 'draft' || contract.lines.length === 0) continue
    const multiSite = contract.site_ids.length > 1

    if (contract.billing_mode === 'per_visit') {
      const all = visits.filter((v) => v.contract_id === contract.id)
      const toBill = all
        .filter((v) => !v.billed && monthOf(v.done_on) === month)
        .sort((a, b) => a.done_on.localeCompare(b.done_on) || a.id.localeCompare(b.id))
      if (toBill.length === 0) continue

      const lines: BillingInvoiceLine[] = []
      for (const visit of toBill) {
        for (const line of contract.lines) {
          if (line.quantity <= 0 || !isLineDueAtVisit(contract, line, visit, all)) continue
          // Nom du site seulement pour une prestation propre à ce site (une ligne
          // commune couvre déjà tous les sites du contrat)
          const where = multiSite && line.site_id && visit.site_name ? `${visit.site_name} — ` : ''
          const when = toBill.length > 1 ? ` (visite du ${frDate(visit.done_on)})` : ''
          lines.push({ description: `${where}${line.description}${when}`, quantity: Number(line.quantity), unit_price_ht: Number(line.unit_price_ht), vat_rate: Number(line.vat_rate) })
        }
      }
      const visitList = toBill.map((v) => `${frDate(v.done_on)}${v.site_name ? ` (${v.site_name})` : ''}`).join(', ')
      if (lines.length === 0) {
        skipped.push({ key: `${contract.id}|${month}`, contract, reason: `Visite${toBill.length > 1 ? 's' : ''} du ${visitList} : prestations déjà facturées sur la période` })
        continue
      }
      proposals.push({
        key: `${contract.id}|${month}`,
        contract,
        kind: 'per_visit',
        visits: toBill,
        periodStart: null,
        periodEnd: null,
        installment: null,
        lines,
        totals: totalsOf(lines),
        summary: `${toBill.length > 1 ? `${toBill.length} visites` : 'Visite'} du ${visitList}`,
      })
      continue
    }

    // ─── D'avance : la période commence-t-elle ce mois-ci ? ───
    if (contract.status !== 'active' && contract.status !== 'terminated') continue
    const perYear = VISITS_PER_YEAR[contract.billing_frequency]
    const step = 12 / perYear
    const diff = monthDiff(contract.start_date, `${month}-01`)
    if (diff < 0 || diff % step !== 0) continue
    const periodStart = addMonths(contract.start_date, diff)
    if (!contract.tacit_renewal && periodStart >= addMonths(contract.start_date, contract.initial_months)) continue
    if (contract.terminated_on && periodStart >= contract.terminated_on) continue
    const key = `${contract.id}|${periodStart}`
    if (billedPeriods.has(key)) {
      skipped.push({ key, contract, reason: `Échéance du ${frDate(periodStart)} déjà facturée` })
      continue
    }
    const periodEnd = dayBefore(addMonths(periodStart, step))
    const installment = perYear > 1 ? `Échéance ${(diff / step) % perYear + 1}/${perYear}` : null
    const lines = contract.lines
      .filter((l) => l.quantity > 0)
      .map((l) => {
        const visitsPerYear = VISITS_PER_YEAR[l.frequency]
        return {
          description: `${l.description}${visitsPerYear > 1 ? ` — ${visitsPerYear} visites par an` : ''}`,
          quantity: Number(l.quantity),
          unit_price_ht: round2((Number(l.unit_price_ht) * visitsPerYear) / perYear),
          vat_rate: Number(l.vat_rate),
        }
      })
    if (lines.length === 0) continue
    proposals.push({
      key,
      contract,
      kind: 'advance',
      visits: [],
      periodStart,
      periodEnd,
      installment,
      lines,
      totals: totalsOf(lines),
      summary: `${installment ? `${installment} — ` : ''}période du ${frDate(periodStart)} au ${frDate(periodEnd)}`,
    })
  }

  proposals.sort((a, b) => a.contract.client_name.localeCompare(b.contract.client_name, 'fr'))
  return { proposals, skipped }
}
