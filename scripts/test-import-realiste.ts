/**
 * Test de bout en bout de l'import (clients + registre d'équipements) avec un
 * export réaliste « logiciel maison » : CSV Windows-1252, séparateur « ; »,
 * intitulés d'autres logiciels, dates françaises, doublons, erreurs volontaires.
 *
 * Le vrai code d'import tourne ; les requêtes Supabase sont interceptées par
 * une base en mémoire (aucune donnée réelle n'est lue ni écrite).
 *
 * Usage : npx vite-node scripts/test-import-realiste.ts
 */
import ExcelJS from 'exceljs'

// ─── Fausse base PostgREST en mémoire ─────────────────────────────────
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const m = /\/rest\/v1\/([a-z_]+)/.exec(url.pathname)
  if (!m) return json({})
  const table = m[1]
  db[table] ??= []
  const method = (init?.method ?? 'GET').toUpperCase()
  const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object') ?? false
  if (method === 'POST') {
    const body = JSON.parse(String(init?.body))
    const rows = (Array.isArray(body) ? body : [body]).map((r: Row) => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...r,
    }))
    db[table].push(...rows)
    return json(single ? rows[0] : rows, 201)
  }
  let rows = db[table]
  for (const [k, v] of url.searchParams) {
    if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3))
  }
  return json(single ? (rows[0] ?? null) : rows)
}) as typeof fetch

// ─── Générateur de données réalistes ──────────────────────────────────
let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]

function luhnSiren(base8: string): string {
  for (let k = 0; k <= 9; k++) {
    const s = base8 + k
    let sum = 0
    for (let i = 0; i < 9; i++) {
      let d = Number(s[i])
      if ((8 - i) % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
      sum += d
    }
    if (sum % 10 === 0) return s
  }
  return base8 + '0'
}

const TYPES = ['Mairie de', 'Résidence', 'Clinique', 'Collège', 'SCI', 'Hôtel', 'Crèche', 'Supermarché', 'Garage', 'Entrepôt']
const NOMS = ['Les Tilleuls', 'Saint-Jean', 'du Château', 'Beauséjour', 'Les Érables', 'Côte d\'Azur', 'Pré Fleuri', 'Montaigne', 'Hélios', 'La Forêt']
const VILLES: Array<[string, string]> = [['78300', 'Poissy'], ['78000', 'Versailles'], ['95000', 'Cergy'], ['92100', 'Boulogne-Billancourt'], ['75015', 'Paris']]

const clientNames: string[] = []
const clientLines = ['Code client;Raison sociale;Interlocuteur;Tél;Portable;Mail;Adresse;CP;Ville;SIRET;Observations']
for (let i = 1; i <= 300; i++) {
  const name = `${pick(TYPES)} ${pick(NOMS)} ${i}`
  clientNames.push(name)
  const [cp, ville] = pick(VILLES)
  const hasTel = rand() > 0.3
  const siret = i % 7 === 0 ? '12345678901234' : i % 3 === 0 ? '' : luhnSiren(String(10000000 + i * 7919).slice(0, 8))
  const email = i === 10 ? 'contact@@mairie' : rand() > 0.2 ? `contact${i}@exemple.fr` : ''
  clientLines.push([
    `C${String(i).padStart(4, '0')}`, name, `M. Dupré ${i}`, hasTel ? '01 39 65 00 00' : '', hasTel ? '' : '06 12 34 56 78',
    email, `${i} rue de la Forêt`, cp, ville, siret, i % 11 === 0 ? 'Accès par l\'arrière, clé à l\'accueil' : '',
  ].join(';'))
}
clientLines.push(clientLines[4].replace('C0004', 'C9999')) // doublon dans le fichier

const FAMILLES: Array<[string, string, string]> = [
  ['EXT', 'EP 6L', 'SICLI'], ['Extincteur', 'CO2 2kg', 'ANDRIEU'], ['', 'Extincteur poudre ABC 9kg', 'DESAUTEL'],
  ['B.A.E.S', 'BAES évacuation', 'LEGRAND'], ['RIA', 'RIA DN 25', 'EUROFEU'], ['Porte CF', 'Porte coupe-feu 1h', 'MALERBA'],
  ['Désenfumage', 'Exutoire', 'COLT'], ['DETECTION', 'Déclencheur manuel', 'NUGELEC'],
]
const DATES = ['15/03/2019', '2018', '03/2020', '', '2021-06-01']
const equipLines = ['Client;Site;Adresse site;Bâtiment;Emplacement;Famille;Désignation;N°;N° série;Fabricant;Date fabrication;Observations']
const equipRows: string[][] = []
for (let s = 0; s < 50; s++) {
  const client = clientNames[s % 30]
  const site = s < 30 ? 'Siège' : `Annexe ${s}` // « Siège » existe chez 30 clients différents
  const counters: Record<string, number> = {}
  for (let k = 0; k < 16; k++) {
    const idx = Math.floor(rand() * FAMILLES.length)
    const [fam, des, marque] = FAMILLES[idx]
    // Numérotation par famille sur le site (les 3 variantes d'extincteurs partagent la même)
    const famKey = idx <= 2 ? 'ext' : fam
    counters[famKey] = (counters[famKey] ?? 0) + 1
    const row = [client, site, `${s + 1} avenue de la Gare, 78300 Poissy`, pick(['Bât A', 'Bât B', 'RDC', '1er étage']),
      pick(['Entrée', 'Couloir', 'Local technique', 'Cuisine']), fam, des, '',
      `SN${Math.floor(rand() * 900000 + 100000)}`, marque, pick(DATES), rand() > 0.8 ? 'Néant' : '']
    row[7] = String(counters[famKey]).padStart(2, '0')
    equipRows.push(row)
  }
}
equipRows.push([...equipRows[3]], [...equipRows[40]], [...equipRows[100]]) // 3 doublons dans le fichier
equipRows.push(['Client Inconnu SARL', 'Siège', '', '', '', 'EXT', 'EP 6L', '01', '', '', '2020', '']) // client inconnu
equipRows.push([clientNames[0], 'Siège', '', '', '', 'Pompe', 'Pompe de relevage', '01', '', '', '', '']) // famille inconnue
equipRows.push([clientNames[1], 'Siège', '', '', 'Hall', 'EXT', 'EP 6L', '', 'SN999999', '', '2017', '']) // sans N°, avec N° série
for (const r of equipRows) equipLines.push(r.join(';'))

const toFile = (lines: string[], name: string) =>
  new File([Buffer.from(lines.join('\r\n'), 'latin1')], name, { type: 'text/csv' })

// ─── Exécution ────────────────────────────────────────────────────────
const { parseImportFile } = await import('../src/features/imports/parsers')
const { analyzeRows, importRows } = await import('../src/features/imports/analyze')
const { clientsImportDefinition } = await import('../src/features/imports/definitions/clientsImport')
const { equipmentsImportDefinition } = await import('../src/features/imports/definitions/equipmentsImport')

let failures = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failures++
}
const count = (rows: { status: string }[], s: string) => rows.filter((r) => r.status === s).length

// 1. Clients
const clientsParsed = await parseImportFile(toFile(clientLines, 'clients-export.csv'), clientsImportDefinition.fields)
check(clientsParsed.length === 301, `Clients lus : ${clientsParsed.length} lignes (301 attendues)`)
check(clientsParsed.some((r) => r.name?.includes('Résidence')), 'Accents conservés (encodage Windows détecté)')
const clientsAnalysis = await analyzeRows(clientsParsed, clientsImportDefinition, { organizationId: 'org', cache: {} })
check(count(clientsAnalysis, 'invalid') === 1, `Doublon dans le fichier détecté (${count(clientsAnalysis, 'invalid')} ligne rejetée)`)
const clientsResult = await importRows(clientsAnalysis, clientsImportDefinition, { organizationId: 'org', cache: {} })
check(clientsResult.created === 300 && clientsResult.errors.length === 0, `Clients créés : ${clientsResult.created}, erreurs : ${clientsResult.errors.length}`)
const c1 = db.clients.find((c) => c.name === clientNames[0])!
check(/, \d{5} /.test(String(c1.address)), `Adresse fusionnée avec CP + ville : « ${c1.address} »`)
check(db.clients.filter((c) => c.siren).length > 150, `SIREN importés : ${db.clients.filter((c) => c.siren).length}`)
check(!db.clients.some((c) => c.siren === '123456789'), 'SIRET invalides ignorés')
check(db.clients.every((c) => c.contact_phone), 'Téléphone repris du portable quand le fixe est vide')

// 2. Équipements
const equipParsed = await parseImportFile(toFile(equipLines, 'registre-export.csv'), equipmentsImportDefinition.fields)
check(equipParsed.length === 806, `Équipements lus : ${equipParsed.length} lignes (806 attendues)`)
const eqAnalysis = await analyzeRows(equipParsed, equipmentsImportDefinition, { organizationId: 'org', cache: {} })
const invalids = eqAnalysis.filter((r) => r.status === 'invalid')
check(invalids.length === 5, `Lignes rejetées : ${invalids.length} (3 doublons + client inconnu + famille inconnue)`)
for (const r of invalids) console.log(`     ↳ ligne ${r.index + 2} : ${r.messages[0]}`)
check(eqAnalysis.every((r) => r.status === 'invalid' || r.values.__resolved_client_id), 'Client résolu conservé jusqu\'à l\'enregistrement (bug corrigé)')
const eqResult = await importRows(eqAnalysis, equipmentsImportDefinition, { organizationId: 'org', cache: {} })
check(eqResult.created === 801 && eqResult.errors.length === 0, `Équipements créés : ${eqResult.created}, erreurs : ${eqResult.errors.length}`)
for (const e of eqResult.errors.slice(0, 3)) console.log(`     ↳ ligne ${e.rowIndex + 2} : ${e.message}`)
check(db.sites.length === 50, `Sites créés automatiquement : ${db.sites.length} (50 attendus, dont 30 « Siège » chez des clients différents)`)
check((db.zones?.length ?? 0) > 0, `Zones créées : ${db.zones?.length ?? 0}`)
const fams = new Map<string, number>()
for (const u of db.equipment_units) fams.set(String(u.family), (fams.get(String(u.family)) ?? 0) + 1)
check(fams.size === 6, `Familles reconnues (6 dans le fichier) : ${[...fams].map(([f, n]) => `${f} ${n}`).join(', ')}`)
const withYear = db.equipment_units.filter((u) => u.install_year != null)
check(withYear.length > 500 && withYear.every((u) => Number(u.install_year) >= 2017 && Number(u.install_year) <= 2021), `Années extraites des dates (15/03/2019 → 2019) : ${withYear.length} équipements datés`)
check(db.equipment_units.some((u) => String(u.notes ?? '').includes('N° série fabricant')), 'N° de série fabricant ajouté aux notes')
check(db.equipment_units.some((u) => u.serial_number === 'SN999999'), 'N° de série utilisé quand le N° d\'unité manque')

// 3. Ré-import du même fichier : rien ne doit être créé en double
const reAnalysis = await analyzeRows(equipParsed, equipmentsImportDefinition, { organizationId: 'org', cache: {} })
const reResult = await importRows(reAnalysis, equipmentsImportDefinition, { organizationId: 'org', cache: {} })
check(reResult.created === 0, `Ré-import du même fichier : ${reResult.created} créé, ${count(reAnalysis, 'duplicate')} doublons ignorés`)

// 4. Même registre en .xlsx avec de vraies dates Excel
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Registre')
ws.addRow(equipLines[0].split(';'))
for (const r of equipRows.slice(0, 50)) {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r[10])
  ws.addRow([...r.slice(0, 10), d ? new Date(`${d[3]}-${d[2]}-${d[1]}`) : r[10], r[11]])
}
const xlsx = await wb.xlsx.writeBuffer()
const xlsxParsed = await parseImportFile(new File([xlsx], 'registre.xlsx'), equipmentsImportDefinition.fields)
check(xlsxParsed.length === 50, `Excel .xlsx lu : ${xlsxParsed.length} lignes`)
check(xlsxParsed.some((r) => r.install_year?.startsWith('2019-03-15')), 'Dates Excel converties')

// 5. Ancien .xls
try {
  await parseImportFile(new File([Buffer.from('pas un vrai xlsx')], 'ancien.xls'), equipmentsImportDefinition.fields)
  check(false, 'Fichier .xls refusé avec un message clair')
} catch (e) {
  check(String((e as Error).message).includes('.xls'), `Fichier .xls : « ${(e as Error).message.slice(0, 70)}… »`)
}

console.log(failures === 0 ? '\n🎉 Tous les contrôles passent' : `\n⚠️ ${failures} contrôle(s) en échec`)
if (failures > 0) throw new Error(`${failures} contrôle(s) en échec`)
