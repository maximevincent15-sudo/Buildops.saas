/**
 * Test à blanc du chargeur de données de démo (Paramètres → « Charger les
 * données de démo »). Le vrai code tourne ; les requêtes Supabase sont
 * interceptées par une base en mémoire (aucune donnée réelle n'est lue ni
 * écrite). Les PDF de rapport générés sont écrits dans scripts/out/.
 *
 * Usage : npx vite-node scripts/test-demo-data.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Fausse base PostgREST en mémoire ─────────────────────────────────
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const counters: Record<string, number> = {}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Références générées par les triggers en base
const REF_PREFIX: Record<string, string> = { interventions: 'INT-', quotes: 'DEV-2026-', invoices: 'FAC-2026-', contracts: 'CTR-2026-' }

// Modèles de checklist par famille (seedés par migration en vrai)
db.family_templates = ['extincteurs', 'ria', 'baes', 'portes_cf', 'desenfumage', 'detection', 'colonnes_seches'].map((family) => ({
  id: crypto.randomUUID(), family, version: 1, name: `Modèle ${family}`, active: true,
  checklist: [{ id: 'etat', label: 'État général' }, { id: 'acces', label: 'Accessibilité' }, { id: 'signal', label: 'Signalétique' }],
  observation_types: [],
}))

function matches(r: Row, params: URLSearchParams): boolean {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue
    if (v.startsWith('eq.') && String(r[k]) !== v.slice(3)) return false
    if (v.startsWith('neq.') && String(r[k]) === v.slice(4)) return false
    if (v.startsWith('in.(')) {
      const list = v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
      if (!list.includes(String(r[k]))) return false
    }
    if (v === 'is.null' && r[k] != null) return false
  }
  return true
}

const storage: Record<string, Blob> = {}
let failures = 0

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  // Moteur de mise en page du PDF (WASM) et polices : vrais fichiers
  if (url.protocol === 'file:') {
    return new Response(readFileSync(fileURLToPath(url)), { headers: { 'content-type': 'application/wasm' } })
  }
  if (!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/storage/v1/')) {
    return realFetch(input, init)
  }
  const method = (init?.method ?? 'GET').toUpperCase()
  if (url.pathname.startsWith('/auth/v1/user')) return json({ id: 'user-demo', email: 'demo@test' })
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const body = init?.body
    const file = body instanceof FormData ? [...body.values()].find((v) => v instanceof Blob) : body
    if (file instanceof Blob) storage[url.pathname] = file
    return json({ Key: url.pathname })
  }
  const m = /\/rest\/v1\/([a-z_]+)/.exec(url.pathname)
  if (!m) return json({})
  const table = m[1]
  db[table] ??= []
  const headers = new Headers(init?.headers)
  const single = headers.get('Accept')?.includes('vnd.pgrst.object') ?? false

  if (method === 'POST') {
    const body = JSON.parse(String(init?.body))
    const conflict = url.searchParams.get('on_conflict')
    const out: Row[] = []
    for (const r of (Array.isArray(body) ? body : [body]) as Row[]) {
      if (conflict) {
        const keys = conflict.split(',')
        const existing = db[table].find((x) => keys.every((k) => x[k] === r[k]))
        if (existing) { Object.assign(existing, r); out.push(existing); continue }
      }
      const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }
      if (REF_PREFIX[table]) {
        counters[table] = (counters[table] ?? 0) + 1
        row.reference = `${REF_PREFIX[table]}${String(counters[table]).padStart(4, '0')}`
      }
      if (table === 'sites') row.public_token = crypto.randomUUID()
      if (table === 'technicians') row.active = true
      db[table].push(row)
      out.push(row)
    }
    return json(single ? out[0] : out, 201)
  }
  const rows = db[table].filter((r) => matches(r, url.searchParams))
  if (method === 'PATCH') {
    const patch = JSON.parse(String(init?.body)) as Row
    if (table === 'reports' && 'is_conform' in patch) {
      // Simule une base où la migration a été appliquée
    }
    for (const r of rows) Object.assign(r, patch)
    return json(single ? (rows[0] ?? null) : rows)
  }
  if (method === 'DELETE') {
    db[table] = db[table].filter((r) => !rows.includes(r))
    return json(rows)
  }
  const limit = Number(url.searchParams.get('limit') ?? 0)
  let list = limit ? rows.slice(0, limit) : rows
  // Jointures PostgREST utilisées par les contrats (contract_sites, contract_lines)
  if (table === 'contracts' && (url.searchParams.get('select') ?? '').includes('contract_lines')) {
    list = list.map((c) => ({
      ...c,
      contract_sites: (db.contract_sites ?? []).filter((x) => x.contract_id === c.id),
      contract_lines: (db.contract_lines ?? []).filter((x) => x.contract_id === c.id),
    }))
  }
  return json(single ? (list[0] ?? null) : list)
}) as typeof fetch

// ─── Exécution ────────────────────────────────────────────────────────
const { loadDemoData } = await import('../src/features/parametres/demoData')

const steps: string[] = []
const t0 = Date.now()
const origWarn = console.warn
const warnings: string[] = []
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); origWarn(...args) }

await loadDemoData('org-demo', 'SARL Vincent Sécurité', (label, current, total) => {
  steps.push(`${current}/${total} ${label}`)
})

const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}
const count = (t: string, f: (r: Row) => boolean = () => true) => (db[t] ?? []).filter(f).length

console.log(`\nChargement en ${((Date.now() - t0) / 1000).toFixed(1)} s, ${steps.length} étapes (dernière : ${steps.at(-1)})\n`)
check('11 clients', count('clients') === 11, String(count('clients')))
check('11 sites', count('sites') === 11, String(count('sites')))
check('~100 équipements', count('equipment_units') >= 90, String(count('equipment_units')))
check('4 techniciens', count('technicians') === 4)
check('5 habilitations', count('certifications') === 5)
check('2 véhicules', count('vehicles') === 2)
check('3 rapports finalisés', count('reports', (r) => !!r.completed_at) === 3)
check('3 PDF générés', count('reports', (r) => typeof r.pdf_url === 'string') === 3,
  `${count('reports', (r) => typeof r.pdf_url === 'string')} PDF`)
const nonConform = (db.reports ?? []).filter((r) => r.is_conform === false)
check('1 rapport non conforme (2 anomalies)', nonConform.length === 1 && nonConform[0]?.anomaly_count === 2,
  JSON.stringify((db.reports ?? []).map((r) => [r.is_conform, r.anomaly_count])))
check('2 anomalies ouvertes', count('anomalies') === 2)
check('Contrôles équipement enregistrés', count('equipment_checks') > 20, String(count('equipment_checks')))
check('Équipements à réformer / à surveiller', count('equipment_units', (u) => u.status === 'to_replace') === 1
  && count('equipment_units', (u) => u.status === 'to_watch') === 1)
const iv = db.interventions ?? []
check('Interventions terminées (3 rapports + 4 anciennes)', iv.filter((i) => i.status === 'terminee').length === 7,
  String(iv.filter((i) => i.status === 'terminee').length))
check('1 intervention en cours', iv.filter((i) => i.status === 'en_cours').length === 1)
check('3 interventions à planifier', iv.filter((i) => i.status === 'a_planifier').length === 3)
check('Visites de l\'an prochain créées à la finalisation', iv.filter((i) => i.auto_generated === true).length === 3,
  String(iv.filter((i) => i.auto_generated === true).length))
const nextVisits = iv.filter((i) => i.auto_generated === true)
check('Visites de l\'an prochain liées au site (liste des équipements dans le rapport)',
  nextVisits.length === 3 && nextVisits.every((i) => !!i.site_id && i.duration_minutes != null),
  JSON.stringify(nextVisits.map((i) => [!!i.site_id, i.duration_minutes])))
check('3 devis (1 accepté)', count('quotes') === 3 && count('quotes', (q) => q.status === 'accepted') === 1)
check('9 factures dont 7 payées', count('invoices', (f) => !f.contract_id) === 9 && count('invoices', (f) => f.status === 'paid') === 7)
const paidMonths = new Set((db.invoices ?? []).filter((f) => f.paid_at).map((f) => String(f.paid_at).slice(0, 7)))
check('Paiements répartis sur 6 mois', paidMonths.size === 6, [...paidMonths].sort().join(' '))
check('2 événements d\'agenda privés', count('planning_blocks', (b) => b.is_private === true) === 2)
check('1 lien portail client', count('client_portal_tokens') === 1)
check('Catalogue de 29 articles', count('catalog_items') === 29, String(count('catalog_items')))
check('3 contrats actifs', count('contracts', (c) => c.status === 'active') === 3, (db.contracts ?? []).map((c) => c.reference).join(' '))
check('Lignes de contrat avec quantités du parc', count('contract_lines') >= 6 && (db.contract_lines ?? []).every((l) => Number(l.quantity) > 0),
  (db.contract_lines ?? []).map((l) => `${l.description?.toString().slice(0, 18)}×${l.quantity}`).join(', '))
const contractVisits = (db.interventions ?? []).filter((i) => i.contract_id)
check('Chaque contrat a sa visite rattachée', new Set(contractVisits.map((i) => i.contract_id)).size === 3,
  contractVisits.map((i) => `${i.site_name} ${i.status}`).join(' | '))
// ─── Facturer le mois (contrats, étape B) ─────────────────────────────
const { loadMonthBilling, createBillingInvoices } = await import('../src/features/contrats/billingApi')
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const today = new Date()
const isoToday = `${monthOf(today)}-${String(today.getDate()).padStart(2, '0')}`
const stjeanContract = (db.contracts ?? []).find((c) => c.client_name === 'Clinique Saint-Jean')
const stjeanVisit = (db.interventions ?? []).find((i) => i.contract_id === stjeanContract?.id)
// La visite rattachée au contrat de la Clinique est faite aujourd'hui
if (stjeanVisit) Object.assign(stjeanVisit, { status: 'terminee', scheduled_date: isoToday })
const plan1 = await loadMonthBilling(monthOf(today))
const pStjean = plan1.proposals.find((p) => p.contract.client_name === 'Clinique Saint-Jean')
check('Facturer le mois : visite de la Clinique proposée (extincteurs + RIA)', pStjean?.kind === 'per_visit' && pStjean.lines.length === 2,
  JSON.stringify(pStjean?.lines.map((l) => [l.description, l.quantity, l.unit_price_ht])))
const res1 = await createBillingInvoices(pStjean ? [pStjean] : [], 'org-demo', 'ce mois')
const inv1 = (db.invoices ?? []).find((f) => f.id === res1.created[0]?.id)
check('Facture de contrat créée en brouillon, liée au contrat et à la visite',
  res1.errors.length === 0 && inv1?.status === 'draft' && inv1?.contract_id === stjeanContract?.id && stjeanVisit?.contract_invoice_id === inv1?.id
  && count('invoice_lines', (l) => l.invoice_id === inv1?.id) === 2, JSON.stringify(res1))
const plan2 = await loadMonthBilling(monthOf(today))
check('Visite facturée : plus proposée', !plan2.proposals.some((p) => p.contract.client_name === 'Clinique Saint-Jean'))
// Échéance d'avance des Tilleuls (dans ~40 jours)
const in40 = new Date(today)
in40.setDate(in40.getDate() + 40)
const plan3 = await loadMonthBilling(monthOf(in40))
const pTil = plan3.proposals.find((p) => p.contract.client_name === 'Résidence Les Tilleuls')
check("Échéance d'avance des Tilleuls proposée le bon mois", pTil?.kind === 'advance' && !!pTil.periodStart && pTil.totals.ht > 0,
  `${pTil?.summary} — ${pTil?.totals.ht} € HT`)
// Étape C : la reconduction des Tilleuls déclenche la révision de +2,5 % sur cette échéance
const { pendingRevision } = await import('../src/features/contrats/schemas')
const { applyContractRevision } = await import('../src/features/contrats/api')
const { fetchContractAlerts } = await import('../src/features/contrats/alerts')
const ctrAlerts = await fetchContractAlerts()
check('Alertes de contrat : reconductions des Tilleuls et de Montaigne', ctrAlerts.filter((a) => a.kind === 'renewal').length === 2
  && ctrAlerts.every((a) => a.kind !== 'revision'), ctrAlerts.map((a) => `${a.contract.client_name} ${a.kind} J${a.daysUntil}`).join(' | '))
const revTil = pTil?.periodStart ? pendingRevision(pTil.contract, pTil.periodStart) : null
check('Révision de +2,5 % signalée sur l\'échéance des Tilleuls', revTil?.rate === 2.5 && revTil.from === pTil?.periodStart, JSON.stringify(revTil))
if (pTil && revTil) await applyContractRevision(pTil.contract, revTil.from)
const plan3b = await loadMonthBilling(monthOf(in40))
const pTilRev = plan3b.proposals.find((p) => p.contract.client_name === 'Résidence Les Tilleuls')
check('Échéance recalculée avec les prix révisés', !!pTilRev && Math.abs(pTilRev.totals.ht - (pTil?.totals.ht ?? 0) * 1.025) < 0.2
  && !!pTilRev.periodStart && pendingRevision(pTilRev.contract, pTilRev.periodStart) === null, `${pTil?.totals.ht} → ${pTilRev?.totals.ht} € HT`)
const res3 = await createBillingInvoices(pTilRev ? [pTilRev] : [], 'org-demo', 'dans 40 jours')
const plan4 = await loadMonthBilling(monthOf(in40))
check('Échéance facturée : plus proposée, signalée « déjà facturée »', res3.created.length === 1
  && !plan4.proposals.some((p) => p.contract.client_name === 'Résidence Les Tilleuls')
  && plan4.skipped.some((x) => x.contract.client_name === 'Résidence Les Tilleuls'), JSON.stringify(res3.errors))
// ─── Export comptable ────────────────────────────────────────────────
const { exportAccounting } = await import('../src/features/export/accountingExport')
const { unzipSync, strFromU8 } = await import('fflate')
const { default: ExcelJS } = await import('exceljs')
const exp = await exportAccounting('2000-01-01', '2100-12-31', 'SARL Vincent Sécurité')
const unzipped = unzipSync(new Uint8Array(await exp.blob.arrayBuffer()))
const names = Object.keys(unzipped)
const xlsxName = names.find((n) => n.endsWith('.xlsx'))
const csvName = names.find((n) => n.endsWith('.csv'))
const wbx = new ExcelJS.Workbook()
if (xlsxName) await wbx.xlsx.load(unzipped[xlsxName]!.buffer as ArrayBuffer)
const sheetNames = wbx.worksheets.map((w) => w.name)
const csv = csvName ? strFromU8(unzipped[csvName]!) : ''
check('Export comptable : ZIP (LISEZ-MOI, classeur, journal FEC)', names.includes('LISEZ-MOI.txt') && !!xlsxName && !!csvName, names.join(', '))
check('Classeur : factures, journal, TVA, notes de frais', ['Factures', 'Journal des ventes', 'TVA collectée', 'Notes de frais'].every((n) => sheetNames.includes(n)), sheetNames.join(', '))
check('Factures émises exportées (brouillons exclus), journal équilibré', exp.invoiceCount === count('invoices', (f) => f.status !== 'draft' && f.status !== 'cancelled') && exp.balanced,
  `${exp.invoiceCount} factures, ${exp.totalHt} € HT`)
check('Journal FEC : 18 colonnes, une écriture 411 par facture', csv.split('\r\n')[0]?.replace(/^\uFEFF/, '').split(';').length === 18
  && csv.split('\r\n').filter((l) => l.includes(';411000;')).length === exp.invoiceCount, csv.split('\r\n')[1] ?? '')
check('Aucun avertissement', warnings.length === 0, warnings.join(' | '))

// PDF générés → fichiers pour relecture
mkdirSync('scripts/out', { recursive: true })
let n = 0
for (const [path, blob] of Object.entries(storage)) {
  if (!(blob instanceof Blob)) continue
  const file = `scripts/out/demo-${path.split('/').pop()}`
  writeFileSync(file, Buffer.from(await blob.arrayBuffer()))
  n++
}
console.log(`\n${n} PDF écrits dans scripts/out/`)
console.log(failures === 0 ? '\nTOUT EST BON' : `\n${failures} ÉCHEC(S)`)
globalThis.process.exitCode = failures === 0 ? 0 : 1
