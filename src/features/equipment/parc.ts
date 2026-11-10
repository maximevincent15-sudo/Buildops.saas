/**
 * « Parc du site » : saisie du parc d'un site en tableau (comme un tableur),
 * avec reprise d'un tableau copié depuis un ancien rapport (Word, PDF, Excel).
 *
 * Fonctions pures : lecture du presse-papiers, reconnaissance des colonnes,
 * rapprochement avec les appareils existants, contrôles et calcul des
 * modifications à enregistrer. Aucun accès à la base ici.
 */
import Papa from 'papaparse'
import { normalize, resolveFamily } from './familyResolver'
import { FAMILY_PREFIX } from './identification'
import { EQUIPMENT_FAMILIES } from './schemas'
import type { EquipmentFamily, EquipmentUnit, Zone } from './schemas'

// ─── Colonnes ────────────────────────────────────────────

export const PARC_FIELDS = ['serial', 'family', 'subtype', 'zone', 'implantation', 'brand', 'year'] as const
export type ParcField = (typeof PARC_FIELDS)[number]

export const PARC_FIELD_LABELS: Record<ParcField, string> = {
  serial: 'N°',
  family: 'Famille',
  subtype: 'Type',
  zone: 'Zone',
  implantation: 'Emplacement',
  brand: 'Marque',
  year: 'Année',
}

/** Correspondance avec les clés de l'import Excel (pour reconnaître les intitulés) */
export const IMPORT_KEY_TO_PARC: Record<string, ParcField> = {
  serial_number: 'serial',
  family: 'family',
  subtype: 'subtype',
  zone_name: 'zone',
  implantation: 'implantation',
  brand: 'brand',
  install_year: 'year',
}

export type ParcRow = {
  /** Clé React stable */
  key: string
  /** Appareil existant, ou null pour une ligne nouvelle */
  unitId: string | null
  family: EquipmentFamily | ''
  serial: string
  subtype: string
  zone: string
  implantation: string
  brand: string
  year: string
}

/** Champs modifiables d'un appareil existant (N° et famille se changent dans la fiche) */
export const EXISTING_EDITABLE: ReadonlySet<ParcField> = new Set(['subtype', 'zone', 'implantation', 'brand', 'year'])

export function isEditable(row: ParcRow, field: ParcField): boolean {
  return row.unitId === null || EXISTING_EDITABLE.has(field)
}

let keySeq = 0
export function newRowKey(): string {
  keySeq += 1
  return `new-${Date.now().toString(36)}-${keySeq}`
}

export function emptyRow(family: EquipmentFamily | '' = ''): ParcRow {
  return { key: newRowKey(), unitId: null, family, serial: '', subtype: '', zone: '', implantation: '', brand: '', year: '' }
}

export function isBlankRow(r: ParcRow): boolean {
  return r.unitId === null && !r.serial.trim() && !r.subtype.trim() && !r.zone.trim()
    && !r.implantation.trim() && !r.brand.trim() && !r.year.trim()
}

// ─── N° ──────────────────────────────────────────────────

/**
 * N° comparable : « DSF-01 », « 01 » et « 1 » désignent le même appareil
 * (préfixe de la famille et zéros de tête ignorés), sans tenir compte de la casse.
 */
export function serialKey(family: EquipmentFamily | '', serial: string): string {
  let s = serial.trim().toUpperCase().replace(/\s+/g, ' ')
  if (family) {
    const prefix = FAMILY_PREFIX[family]
    const m = new RegExp(`^${prefix}\\s*[-–.]?\\s*(.+)$`).exec(s)
    if (m) s = m[1]!.trim()
  }
  if (/^\d+$/.test(s)) s = String(parseInt(s, 10))
  return s
}

/** N° à enregistrer pour une ligne nouvelle : sans le préfixe de la famille (« EXT-03 » → « 03 ») */
export function cleanSerial(family: EquipmentFamily | '', serial: string): string {
  const s = serial.trim()
  if (!family) return s
  const m = new RegExp(`^${FAMILY_PREFIX[family]}\\s*[-–.]?\\s*(\\d+)$`, 'i').exec(s)
  return m ? m[1]! : s
}

/** Année lue dans une valeur libre (« 2019 », « 03/2019 », « 15/03/2019 ») */
export function parseYearLoose(input: string): number | null {
  const m = /(?:^|\D)((?:19[5-9]|20\d)\d)(?:\D|$)/.exec(input)
  return m ? parseInt(m[1]!, 10) : null
}

// ─── Lignes à partir des appareils ───────────────────────

export function rowFromUnit(u: EquipmentUnit, zonesById: Map<string, Pick<Zone, 'name'>>): ParcRow {
  return {
    key: u.id,
    unitId: u.id,
    family: u.family,
    serial: u.serial_number,
    subtype: u.subtype ?? '',
    zone: (u.zone_id ? zonesById.get(u.zone_id)?.name : '') ?? '',
    implantation: u.implantation ?? '',
    brand: u.brand ?? '',
    year: u.install_year ? String(u.install_year) : '',
  }
}

/** Ordre du tableau : famille, puis N° (2 avant 10), comme sur les étiquettes */
export function compareRows(a: ParcRow, b: ParcRow): number {
  const fa = a.family ? EQUIPMENT_FAMILIES.indexOf(a.family) : 99
  const fb = b.family ? EQUIPMENT_FAMILIES.indexOf(b.family) : 99
  return fa - fb || a.serial.localeCompare(b.serial, 'fr', { numeric: true })
}

// ─── Presse-papiers ──────────────────────────────────────

/**
 * Tableau copié (Excel, Word, page web, PDF) → lignes de cellules.
 * Tabulations d'abord (Excel et Word), sinon points-virgules, sinon une
 * cellule par ligne (une colonne copiée seule, ou un PDF sans colonnes).
 */
export function parseClipboardTable(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n+$/, '')
  if (!clean.trim()) return []
  const lines = clean.split('\n')
  let rows: string[][]
  if (clean.includes('\t')) {
    // Papa gère les cellules entre guillemets d'Excel (retours à la ligne dedans)
    const res = Papa.parse<string[]>(clean, { delimiter: '\t', skipEmptyLines: false })
    rows = res.data
  } else if (lines.filter((l) => l.includes(';')).length >= Math.max(1, Math.ceil(lines.length / 2))) {
    rows = lines.map((l) => l.split(';'))
  } else {
    rows = lines.map((l) => [l])
  }
  const trimmed = rows.map((r) => r.map((c) => (c ?? '').replace(/\s+/g, ' ').trim()))
  // Colonnes vides à droite retirées, lignes vides ignorées
  return trimmed
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => {
      let end = r.length
      while (end > 0 && r[end - 1] === '') end--
      return r.slice(0, end)
    })
}

/** Mapping colonne → champ : null = colonne ignorée */
export type ColumnMapping = Array<ParcField | null>

/** Valeur qui ressemble exactement à un nom de famille (« Extincteur », « BAES », « RIA ») */
function looksLikeFamilyName(v: string): boolean {
  const n = normalize(v)
  if (n.length > 30) return false
  const f = resolveFamily(v)
  if (!f) return false
  const words = n.split(/[\s/,-]+/).filter(Boolean)
  return words.length <= 3 && !/\d/.test(n)
}

/**
 * Devine le sens de chaque colonne quand le tableau collé n'a pas de titres :
 * N° (court, avec un chiffre), année, famille, type (reconnu comme un
 * équipement), marque (mot court répété), emplacement (le texte le plus long).
 */
export function guessColumns(rows: string[][]): ColumnMapping {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const mapping: ColumnMapping = Array(width).fill(null)
  const used = new Set<ParcField>()
  const cols = Array.from({ length: width }, (_, c) => rows.map((r) => r[c] ?? '').filter((v) => v !== ''))
  const share = (values: string[], test: (v: string) => boolean) =>
    values.length === 0 ? 0 : values.filter(test).length / values.length
  const assign = (c: number, f: ParcField) => { mapping[c] = f; used.add(f) }

  // Une seule colonne : c'est souvent la liste des emplacements
  if (width === 1) {
    const vals = cols[0]!
    if (share(vals, (v) => /^[A-Za-z]{0,4}[-\s.]?\d{1,5}$/.test(v)) >= 0.8) assign(0, 'serial')
    else assign(0, 'implantation')
    return mapping
  }

  cols.forEach((vals, c) => {
    if (mapping[c] || used.has('year')) return
    if (share(vals, (v) => v.length <= 10 && parseYearLoose(v) !== null && !/[a-z]{3,}/i.test(v)) >= 0.7) assign(c, 'year')
  })
  cols.forEach((vals, c) => {
    if (mapping[c] || used.has('serial')) return
    if (share(vals, (v) => v.length <= 10 && /\d/.test(v) && !/^(19|20)\d\d$/.test(v)) >= 0.7) assign(c, 'serial')
  })
  cols.forEach((vals, c) => {
    if (mapping[c] || used.has('family')) return
    if (share(vals, looksLikeFamilyName) >= 0.7) assign(c, 'family')
  })
  cols.forEach((vals, c) => {
    if (mapping[c] || used.has('subtype')) return
    if (share(vals, (v) => resolveFamily(v) !== null) >= 0.6) assign(c, 'subtype')
  })
  // Type court avec une capacité (« EP6 », « CO2 2 kg », « P9 ABC »)
  cols.forEach((vals, c) => {
    if (mapping[c] || used.has('subtype')) return
    if (share(vals, (v) => v.length <= 20 && /\d/.test(v) && /[a-z]/i.test(v)) >= 0.6) assign(c, 'subtype')
  })
  // Marque : mot court, sans chiffre, souvent répété
  cols.forEach((vals, c) => {
    if (mapping[c] || used.has('brand') || vals.length === 0) return
    const distinct = new Set(vals.map((v) => v.toLowerCase())).size
    if (share(vals, (v) => v.length <= 18 && !/\d/.test(v) && v.split(' ').length <= 2) >= 0.8 && distinct <= Math.max(2, vals.length / 2)) assign(c, 'brand')
  })
  // Emplacement : la colonne de texte la plus longue qui reste
  let best = -1
  let bestLen = 0
  cols.forEach((vals, c) => {
    if (mapping[c] || vals.length === 0) return
    const avg = vals.reduce((n, v) => n + v.length, 0) / vals.length
    if (avg > bestLen) { best = c; bestLen = avg }
  })
  if (best >= 0 && !used.has('implantation')) assign(best, 'implantation')
  return mapping
}

export type PastedRecord = Partial<Record<ParcField, string>>

export function recordsFromTable(rows: string[][], mapping: ColumnMapping): PastedRecord[] {
  return rows
    .map((r) => {
      const rec: PastedRecord = {}
      mapping.forEach((f, c) => {
        const v = (r[c] ?? '').trim()
        if (!f || !v) return
        // Deux colonnes pour le même champ (« Bâtiment » + « Niveau ») : mises bout à bout
        rec[f] = rec[f] ? `${rec[f]} · ${v}` : v
      })
      return rec
    })
    .filter((rec) => Object.keys(rec).length > 0)
}

// ─── Ajout d'un tableau collé ────────────────────────────

export type MergeOptions = {
  /** Famille des lignes qui n'en indiquent pas (et dont le type ne la donne pas) */
  defaultFamily: EquipmentFamily | ''
  /** Numéroter à la suite les lignes sans N° */
  autoNumber: boolean
}

export type MergeResult = {
  rows: ParcRow[]
  /** Appareils déjà dans le tableau, complétés */
  completed: number
  /** Lignes nouvelles */
  added: number
}

function nextNumber(rows: ParcRow[], family: EquipmentFamily | ''): number {
  let max = 0
  for (const r of rows) {
    if (r.family !== family) continue
    const k = serialKey(family, r.serial)
    if (/^\d+$/.test(k)) max = Math.max(max, parseInt(k, 10))
  }
  return max + 1
}

/**
 * Lignes collées → tableau. Une ligne dont le N° et la famille désignent un
 * appareil déjà présent le complète (ses valeurs collées remplacent les
 * anciennes) ; les autres deviennent des lignes nouvelles.
 */
export function mergePastedRecords(rows: ParcRow[], records: PastedRecord[], opts: MergeOptions): MergeResult {
  const out = rows.map((r) => ({ ...r }))
  const index = new Map<string, number>()
  out.forEach((r, i) => { if (r.serial.trim()) index.set(`${r.family}::${serialKey(r.family, r.serial)}`, i) })
  let completed = 0
  let added = 0

  for (const rec of records) {
    const family: EquipmentFamily | '' = resolveFamily(rec.family) ?? resolveFamily(rec.subtype) ?? opts.defaultFamily
    let serial = (rec.serial ?? '').trim()
    const values = {
      subtype: rec.subtype ?? '',
      zone: rec.zone ?? '',
      implantation: rec.implantation ?? '',
      brand: rec.brand ?? '',
      year: rec.year ? String(parseYearLoose(rec.year) ?? rec.year) : '',
    }
    const at = serial ? index.get(`${family}::${serialKey(family, serial)}`) : undefined
    if (at !== undefined) {
      const target = out[at]!
      for (const [k, v] of Object.entries(values) as Array<[keyof typeof values, string]>) {
        if (v) target[k] = v
      }
      completed++
      continue
    }
    if (!serial && opts.autoNumber && family) serial = String(nextNumber(out, family))
    const row: ParcRow = { ...emptyRow(family), serial: cleanSerial(family, serial), ...values }
    out.push(row)
    if (row.serial) index.set(`${family}::${serialKey(family, row.serial)}`, out.length - 1)
    added++
  }
  return { rows: out, completed, added }
}

/**
 * Collage dans une cellule (comme dans un tableur) : le bloc copié remplit
 * les cellules à partir de celle-ci, vers la droite et vers le bas, en
 * ajoutant des lignes au besoin. Les cellules non modifiables sont sautées.
 */
export function pasteBlock(
  rows: ParcRow[],
  startRow: number,
  startField: ParcField,
  block: string[][],
  columns: readonly ParcField[],
): ParcRow[] {
  const out = rows.map((r) => ({ ...r }))
  const startCol = columns.indexOf(startField)
  const lastFamily = [...out].reverse().find((r) => r.family)?.family ?? ''
  block.forEach((cells, i) => {
    const ri = startRow + i
    if (ri >= out.length) out.push(emptyRow(lastFamily))
    const row = out[ri]!
    cells.forEach((value, j) => {
      const field = columns[startCol + j]
      if (!field || !isEditable(row, field)) return
      if (field === 'family') {
        const f = resolveFamily(value)
        if (f) row.family = f
        return
      }
      if (field === 'year') {
        row.year = value ? String(parseYearLoose(value) ?? value) : ''
        return
      }
      row[field] = value
    })
  })
  return out
}

// ─── Contrôles ───────────────────────────────────────────

/** Famille retenue pour une ligne : celle choisie, sinon déduite du type */
export function rowFamily(r: ParcRow): EquipmentFamily | '' {
  return r.family || resolveFamily(r.subtype) || ''
}

/** Clé de N° : `famille::n°` (voir serialKey) */
export function serialSlot(family: EquipmentFamily | '', serial: string): string {
  return `${family}::${serialKey(family, serial)}`
}

/**
 * Erreur à corriger avant d'enregistrer, par clé de ligne. `reserved` : N°
 * pris par des appareils retirés du site (la base refuse de les réutiliser).
 */
export function validateRows(rows: ParcRow[], reserved: ReadonlySet<string> = new Set()): Map<string, string> {
  const errors = new Map<string, string>()
  const seen = new Map<string, ParcRow>()
  for (const r of rows) {
    if (isBlankRow(r)) continue
    const family = rowFamily(r)
    if (r.unitId === null) {
      if (!family) { errors.set(r.key, 'Famille à choisir'); continue }
      if (!r.serial.trim()) { errors.set(r.key, 'N° à renseigner'); continue }
    }
    if (r.year.trim() && parseYearLoose(r.year) === null) { errors.set(r.key, 'Année non reconnue'); continue }
    const k = serialSlot(family, r.serial)
    if (r.unitId === null && reserved.has(k)) { errors.set(r.key, 'N° pris par un appareil retiré'); continue }
    const first = seen.get(k)
    if (!first) { seen.set(k, r); continue }
    // L'appareil existant garde son N° : c'est la ligne nouvelle qui est en double
    if (r.unitId === null || first.unitId !== null) {
      errors.set(r.key, 'N° déjà utilisé')
    } else {
      errors.set(first.key, 'N° déjà utilisé')
      seen.set(k, r)
    }
  }
  return errors
}

// ─── Modifications à enregistrer ─────────────────────────

export type UnitPatch = {
  subtype?: string | null
  implantation?: string | null
  brand?: string | null
  install_year?: number | null
  zone_id?: string | null
}

export type ParcChanges = {
  /** Appareils existants modifiés : champs changés (zone par son nom, résolue à l'enregistrement) */
  updates: Array<{ unitId: string; key: string; patch: Omit<UnitPatch, 'zone_id'>; zoneName?: string }>
  /** Lignes nouvelles à créer */
  creates: ParcRow[]
  /** Zones à créer, dans l'ordre du tableau (ordre de passage) */
  newZones: string[]
}

/** Zone existante portant ce nom (casse et accents ignorés) */
export function findZone(zones: Zone[], name: string): Zone | undefined {
  const n = normalize(name)
  return n ? zones.find((z) => normalize(z.name) === n) : undefined
}

const blank = (s: string) => s.trim() || null

export function computeChanges(rows: ParcRow[], original: Map<string, ParcRow>, zones: Zone[]): ParcChanges {
  const updates: ParcChanges['updates'] = []
  const creates: ParcRow[] = []
  const newZones: string[] = []
  const noteZone = (name: string) => {
    const t = name.trim()
    if (!t || findZone(zones, t)) return
    if (!newZones.some((z) => normalize(z) === normalize(t))) newZones.push(t)
  }

  for (const r of rows) {
    if (isBlankRow(r)) continue
    if (r.unitId === null) {
      noteZone(r.zone)
      creates.push(r)
      continue
    }
    const o = original.get(r.unitId)
    if (!o) continue
    const patch: Omit<UnitPatch, 'zone_id'> = {}
    if (r.subtype.trim() !== o.subtype.trim()) patch.subtype = blank(r.subtype)
    if (r.implantation.trim() !== o.implantation.trim()) patch.implantation = blank(r.implantation)
    if (r.brand.trim() !== o.brand.trim()) patch.brand = blank(r.brand)
    if (r.year.trim() !== o.year.trim()) patch.install_year = parseYearLoose(r.year)
    const zoneChanged = normalize(r.zone) !== normalize(o.zone)
    if (zoneChanged) noteZone(r.zone)
    if (Object.keys(patch).length > 0 || zoneChanged) {
      updates.push({ unitId: r.unitId, key: r.key, patch, ...(zoneChanged ? { zoneName: r.zone.trim() } : {}) })
    }
  }
  return { updates, creates, newZones }
}

export function changeCount(c: ParcChanges): number {
  return c.updates.length + c.creates.length
}
