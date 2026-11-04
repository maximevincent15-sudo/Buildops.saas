import { supabase } from '../../shared/lib/supabase'
import { joinDescription } from '../../shared/lib/lineFormat'
import { EQUIPMENT_TYPES } from '../../shared/constants/interventions'
import type { EquipmentType } from '../../shared/constants/interventions'
import { familiesForTypes } from '../equipment/identification'
import { EQUIPMENT_FAMILIES, EQUIPMENT_FAMILY_LABELS } from '../equipment/schemas'
import type { EquipmentFamily } from '../equipment/schemas'
import type { QuoteLineInput } from '../devis/schemas'
import type { UpsertInvoiceInput } from './schemas'

/**
 * Facturer une visite terminée.
 *
 * Une visite est « à facturer » quand son rapport est finalisé, qu'elle
 * n'est pas rattachée à un contrat (facturé depuis Contrats → « Facturer le
 * mois ») et qu'aucune facture non annulée ne la couvre. Les visites
 * terminées sans rapport Firovia (historique importé) n'en font pas partie.
 */

export type VisitToInvoice = {
  id: string
  reference: string
  client_id: string | null
  client_name: string
  site_id: string | null
  site_name: string | null
  address: string | null
  chantier_address: string | null
  chantier_postal_code: string | null
  chantier_city: string | null
  scheduled_date: string | null
  equipment_types: string[] | null
  completed_at: string
}

export type VisitInvoiceRef = { id: string; reference: string; status: string }

const VISIT_COLUMNS =
  'id, reference, client_id, client_name, site_id, site_name, address, chantier_address, chantier_postal_code, chantier_city, scheduled_date, equipment_types, contract_id, contract_invoice_id'

type VisitRow = Omit<VisitToInvoice, 'completed_at'> & { contract_id: string | null; contract_invoice_id: string | null }

/** Facture non annulée qui couvre déjà cette visite, null sinon */
export async function findVisitInvoice(interventionId: string): Promise<VisitInvoiceRef | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, reference, status')
    .eq('intervention_id', interventionId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (data?.[0]) return data[0] as VisitInvoiceRef

  // Visite couverte par une facture de contrat
  const { data: visit } = await supabase
    .from('interventions')
    .select('contract_invoice_id')
    .eq('id', interventionId)
    .maybeSingle()
  const contractInvoiceId = (visit as { contract_invoice_id: string | null } | null)?.contract_invoice_id
  if (!contractInvoiceId) return null
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, reference, status')
    .eq('id', contractInvoiceId)
    .neq('status', 'cancelled')
    .maybeSingle()
  return (inv as VisitInvoiceRef | null) ?? null
}

async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

/** Visites terminées, rapport finalisé, hors contrat, sans facture (plus récentes d'abord) */
export async function listVisitsToInvoice(): Promise<VisitToInvoice[]> {
  const [visits, reports, invoices] = await Promise.all([
    selectAll<VisitRow>((from, to) => supabase
      .from('interventions')
      .select(VISIT_COLUMNS)
      .eq('status', 'terminee')
      .is('contract_id', null)
      .order('id', { ascending: true })
      .range(from, to)),
    selectAll<{ intervention_id: string; completed_at: string }>((from, to) => supabase
      .from('reports')
      .select('intervention_id, completed_at')
      .not('completed_at', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)),
    selectAll<{ id: string; intervention_id: string | null }>((from, to) => supabase
      .from('invoices')
      .select('id, intervention_id')
      .neq('status', 'cancelled')
      .order('id', { ascending: true })
      .range(from, to)),
  ])

  const completedAt = new Map(reports.map((r) => [r.intervention_id, r.completed_at]))
  const activeInvoiceIds = new Set(invoices.map((i) => i.id))
  const invoicedVisits = new Set(invoices.map((i) => i.intervention_id).filter(Boolean) as string[])

  return visits
    .filter((v) => completedAt.has(v.id)
      && !invoicedVisits.has(v.id)
      && !(v.contract_invoice_id && activeInvoiceIds.has(v.contract_invoice_id)))
    .map((v) => ({ ...v, completed_at: completedAt.get(v.id)! }))
    .sort((a, b) => (b.scheduled_date ?? b.completed_at).localeCompare(a.scheduled_date ?? a.completed_at))
}

/** « Extincteurs » → « extincteurs », mais « BAES », « RIA », « SSI » restent en capitales */
function lowerFirst(label: string): string {
  return /^\p{Lu}\p{Ll}/u.test(label) ? label[0]!.toLowerCase() + label.slice(1) : label
}

function frDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function siteAddress(v: Pick<VisitToInvoice, 'address' | 'chantier_address' | 'chantier_postal_code' | 'chantier_city'>): string {
  const chantier = [v.chantier_address, [v.chantier_postal_code, v.chantier_city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return chantier || v.address || ''
}

/**
 * Facture pré-remplie pour une visite : une ligne par famille d'appareils
 * contrôlés (quantité = nombre d'appareils), plus une ligne par type de
 * visite sans contrôle appareil par appareil. Prix à compléter (ou articles
 * du catalogue) ; client, adresse et N° de dossier sont complétés par la
 * fenêtre facture.
 */
export async function buildVisitInvoiceSeed(visit: Omit<VisitToInvoice, 'completed_at'>): Promise<Partial<UpsertInvoiceInput>> {
  type CheckRow = { equipment_units: { family: EquipmentFamily } | null }
  const checks = await selectAll<CheckRow>((from, to) => supabase
    .from('equipment_checks')
    .select('equipment_units(family)')
    .eq('intervention_id', visit.id)
    .neq('verdict', 'non_verifie')
    .order('id', { ascending: true })
    .range(from, to))

  const byFamily = new Map<EquipmentFamily, number>()
  for (const c of checks) {
    const f = c.equipment_units?.family
    if (f) byFamily.set(f, (byFamily.get(f) ?? 0) + 1)
  }

  const labels: Array<{ label: string; quantity: number }> = EQUIPMENT_FAMILIES.filter((f) => byFamily.has(f))
    .map((f) => ({ label: `Vérification ${lowerFirst(EQUIPMENT_FAMILY_LABELS[f])}`, quantity: byFamily.get(f)! }))
  // Types de la visite sans appareil contrôlé un par un (checklist d'ensemble) : une ligne chacun
  for (const t of visit.equipment_types ?? []) {
    if (familiesForTypes([t]).some((f) => byFamily.has(f))) continue
    labels.push({ label: `Vérification ${lowerFirst(EQUIPMENT_TYPES[t as EquipmentType] ?? t)}`, quantity: 1 })
  }
  if (labels.length === 0) labels.push({ label: 'Visite de maintenance', quantity: 1 })

  const detail = [`Visite ${visit.reference}`, visit.scheduled_date ? `du ${frDate(visit.scheduled_date)}` : '']
    .filter(Boolean).join(' ')
  const lines: QuoteLineInput[] = labels.map((l, i) => ({
    position: i,
    description: i === 0 ? joinDescription(l.label, detail) : l.label,
    quantity: l.quantity,
    unit_price_ht: 0,
    vat_rate: 20,
  }))

  return {
    client_id: visit.client_id ?? undefined,
    client_name: visit.client_name,
    site_name: visit.site_name ?? undefined,
    site_address: siteAddress(visit) || undefined,
    intervention_id: visit.id,
    lines,
  }
}
