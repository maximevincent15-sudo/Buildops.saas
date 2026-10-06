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
const REF_PREFIX: Record<string, string> = { interventions: 'INT-', quotes: 'DEV-2026-', invoices: 'FAC-2026-' }

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
  const list = limit ? rows.slice(0, limit) : rows
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
check('3 devis (1 accepté)', count('quotes') === 3 && count('quotes', (q) => q.status === 'accepted') === 1)
check('9 factures dont 7 payées', count('invoices') === 9 && count('invoices', (f) => f.status === 'paid') === 7)
const paidMonths = new Set((db.invoices ?? []).filter((f) => f.paid_at).map((f) => String(f.paid_at).slice(0, 7)))
check('Paiements répartis sur 6 mois', paidMonths.size === 6, [...paidMonths].sort().join(' '))
check('2 événements d\'agenda privés', count('planning_blocks', (b) => b.is_private === true) === 2)
check('1 lien portail client', count('client_portal_tokens') === 1)
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
