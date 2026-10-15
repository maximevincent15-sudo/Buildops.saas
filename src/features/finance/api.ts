import { supabase } from '../../shared/lib/supabase'
import { computeMonthlyProfit } from './profit'
import type { CatalogCost, ExpenseLite, InvoiceLineLite, MonthProfit, PaidInvoice } from './profit'

export type FixedCost = {
  id: string
  label: string
  monthly_amount: number
  position: number
}

export type FixedCostInput = { label: string; monthly_amount: number }

/** Charges fixes de l'organisation (RLS : administrateurs uniquement) */
export async function listFixedCosts(): Promise<FixedCost[]> {
  const { data, error } = await supabase
    .from('organization_fixed_costs')
    .select('id, label, monthly_amount, position')
    .order('position')
  if (error) throw error
  return ((data ?? []) as FixedCost[]).map((c) => ({ ...c, monthly_amount: Number(c.monthly_amount) }))
}

/** Remplace toute la liste (quelques lignes : plus simple qu'un diff) */
export async function saveFixedCosts(organizationId: string, rows: FixedCostInput[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('organization_fixed_costs')
    .delete()
    .eq('organization_id', organizationId)
  if (delErr) throw delErr
  if (rows.length === 0) return
  const { error } = await supabase
    .from('organization_fixed_costs')
    .insert(rows.map((r, i) => ({ organization_id: organizationId, label: r.label.trim(), monthly_amount: r.monthly_amount, position: i })))
  if (error) throw error
}

const ID_CHUNK = 150

/** Rentabilité des mois demandés (clés AAAA-MM, du plus ancien au plus récent) */
export async function fetchMonthlyProfit(monthKeys: string[]): Promise<Map<string, MonthProfit>> {
  if (monthKeys.length === 0) return new Map()
  const since = `${monthKeys[0]}-01`

  const [invRes, expRes, catRes, fixed] = await Promise.all([
    supabase.from('invoices').select('id, total_ht, paid_at').eq('status', 'paid').gte('paid_at', since),
    supabase.from('expenses').select('spent_on, amount_ttc, vat_rate').neq('status', 'rejected').gte('spent_on', since),
    supabase.from('catalog_items').select('label, purchase_price_ht').not('purchase_price_ht', 'is', null),
    listFixedCosts().catch(() => [] as FixedCost[]),
  ])
  if (invRes.error) throw invRes.error
  if (expRes.error) throw expRes.error
  if (catRes.error) throw catRes.error

  const invoices = ((invRes.data ?? []) as PaidInvoice[]).filter((i) => !!i.paid_at)
  const catalog = (catRes.data ?? []) as CatalogCost[]

  // Lignes des factures payées : utiles seulement si le catalogue a des prix d'achat
  const lines: InvoiceLineLite[] = []
  if (catalog.length > 0) {
    const ids = invoices.map((i) => i.id)
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await supabase
        .from('invoice_lines')
        .select('invoice_id, description, quantity')
        .in('invoice_id', ids.slice(i, i + ID_CHUNK))
      if (error) throw error
      lines.push(...((data ?? []) as InvoiceLineLite[]))
    }
  }

  const fixedMonthly = fixed.length > 0 ? fixed.reduce((s, c) => s + c.monthly_amount, 0) : null
  return computeMonthlyProfit(monthKeys, invoices, lines, (expRes.data ?? []) as ExpenseLite[], catalog, fixedMonthly)
}
