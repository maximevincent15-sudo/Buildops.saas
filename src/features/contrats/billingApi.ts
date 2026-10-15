import { createInvoice } from '../factures/api'
import { supabase } from '../../shared/lib/supabase'
import { listContracts } from './api'
import { frDate, planMonthBilling } from './billing'
import type { BillingProposal, BillingSkip, BillingVisit } from './billing'

type VisitRow = {
  id: string
  contract_id: string
  site_id: string | null
  site_name: string | null
  scheduled_date: string | null
  contract_invoice_id: string | null
  reports: Array<{ completed_at: string | null }> | { completed_at: string | null } | null
}

function localDate(iso: string): string {
  if (iso.length <= 10) return iso
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ce qui est à facturer pour le mois (AAAA-MM) */
export async function loadMonthBilling(month: string): Promise<{ proposals: BillingProposal[]; skipped: BillingSkip[] }> {
  const [contracts, visitsRes, invoicesRes] = await Promise.all([
    listContracts(),
    supabase
      .from('interventions')
      .select('id, contract_id, site_id, site_name, scheduled_date, contract_invoice_id, reports(completed_at)')
      .not('contract_id', 'is', null)
      .eq('status', 'terminee'),
    supabase
      .from('invoices')
      .select('id, status, contract_id, contract_period_start')
      .not('contract_id', 'is', null),
  ])
  if (visitsRes.error) throw visitsRes.error
  if (invoicesRes.error) throw invoicesRes.error

  const invoices = (invoicesRes.data ?? []) as Array<{ id: string; status: string; contract_id: string; contract_period_start: string | null }>
  const activeInvoiceIds = new Set(invoices.filter((i) => i.status !== 'cancelled').map((i) => i.id))
  const billedPeriods = new Set(
    invoices
      .filter((i) => i.status !== 'cancelled' && i.contract_period_start)
      .map((i) => `${i.contract_id}|${i.contract_period_start}`),
  )

  const visits: BillingVisit[] = []
  for (const row of (visitsRes.data ?? []) as VisitRow[]) {
    const report = Array.isArray(row.reports) ? row.reports[0] : row.reports
    const done = report?.completed_at ?? row.scheduled_date
    if (!done) continue
    visits.push({
      id: row.id,
      contract_id: row.contract_id,
      site_id: row.site_id,
      site_name: row.site_name,
      done_on: localDate(done),
      billed: !!row.contract_invoice_id && activeInvoiceIds.has(row.contract_invoice_id),
    })
  }

  return planMonthBilling(month, contracts, visits, billedPeriods)
}

type ClientRow = { id: string; name: string; siren: string | null; contact_name: string | null; contact_email: string | null; address: string | null }
type SiteRow = { id: string; name: string; address: string | null; postal_code: string | null; city: string | null }

export type BillingResult = { created: Array<{ id: string; reference: string; clientName: string }>; errors: string[] }

/** Crée les factures en brouillon et marque visites / échéances comme facturées */
export async function createBillingInvoices(proposals: BillingProposal[], organizationId: string, monthLabel: string): Promise<BillingResult> {
  const clientIds = Array.from(new Set(proposals.map((p) => p.contract.client_id).filter((id): id is string => !!id)))
  const siteIds = Array.from(new Set(proposals.flatMap((p) => p.contract.site_ids)))
  const [clientsRes, sitesRes] = await Promise.all([
    clientIds.length ? supabase.from('clients').select('id, name, siren, contact_name, contact_email, address').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? supabase.from('sites').select('id, name, address, postal_code, city').in('id', siteIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (clientsRes.error) throw clientsRes.error
  if (sitesRes.error) throw sitesRes.error
  const clients = new Map(((clientsRes.data ?? []) as ClientRow[]).map((c) => [c.id, c]))
  const sites = new Map(((sitesRes.data ?? []) as SiteRow[]).map((s) => [s.id, s]))

  const issueDate = localDate(new Date().toISOString())
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const dueDate = localDate(due.toISOString())

  const result: BillingResult = { created: [], errors: [] }
  for (const p of proposals) {
    const c = p.contract
    const client = c.client_id ? clients.get(c.client_id) : undefined
    const site = c.site_ids.length === 1 ? sites.get(c.site_ids[0]!) : undefined
    const siteAddress = site ? [site.address, [site.postal_code, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : undefined
    const notes = p.kind === 'per_visit'
      ? `Contrat de maintenance ${c.reference}${c.title ? ` (${c.title})` : ''} — ${p.summary}.`
      : `Contrat de maintenance ${c.reference}${c.title ? ` (${c.title})` : ''} — facturation d'avance, ${p.summary}.`
    try {
      const invoice = await createInvoice(
        {
          client_id: c.client_id ?? undefined,
          client_name: client?.name ?? c.client_name,
          client_contact_name: client?.contact_name ?? undefined,
          client_email: client?.contact_email ?? undefined,
          client_address: client?.address ?? undefined,
          client_siren: client?.siren ?? undefined,
          intervention_id: p.visits.length === 1 ? p.visits[0]!.id : undefined,
          site_name: site?.name ?? undefined,
          site_address: siteAddress || undefined,
          issue_date: issueDate,
          due_date: dueDate,
          notes,
          lines: p.lines.map((l, i) => ({ ...l, position: i })),
        },
        organizationId,
        { contract_id: c.id, contract_period_start: p.periodStart },
      )
      if (p.visits.length > 0) {
        const { error } = await supabase
          .from('interventions')
          .update({ contract_invoice_id: invoice.id })
          .in('id', p.visits.map((v) => v.id))
        if (error) throw error
      }
      result.created.push({ id: invoice.id, reference: invoice.reference, clientName: invoice.client_name })
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const message = /idx_invoices_contract_period|duplicate key/i.test(raw)
        ? `échéance du ${p.periodStart ? frDate(p.periodStart) : ''} déjà facturée`
        : raw
      result.errors.push(`${c.client_name} (${c.reference}, ${monthLabel}) : ${message}`)
    }
  }
  return result
}
