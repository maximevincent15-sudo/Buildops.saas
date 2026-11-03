import { supabase } from '../../shared/lib/supabase'
import { removeStoredFile } from '../../shared/lib/privateFiles'
import { uploadDossierFile } from '../../shared/lib/storage'
import { listEquipmentUnitsByIds } from '../equipment/api'
import { unitRepere } from '../equipment/identification'
import type { Site } from '../equipment/schemas'
import { normalizeIntervention } from '../planning/schemas'
import type { Intervention } from '../planning/schemas'

/**
 * Dossier d'un chantier pour une année : les visites qui portent le N° de
 * dossier (l'année suivante, le chantier a un nouveau numéro), leurs sites,
 * et tout ce qui s'y rattache (rapports, devis, factures, photos, documents
 * ajoutés à la main).
 */

export const DOSSIER_DOCUMENT_KINDS = ['delivery_note', 'plan', 'certificate', 'report', 'photo', 'other'] as const
export type DossierDocumentKind = (typeof DOSSIER_DOCUMENT_KINDS)[number]

export const DOSSIER_DOCUMENT_LABELS: Record<DossierDocumentKind, string> = {
  delivery_note: 'Bon de livraison',
  plan: 'Plan',
  certificate: 'PV / attestation',
  report: 'Ancien rapport',
  photo: 'Photo',
  other: 'Autre',
}

export type DossierDocument = {
  id: string
  organization_id: string
  dossier_number: string
  kind: DossierDocumentKind
  title: string
  document_date: string | null
  file_path: string
  file_url: string
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  created_by_name: string | null
}

export type DossierSummary = {
  number: string
  clientNames: string[]
  siteNames: string[]
  /** Années des visites du dossier */
  years: string[]
}

export type DossierSite = Site & { unitCount: number }

export type DossierReport = {
  id: string
  intervention_id: string
  completed_at: string | null
  pdf_url: string | null
  is_conform: boolean | null
  anomaly_count: number | null
}

export type DossierVisit = { intervention: Intervention; report: DossierReport | null }

export type DossierQuote = {
  id: string
  reference: string
  status: string
  issue_date: string
  total_ttc: number
  pdf_url: string | null
  site_name: string | null
  dossier_number?: string | null
}

export type DossierInvoice = DossierQuote & { amount_paid: number | null; quote_id: string | null }

export type DossierPhoto = {
  url: string
  date: string | null
  label: string
  reference: string | null
}

export type DossierDetail = {
  number: string
  /** Années des visites du dossier */
  years: string[]
  /** Dossiers des autres années du même chantier (mêmes sites) */
  otherYears: Array<{ number: string; years: string[] }>
  clients: Array<{ id: string; name: string; client_number: string | null }>
  sites: DossierSite[]
  visits: DossierVisit[]
  quotes: DossierQuote[]
  invoices: DossierInvoice[]
  photos: DossierPhoto[]
  documents: DossierDocument[]
}

const CHUNK = 100

/** Requête « in » découpée en paquets (URL courte), résultats concaténés */
async function selectIn<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  const unique = Array.from(new Set(ids.filter(Boolean)))
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await run(unique.slice(i, i + CHUNK))
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
  }
  return out
}

function byId<T extends { id: string }>(lists: T[][]): T[] {
  const map = new Map<string, T>()
  for (const list of lists) for (const x of list) map.set(x.id, x)
  return Array.from(map.values())
}

const compareNumbers = (a: string, b: string) => b.localeCompare(a, 'fr', { numeric: true })

const yearOf = (v: { scheduled_date: string | null; created_at: string }) => (v.scheduled_date ?? v.created_at).slice(0, 4)
const sortedYears = (years: Iterable<string>) => Array.from(new Set(years)).sort()

/** Tous les dossiers de l'entreprise (numéros portés par les visites, sites, devis, factures ou documents) */
export async function listDossiers(): Promise<DossierSummary[]> {
  const [visitsRes, sitesRes, clientsRes, quotesRes, invoicesRes, docsRes] = await Promise.all([
    supabase.from('interventions').select('dossier_number, client_name, site_name, scheduled_date, created_at').not('dossier_number', 'is', null),
    supabase.from('sites').select('name, client_id, dossier_number').not('dossier_number', 'is', null),
    supabase.from('clients').select('id, name'),
    supabase.from('quotes').select('dossier_number, client_name').not('dossier_number', 'is', null),
    supabase.from('invoices').select('dossier_number, client_name').not('dossier_number', 'is', null),
    supabase.from('dossier_documents').select('dossier_number'),
  ])
  if (visitsRes.error) throw visitsRes.error
  if (sitesRes.error) throw sitesRes.error
  const clientName = new Map(((clientsRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]))

  const map = new Map<string, { clients: Set<string>; sites: Set<string>; years: Set<string> }>()
  const entry = (n: string | null) => {
    const k = n?.trim()
    if (!k) return null
    if (!map.has(k)) map.set(k, { clients: new Set(), sites: new Set(), years: new Set() })
    return map.get(k)!
  }
  type VisitRow = { dossier_number: string | null; client_name: string; site_name: string | null; scheduled_date: string | null; created_at: string }
  for (const v of (visitsRes.data ?? []) as VisitRow[]) {
    const e = entry(v.dossier_number)
    if (!e) continue
    e.years.add(yearOf(v))
    if (v.site_name) e.sites.add(v.site_name)
    if (v.client_name) e.clients.add(v.client_name)
  }
  for (const s of (sitesRes.data ?? []) as Array<{ name: string; client_id: string; dossier_number: string | null }>) {
    const e = entry(s.dossier_number)
    if (!e) continue
    e.sites.add(s.name)
    const c = clientName.get(s.client_id)
    if (c) e.clients.add(c)
  }
  for (const r of [...((quotesRes.data ?? []) as Array<{ dossier_number: string | null; client_name: string }>), ...((invoicesRes.data ?? []) as Array<{ dossier_number: string | null; client_name: string }>)]) {
    const e = entry(r.dossier_number)
    if (e && e.clients.size === 0 && r.client_name) e.clients.add(r.client_name)
  }
  for (const d of (docsRes.data ?? []) as Array<{ dossier_number: string }>) entry(d.dossier_number)

  return Array.from(map.entries())
    .map(([number, e]) => ({
      number,
      clientNames: Array.from(e.clients).sort((a, b) => a.localeCompare(b, 'fr')),
      siteNames: Array.from(e.sites).sort((a, b) => a.localeCompare(b, 'fr')),
      years: sortedYears(e.years),
    }))
    .sort((a, b) => compareNumbers(a.number, b.number))
}

/** Le dossier complet d'un N° (une année d'un chantier) */
export async function getDossier(number: string): Promise<DossierDetail> {
  // Visites qui portent le numéro, et sites dont c'est le numéro en cours
  const [visitsRes, sitesRes] = await Promise.all([
    supabase.from('interventions').select('*').eq('dossier_number', number),
    supabase.from('sites').select('*').eq('dossier_number', number),
  ])
  if (visitsRes.error) throw visitsRes.error
  if (sitesRes.error) throw sitesRes.error
  const interventions = ((visitsRes.data ?? []) as Intervention[])
    .map(normalizeIntervention)
    .sort((a, b) => (b.scheduled_date ?? b.created_at).localeCompare(a.scheduled_date ?? a.created_at))
  const interventionIds = interventions.map((i) => i.id)
  const years = sortedYears(interventions.map(yearOf))

  // Sites des visites qui ont depuis changé de numéro (année passée)
  const currentSites = (sitesRes.data ?? []) as Site[]
  const currentIds = new Set(currentSites.map((s) => s.id))
  const pastSites = await selectIn<Site>(
    interventions.map((i) => i.site_id ?? '').filter((id) => id && !currentIds.has(id)),
    (c) => supabase.from('sites').select('*').in('id', c),
  )
  const sitesRaw = [...currentSites, ...pastSites].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const siteIds = sitesRaw.map((s) => s.id)
  const clientIds = Array.from(new Set([...sitesRaw.map((s) => s.client_id), ...interventions.map((i) => i.client_id ?? '')].filter(Boolean)))
  const siteNames = Array.from(new Set([...sitesRaw.map((s) => s.name), ...interventions.map((i) => i.site_name ?? '')].filter(Boolean)))

  type OtherVisitRow = { dossier_number: string; scheduled_date: string | null; created_at: string }
  const [clientsRaw, unitCounts, otherVisits] = await Promise.all([
    selectIn<{ id: string; name: string; client_number: string | null }>(clientIds, (c) =>
      supabase.from('clients').select('id, name, client_number').in('id', c)),
    Promise.all(sitesRaw.map((s) =>
      supabase.from('equipment_units').select('id', { count: 'exact', head: true }).eq('site_id', s.id).neq('status', 'removed')
        .then(({ count }) => count ?? 0))),
    // Les autres années du même chantier : numéros des autres visites de ses sites
    selectIn<OtherVisitRow>(siteIds, (c) => supabase.from('interventions')
      .select('dossier_number, scheduled_date, created_at').in('site_id', c).not('dossier_number', 'is', null).neq('dossier_number', number)),
  ])
  const otherMap = new Map<string, Set<string>>()
  for (const v of otherVisits) {
    const n = v.dossier_number.trim()
    if (!n) continue
    if (!otherMap.has(n)) otherMap.set(n, new Set())
    otherMap.get(n)!.add(yearOf(v))
  }
  for (const s of sitesRaw) {
    const n = s.dossier_number?.trim()
    if (n && n !== number && !otherMap.has(n)) otherMap.set(n, new Set())
  }
  const otherYears = Array.from(otherMap.entries())
    .map(([n, ys]) => ({ number: n, years: sortedYears(ys) }))
    .sort((a, b) => (b.years.at(-1) ?? '9999').localeCompare(a.years.at(-1) ?? '9999') || compareNumbers(a.number, b.number))

  type ReportRow = DossierReport & { photos: Array<{ url?: string }> | null }
  type CheckRow = { intervention_id: string; equipment_unit_id: string; photos: Array<{ url?: string }> | null; checked_at: string | null }
  type AnomalyRow = { intervention_id: string | null; title: string; photos: Array<{ url?: string }> | null; created_at: string }
  const quoteCols = 'id, reference, status, issue_date, total_ttc, pdf_url, site_name, dossier_number'
  const invoiceCols = 'id, reference, status, issue_date, total_ttc, amount_paid, pdf_url, site_name, quote_id, dossier_number'
  // Devis et factures saisis sans numéro ni lien, au nom exact d'un site du
  // dossier (même client), datés d'une année du dossier
  const docYears = years.length > 0 ? years : [String(new Date().getFullYear())]
  const bySiteName = (table: 'quotes' | 'invoices', cols: string) =>
    clientIds.length && siteNames.length
      ? supabase.from(table).select(cols).in('client_id', clientIds).in('site_name', siteNames).is('dossier_number', null)
          .gte('issue_date', `${docYears[0]}-01-01`).lte('issue_date', `${docYears[docYears.length - 1]}-12-31`)
          .then(({ data, error }) => { if (error) throw error; return (data ?? []) as unknown[] })
      : Promise.resolve([] as unknown[])
  // Rattachés à une visite du dossier, sauf s'ils portent un autre numéro
  const sameDossier = <T extends { dossier_number?: string | null }>(rows: T[]) =>
    rows.filter((r) => !r.dossier_number?.trim() || r.dossier_number.trim() === number)

  const [reports, quotesByNumber, quotesByVisit, quotesBySite, checks, anomalies, docsRes] = await Promise.all([
    selectIn<ReportRow>(interventionIds, (c) => supabase.from('reports')
      .select('id, intervention_id, completed_at, pdf_url, is_conform, anomaly_count, photos').in('intervention_id', c)),
    supabase.from('quotes').select(quoteCols).eq('dossier_number', number)
      .then(({ data, error }) => { if (error) throw error; return (data ?? []) as DossierQuote[] }),
    selectIn<DossierQuote>(interventionIds, (c) => supabase.from('quotes').select(quoteCols).in('intervention_id', c)).then(sameDossier),
    bySiteName('quotes', quoteCols) as Promise<DossierQuote[]>,
    selectIn<CheckRow>(interventionIds, (c) => supabase.from('equipment_checks')
      .select('intervention_id, equipment_unit_id, photos, checked_at').in('intervention_id', c)),
    selectIn<AnomalyRow>(interventionIds, (c) => supabase.from('anomalies')
      .select('intervention_id, title, photos, created_at').in('intervention_id', c)),
    supabase.from('dossier_documents').select('*').eq('dossier_number', number)
      .order('document_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
  ])
  const linkedQuotes = byId([quotesByNumber, quotesByVisit, quotesBySite])

  const [invoicesByNumber, invoicesByVisit, invoicesByQuote, invoicesBySite] = await Promise.all([
    supabase.from('invoices').select(invoiceCols).eq('dossier_number', number)
      .then(({ data, error }) => { if (error) throw error; return (data ?? []) as DossierInvoice[] }),
    selectIn<DossierInvoice>(interventionIds, (c) => supabase.from('invoices').select(invoiceCols).in('intervention_id', c)).then(sameDossier),
    selectIn<DossierInvoice>(linkedQuotes.map((q) => q.id), (c) => supabase.from('invoices').select(invoiceCols).in('quote_id', c)).then(sameDossier),
    bySiteName('invoices', invoiceCols) as Promise<DossierInvoice[]>,
  ])
  const invoices = byId([invoicesByNumber, invoicesByVisit, invoicesByQuote, invoicesBySite]).sort((a, b) => b.issue_date.localeCompare(a.issue_date))

  // Devis d'origine des factures du dossier
  const known = new Set(linkedQuotes.map((q) => q.id))
  const quotesOfInvoices = await selectIn<DossierQuote>(
    invoices.map((i) => i.quote_id ?? '').filter((id) => id && !known.has(id)),
    (c) => supabase.from('quotes').select(quoteCols).in('id', c),
  )
  const quotes = byId([linkedQuotes, quotesOfInvoices]).sort((a, b) => b.issue_date.localeCompare(a.issue_date))

  // Photos : contrôles des équipements, anomalies, photos générales des rapports
  const refById = new Map(interventions.map((i) => [i.id, i.reference]))
  const withPhotos = checks.filter((c) => (c.photos ?? []).length > 0)
  const units = await listEquipmentUnitsByIds(withPhotos.map((c) => c.equipment_unit_id)).catch(() => [])
  const unitById = new Map(units.map((u) => [u.id, u]))
  const photos: DossierPhoto[] = []
  for (const c of withPhotos) {
    const u = unitById.get(c.equipment_unit_id)
    for (const p of c.photos ?? []) if (p.url) photos.push({ url: p.url, date: c.checked_at, label: u ? `Contrôle ${unitRepere(u)}` : 'Contrôle', reference: refById.get(c.intervention_id) ?? null })
  }
  for (const a of anomalies) {
    for (const p of a.photos ?? []) if (p.url) photos.push({ url: p.url, date: a.created_at, label: `Anomalie : ${a.title}`, reference: a.intervention_id ? refById.get(a.intervention_id) ?? null : null })
  }
  for (const r of reports) {
    for (const p of r.photos ?? []) if (p.url) photos.push({ url: p.url, date: r.completed_at, label: 'Photo du rapport', reference: refById.get(r.intervention_id) ?? null })
  }
  photos.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const reportByVisit = new Map(reports.map((r) => [r.intervention_id, r]))

  return {
    number,
    years,
    otherYears,
    clients: clientsRaw,
    sites: sitesRaw.map((s, i) => ({ ...s, unitCount: unitCounts[i] ?? 0 })),
    visits: interventions.map((i) => ({ intervention: i, report: reportByVisit.get(i.id) ?? null })),
    quotes,
    invoices,
    photos,
    // Table absente (migration pas encore passée) : pas de documents plutôt qu'une erreur
    documents: docsRes.error ? [] : ((docsRes.data ?? []) as DossierDocument[]),
  }
}

/** Ajoute un document au dossier (fichier puis fiche ; le fichier est retiré si la fiche échoue) */
export async function addDossierDocument(input: {
  file: File
  organizationId: string
  dossierNumber: string
  kind: DossierDocumentKind
  title: string
  documentDate: string | null
  createdByName: string | null
}): Promise<DossierDocument> {
  const stored = await uploadDossierFile(input.file, input.organizationId, input.dossierNumber)
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('dossier_documents')
    .insert({
      organization_id: input.organizationId,
      dossier_number: input.dossierNumber,
      kind: input.kind,
      title: input.title.trim() || input.file.name,
      document_date: input.documentDate || null,
      file_path: stored.path,
      file_url: stored.url,
      file_name: input.file.name,
      mime_type: stored.contentType,
      size_bytes: input.file.size,
      created_by: auth.user?.id ?? null,
      created_by_name: input.createdByName,
    })
    .select()
    .single()
  if (error) {
    await removeStoredFile(stored.url).catch(() => {})
    throw error
  }
  return data as DossierDocument
}

/** Retire un document du dossier (fiche, puis fichier) */
export async function deleteDossierDocument(doc: Pick<DossierDocument, 'id' | 'file_path' | 'file_url'>): Promise<void> {
  const { error } = await supabase.from('dossier_documents').delete().eq('id', doc.id)
  if (error) throw error
  await removeStoredFile(doc.file_url, doc.file_path).catch(() => {})
}
