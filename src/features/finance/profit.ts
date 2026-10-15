import { normalizeSearch } from '../../shared/lib/search'

/**
 * Rentabilité mois par mois, à partir de ce que Firovia connaît :
 *   CA encaissé HT − notes de frais HT − achats − charges fixes
 * Les achats sont estimés avec le prix d'achat du catalogue (lignes de
 * facture dont la désignation correspond à un article). Les charges fixes
 * sont celles saisies aujourd'hui dans Paramètres, appliquées à chaque mois
 * à partir du premier mois d'activité enregistré.
 */

export type PaidInvoice = { id: string; total_ht: number; paid_at: string }
export type InvoiceLineLite = { invoice_id: string; description: string; quantity: number }
export type ExpenseLite = { spent_on: string; amount_ttc: number; vat_rate: number }
export type CatalogCost = { label: string; purchase_price_ht: number }

export type MonthProfit = {
  caHt: number
  expensesHt: number
  purchasesHt: number
  marginHt: number
  /** null tant qu'aucune charge fixe n'est renseignée */
  fixedCosts: number | null
  resultHt: number | null
}

export function monthKey(iso: string): string {
  // paid_at (timestamp) comme spent_on (date) : mois civil local
  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function computeMonthlyProfit(
  monthKeys: string[],
  invoices: PaidInvoice[],
  lines: InvoiceLineLite[],
  expenses: ExpenseLite[],
  catalog: CatalogCost[],
  fixedMonthly: number | null,
): Map<string, MonthProfit> {
  const result = new Map<string, MonthProfit>()
  for (const key of monthKeys) {
    result.set(key, { caHt: 0, expensesHt: 0, purchasesHt: 0, marginHt: 0, fixedCosts: fixedMonthly, resultHt: null })
  }

  const costByLabel = new Map<string, number>()
  for (const c of catalog) {
    if (c.purchase_price_ht > 0) costByLabel.set(normalizeSearch(c.label), c.purchase_price_ht)
  }

  const invoiceMonth = new Map<string, string>()
  for (const inv of invoices) {
    const m = result.get(monthKey(inv.paid_at))
    if (!m) continue
    m.caHt += Number(inv.total_ht) || 0
    invoiceMonth.set(inv.id, monthKey(inv.paid_at))
  }

  for (const l of lines) {
    const key = invoiceMonth.get(l.invoice_id)
    const unitCost = costByLabel.get(normalizeSearch(l.description))
    if (!key || unitCost === undefined) continue
    result.get(key)!.purchasesHt += unitCost * (Number(l.quantity) || 0)
  }

  for (const e of expenses) {
    const m = result.get(monthKey(e.spent_on))
    if (!m) continue
    const rate = Number(e.vat_rate) || 0
    m.expensesHt += (Number(e.amount_ttc) || 0) / (1 + rate / 100)
  }

  // Avant le premier mois d'activité dans Firovia (ni encaissement ni frais),
  // on ne sait rien : pas de charges fixes déduites, donc pas de fausse perte.
  let started = false
  for (const key of monthKeys) {
    const m = result.get(key)!
    started ||= m.caHt > 0 || m.expensesHt > 0
    m.marginHt = m.caHt - m.expensesHt - m.purchasesHt
    if (!started) m.fixedCosts = null
    m.resultHt = m.fixedCosts === null ? null : m.marginHt - m.fixedCosts
  }
  return result
}
