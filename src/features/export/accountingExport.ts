import { supabase } from '../../shared/lib/supabase'
import { computeQuoteTotals } from '../devis/constants'
import { EXPENSE_CATEGORY_LABEL } from '../expenses/constants'
import type { ExpenseCategory } from '../expenses/constants'

/**
 * Export comptable d'une période, pour l'expert-comptable :
 *  - classeur Excel : factures, journal des ventes, TVA collectée, notes de frais ;
 *  - journal des ventes au format FEC (colonnes de l'art. A47 A-1 du LPF),
 *    importable dans les logiciels comptables (Pennylane, Cegid, Sage, Tiime…).
 * Écritures : 411 client (TTC) au débit ; 706 prestations (HT) et 44571 TVA
 * collectée au crédit, par taux. Brouillons exclus ; factures annulées listées
 * à part (à régulariser par un avoir).
 */

export type ExportInvoice = {
  id: string
  reference: string
  issue_date: string
  due_date: string | null
  client_name: string
  client_siren: string | null
  site_name: string | null
  status: string
  total_ht: number
  total_vat: number
  total_ttc: number
  amount_paid: number
  paid_at: string | null
  payment_method: string | null
}
export type ExportInvoiceLine = { invoice_id: string; quantity: number; unit_price_ht: number; vat_rate: number }
export type ExportExpense = {
  spent_on: string
  technician_name: string
  category: string
  description: string | null
  amount_ttc: number
  vat_rate: number
  receipt_url: string | null
  status: string
}

export type JournalEntry = {
  num: number
  date: string
  account: string
  accountLabel: string
  auxAccount: string
  auxLabel: string
  piece: string
  label: string
  debit: number
  credit: number
}

export const ACCOUNTS = {
  client: { num: '411000', label: 'Clients' },
  sales: { num: '706000', label: 'Prestations de services' },
  vat: { num: '445710', label: 'TVA collectée' },
}

const round2 = (n: number) => Math.round(n * 100) / 100
/** Marque d'ordre des octets : Excel ouvre ainsi le CSV en UTF-8 (accents) */
const BOM = String.fromCharCode(0xfeff)

/** Compte auxiliaire client stable, dérivé du nom (ex. « CCLINIQUESA ») */
export function clientAuxCode(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return `C${base.slice(0, 10) || 'DIVERS'}`
}

function rateLabel(rate: string): string {
  return `${rate.replace('.', ',')} %`
}

/** Écritures du journal des ventes : équilibrées facture par facture, au centime */
export function buildSalesJournal(invoices: ExportInvoice[], lines: ExportInvoiceLine[]): JournalEntry[] {
  const byInvoice = new Map<string, ExportInvoiceLine[]>()
  for (const l of lines) {
    const list = byInvoice.get(l.invoice_id) ?? []
    list.push(l)
    byInvoice.set(l.invoice_id, list)
  }
  const entries: JournalEntry[] = []
  let num = 0
  const sorted = [...invoices].sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.reference.localeCompare(b.reference))
  for (const inv of sorted) {
    num++
    const aux = clientAuxCode(inv.client_name)
    const base = { num, date: inv.issue_date, auxAccount: '', auxLabel: '', piece: inv.reference }
    const invLines = byInvoice.get(inv.id) ?? []
    const credits: JournalEntry[] = []
    if (invLines.length > 0) {
      const totals = computeQuoteTotals(invLines.map((l) => ({ quantity: Number(l.quantity), unit_price_ht: Number(l.unit_price_ht), vat_rate: Number(l.vat_rate) })))
      for (const rate of Object.keys(totals.ht_by_rate).sort((a, b) => Number(b) - Number(a))) {
        const ht = totals.ht_by_rate[rate] ?? 0
        const vat = totals.vat_by_rate[rate] ?? 0
        if (ht !== 0) credits.push({ ...base, account: ACCOUNTS.sales.num, accountLabel: ACCOUNTS.sales.label, label: `${inv.client_name} — prestations TVA ${rateLabel(rate)}`, debit: 0, credit: ht })
        if (vat !== 0) credits.push({ ...base, account: ACCOUNTS.vat.num, accountLabel: ACCOUNTS.vat.label, label: `${inv.client_name} — TVA ${rateLabel(rate)}`, debit: 0, credit: vat })
      }
    } else {
      credits.push({ ...base, account: ACCOUNTS.sales.num, accountLabel: ACCOUNTS.sales.label, label: `${inv.client_name} — prestations`, debit: 0, credit: Number(inv.total_ht) })
      if (Number(inv.total_vat)) credits.push({ ...base, account: ACCOUNTS.vat.num, accountLabel: ACCOUNTS.vat.label, label: `${inv.client_name} — TVA`, debit: 0, credit: Number(inv.total_vat) })
    }
    // Débit client = montant TTC facturé. Un écart d'arrondi (quelques centimes)
    // va sur la dernière ligne ; au-delà, les lignes de la facture font foi.
    const creditSum = round2(credits.reduce((s, c) => s + c.credit, 0))
    let ttc = round2(Number(inv.total_ttc))
    const diff = round2(ttc - creditSum)
    if (Math.abs(diff) > 0.05) ttc = creditSum
    else if (diff !== 0 && credits.length > 0) credits[credits.length - 1]!.credit = round2(credits[credits.length - 1]!.credit + diff)
    entries.push({ ...base, account: ACCOUNTS.client.num, accountLabel: ACCOUNTS.client.label, auxAccount: aux, auxLabel: inv.client_name, label: `${inv.client_name} — facture ${inv.reference}`, debit: ttc, credit: 0 })
    entries.push(...credits)
  }
  return entries
}

/** TVA collectée par taux (factures de la période) */
export function vatSummary(lines: ExportInvoiceLine[]): Array<{ rate: string; ht: number; vat: number }> {
  const totals = computeQuoteTotals(lines.map((l) => ({ quantity: Number(l.quantity), unit_price_ht: Number(l.unit_price_ht), vat_rate: Number(l.vat_rate) })))
  return Object.keys(totals.ht_by_rate)
    .sort((a, b) => Number(b) - Number(a))
    .map((rate) => ({ rate, ht: totals.ht_by_rate[rate] ?? 0, vat: totals.vat_by_rate[rate] ?? 0 }))
}

function fecDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}

function fecAmount(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function fecText(s: string): string {
  return s.replace(/[;\t\r\n]+/g, ' ').trim()
}

/** Journal des ventes au format FEC (séparateur « ; », décimales à virgule) */
export function salesJournalFec(entries: JournalEntry[]): string {
  const header = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
  const rows = entries.map((e) => [
    'VE', 'Journal des ventes', `VE${String(e.num).padStart(5, '0')}`, fecDate(e.date), e.account, e.accountLabel,
    e.auxAccount, fecText(e.auxLabel), e.piece, fecDate(e.date), fecText(e.label), fecAmount(e.debit), fecAmount(e.credit),
    '', '', fecDate(e.date), '', '',
  ].join(';'))
  return [header.join(';'), ...rows].join('\r\n')
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Envoyée', partially_paid: 'Partiellement payée', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée',
}

export type AccountingExportResult = {
  blob: Blob
  filename: string
  invoiceCount: number
  cancelledCount: number
  expenseCount: number
  totalHt: number
  balanced: boolean
}

export async function exportAccounting(from: string, to: string, orgName: string): Promise<AccountingExportResult> {
  const [{ default: ExcelJS }, { zip }] = await Promise.all([import('exceljs'), import('fflate')])

  const [invRes, expRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, reference, issue_date, due_date, client_name, client_siren, site_name, status, total_ht, total_vat, total_ttc, amount_paid, paid_at, payment_method')
      .gte('issue_date', from)
      .lte('issue_date', to)
      .neq('status', 'draft')
      .order('issue_date'),
    supabase
      .from('expenses')
      .select('spent_on, technician_name, category, description, amount_ttc, vat_rate, receipt_url, status')
      .gte('spent_on', from)
      .lte('spent_on', to)
      .eq('status', 'approved')
      .order('spent_on'),
  ])
  if (invRes.error) throw invRes.error
  if (expRes.error) throw expRes.error

  const all = (invRes.data ?? []) as ExportInvoice[]
  const invoices = all.filter((i) => i.status !== 'cancelled')
  const cancelled = all.filter((i) => i.status === 'cancelled')
  const expenses = (expRes.data ?? []) as ExportExpense[]

  const lines: ExportInvoiceLine[] = []
  const ids = invoices.map((i) => i.id)
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select('invoice_id, quantity, unit_price_ht, vat_rate')
      .in('invoice_id', ids.slice(i, i + 150))
    if (error) throw error
    lines.push(...((data ?? []) as ExportInvoiceLine[]))
  }

  const journal = buildSalesJournal(invoices, lines)
  const totalDebit = round2(journal.reduce((s, e) => s + e.debit, 0))
  const totalCredit = round2(journal.reduce((s, e) => s + e.credit, 0))

  // ─── Classeur Excel ───
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Firovia'
  wb.created = new Date()
  const eur = '#,##0.00 €'
  const addSheet = (name: string, columns: Array<{ header: string; key: string; width: number; money?: boolean }>, rows: Array<Record<string, unknown>>) => {
    const ws = wb.addWorksheet(name)
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: eur } : {} }))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of rows) ws.addRow(r)
    return ws
  }

  addSheet('Factures', [
    { header: 'Date', key: 'date', width: 12 }, { header: 'N°', key: 'ref', width: 16 }, { header: 'Client', key: 'client', width: 30 },
    { header: 'SIREN', key: 'siren', width: 12 }, { header: 'Site', key: 'site', width: 24 }, { header: 'Total HT', key: 'ht', width: 12, money: true },
    { header: 'TVA', key: 'vat', width: 11, money: true }, { header: 'Total TTC', key: 'ttc', width: 12, money: true }, { header: 'Statut', key: 'status', width: 18 },
    { header: 'Encaissé', key: 'paid', width: 12, money: true }, { header: 'Date de paiement', key: 'paidAt', width: 15 }, { header: 'Mode', key: 'method', width: 14 },
    { header: 'Échéance', key: 'due', width: 12 },
  ], [...invoices, ...cancelled].map((i) => ({
    date: i.issue_date, ref: i.reference, client: i.client_name, siren: i.client_siren ?? '', site: i.site_name ?? '',
    ht: Number(i.total_ht), vat: Number(i.total_vat), ttc: Number(i.total_ttc),
    status: i.status === 'cancelled' ? 'Annulée (à régulariser par un avoir)' : STATUS_LABEL[i.status] ?? i.status,
    paid: Number(i.amount_paid ?? 0), paidAt: i.paid_at ? i.paid_at.slice(0, 10) : '', method: i.payment_method ?? '', due: i.due_date ?? '',
  })))

  const js = addSheet('Journal des ventes', [
    { header: 'Date', key: 'date', width: 12 }, { header: 'Pièce', key: 'piece', width: 16 }, { header: 'Compte', key: 'account', width: 10 },
    { header: 'Compte auxiliaire', key: 'aux', width: 16 }, { header: 'Libellé', key: 'label', width: 46 },
    { header: 'Débit', key: 'debit', width: 12, money: true }, { header: 'Crédit', key: 'credit', width: 12, money: true },
  ], journal.map((e) => ({ date: e.date, piece: e.piece, account: e.account, aux: e.auxAccount, label: e.label, debit: e.debit || null, credit: e.credit || null })))
  const totalRow = js.addRow({ label: 'Total', debit: totalDebit, credit: totalCredit })
  totalRow.font = { bold: true }

  addSheet('TVA collectée', [
    { header: 'Taux', key: 'rate', width: 10 }, { header: 'Base HT', key: 'ht', width: 14, money: true }, { header: 'TVA collectée', key: 'vat', width: 14, money: true },
  ], vatSummary(lines).map((v) => ({ rate: rateLabel(v.rate), ht: v.ht, vat: v.vat })))

  addSheet('Notes de frais', [
    { header: 'Date', key: 'date', width: 12 }, { header: 'Technicien', key: 'tech', width: 22 }, { header: 'Catégorie', key: 'cat', width: 18 },
    { header: 'Description', key: 'desc', width: 32 }, { header: 'Montant TTC', key: 'ttc', width: 13, money: true }, { header: 'Taux TVA', key: 'rate', width: 9 },
    { header: 'TVA récupérable', key: 'vat', width: 14, money: true }, { header: 'Montant HT', key: 'ht', width: 12, money: true }, { header: 'Justificatif', key: 'receipt', width: 40 },
  ], expenses.map((e) => {
    const ttc = Number(e.amount_ttc)
    const ht = round2(ttc / (1 + Number(e.vat_rate) / 100))
    return {
      date: e.spent_on, tech: e.technician_name, cat: EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category, desc: e.description ?? '',
      ttc, rate: `${String(e.vat_rate).replace('.', ',')} %`, vat: round2(ttc - ht), ht, receipt: e.receipt_url ?? '',
    }
  }))

  const xlsx = new Uint8Array(await wb.xlsx.writeBuffer())
  const fec = new TextEncoder().encode(`${BOM}${salesJournalFec(journal)}`)
  const period = `${from.replace(/-/g, '')}-${to.replace(/-/g, '')}`
  const totalHt = round2(invoices.reduce((s, i) => s + Number(i.total_ht), 0))
  const readme = [
    `Export comptable Firovia — ${orgName}`,
    `Période : du ${from.split('-').reverse().join('/')} au ${to.split('-').reverse().join('/')}`,
    '',
    `- comptabilite-${period}.xlsx : factures (${invoices.length}), journal des ventes, TVA collectée, notes de frais validées (${expenses.length}).`,
    `- journal-ventes-${period}.csv : journal des ventes au format FEC (séparateur « ; »), à importer dans votre logiciel comptable.`,
    '',
    `Comptes utilisés : ${ACCOUNTS.client.num} clients (compte auxiliaire par client), ${ACCOUNTS.sales.num} prestations, ${ACCOUNTS.vat.num} TVA collectée.`,
    `Journal équilibré : débit ${totalDebit.toFixed(2)} € = crédit ${totalCredit.toFixed(2)} €.`,
    'Brouillons exclus. Les factures sont prises à leur date d\'émission.',
    cancelled.length > 0 ? `${cancelled.length} facture(s) annulée(s) listée(s) dans l'onglet Factures, hors journal : à régulariser par un avoir.` : '',
  ].filter((l) => l !== '').join('\n')

  const files: Record<string, Uint8Array> = {
    'LISEZ-MOI.txt': new TextEncoder().encode(readme),
    [`comptabilite-${period}.xlsx`]: xlsx,
    [`journal-ventes-${period}.csv`]: fec,
  }
  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)))
  })

  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `Firovia-comptabilite-${period}.zip`,
    invoiceCount: invoices.length,
    cancelledCount: cancelled.length,
    expenseCount: expenses.length,
    totalHt,
    balanced: totalDebit === totalCredit,
  }
}
