/**
 * Inventaire au scan : lecture du contenu d'une étiquette QR et numérotation
 * des équipements ajoutés sur le terrain.
 *
 * Les étiquettes des mainteneurs contiennent soit un simple code, soit des
 * informations structurées (« N°: 0452 ; Type: EP6 ; Marque: Sicli ; Année: 2019 »,
 * JSON, lien avec paramètres…). On en tire ce qui sert à remplir la fiche.
 */
import { normalize, resolveFamily } from './familyResolver'
import type { EquipmentFamily } from './schemas'

export type LabelQrFields = {
  serial?: string
  manufacturerSerial?: string
  family?: EquipmentFamily
  subtype?: string
  brand?: string
  model?: string
  installYear?: number
  implantation?: string
  zoneName?: string
  /** Champs reconnus, pour le message « Rempli depuis le QR code : … » */
  filled: string[]
}

type FieldKey = Exclude<keyof LabelQrFields, 'filled'>

// Clés normalisées (minuscules, sans accents ni ponctuation) → champ de la fiche
const KEY_ALIASES: Array<[FieldKey, string[]]> = [
  ['manufacturerSerial', ['n serie', 'no serie', 'num serie', 'numero de serie', 'numero serie', 'n de serie', 'serie', 'sn', 's n', 'serial', 'serial number', 'n serie fabricant']],
  ['serial', ['n', 'no', 'num', 'numero', 'n appareil', 'numero appareil', 'numero d appareil', 'n inventaire', 'inventaire', 'repere', 'n repere', 'id', 'identifiant', 'n ordre', 'n d ordre', 'n parc', 'parc', 'n equipement', 'numero equipement']],
  ['family', ['famille', 'categorie', 'nature', 'equipement', 'type equipement', 'type d equipement', 'appareil', 'materiel']],
  ['subtype', ['type', 'designation', 'agent', 'agent extincteur', 'capacite', 'contenance', 'produit', 'type appareil', 'type d appareil']],
  ['brand', ['marque', 'fabricant', 'constructeur', 'brand']],
  ['model', ['modele', 'model', 'reference', 'ref', 'ref fabricant']],
  ['installYear', ['annee', 'annee fabrication', 'annee de fabrication', 'date fabrication', 'date de fabrication', 'fabrication', 'date fab', 'annee fab', 'millesime', 'mes', 'date mes', 'mise en service', 'date de mise en service', 'date installation', 'annee installation', 'date de pose']],
  ['implantation', ['emplacement', 'localisation', 'implantation', 'position', 'situation', 'lieu']],
  ['zoneName', ['zone', 'batiment', 'bat', 'etage', 'niveau', 'secteur']],
]

const FIELD_LABELS: Record<FieldKey, string> = {
  serial: 'n°',
  manufacturerSerial: 'n° de série fabricant',
  family: 'famille',
  subtype: 'type',
  brand: 'marque',
  model: 'modèle',
  installYear: 'année',
  implantation: 'emplacement',
  zoneName: 'zone',
}

// « Bâtiment : B » → zone « Bâtiment B » (une valeur courte seule ne parle pas)
const ZONE_PREFIX: Record<string, string> = {
  batiment: 'Bâtiment', bat: 'Bâtiment', etage: 'Étage', niveau: 'Niveau', secteur: 'Secteur', zone: 'Zone',
}

function normalizeKey(key: string): string {
  return normalize(key).replace(/[^a-z0-9]+/g, ' ').trim()
}

function fieldForKey(key: string): FieldKey | null {
  const k = normalizeKey(key)
  for (const [field, aliases] of KEY_ALIASES) if (aliases.includes(k)) return field
  return null
}

/** Année plausible (1950-2099) dans une valeur libre : « 2019 », « 03/2019 »… */
function yearOf(value: string): number | undefined {
  const m = /(?:^|\D)((?:19[5-9]|20\d)\d)(?:\D|$)/.exec(value)
  return m ? parseInt(m[1]!, 10) : undefined
}

/** Paires clé / valeur trouvées dans le contenu du QR code */
function extractPairs(raw: string): Array<[string, string]> {
  const text = raw.trim()
  // JSON
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>
      return Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .map(([k, v]) => [k, String(v)])
    } catch {
      // pas du JSON : on continue
    }
  }
  // Lien avec paramètres (?num=0452&type=EP6)
  if (/^https?:\/\//i.test(text)) {
    try {
      return Array.from(new URL(text).searchParams.entries())
    } catch {
      return []
    }
  }
  // Texte « clé : valeur », séparé par lignes, « ; » ou « | » (ou virgules si chaque morceau a sa clé)
  const pairs: Array<[string, string]> = []
  for (const segment of text.split(/\r?\n|;|\|/)) {
    const pieces = segment.split(',')
    const parts = pieces.length > 1 && pieces.every((p) => /[:=]/.test(p)) ? pieces : [segment]
    for (const part of parts) {
      const m = /^\s*([^:=]{1,40}?)\s*[:=]\s*(.+?)\s*$/.exec(part)
      if (m) pairs.push([m[1]!, m[2]!])
    }
  }
  return pairs
}

/** Informations utiles lues dans le contenu d'une étiquette QR */
export function parseLabelQr(raw: string): LabelQrFields {
  const out: LabelQrFields = { filled: [] }
  const seen = new Set<FieldKey>()
  for (const [key, rawValue] of extractPairs(raw)) {
    const field = fieldForKey(key)
    const value = rawValue.trim().slice(0, 80)
    if (!field || !value || seen.has(field)) continue
    if (field === 'installYear') {
      const y = yearOf(value)
      if (!y) continue
      out.installYear = y
    } else if (field === 'family') {
      const f = resolveFamily(value)
      if (!f) continue
      out.family = f
    } else if (field === 'zoneName') {
      const prefix = ZONE_PREFIX[normalizeKey(key)]
      out.zoneName = prefix && value.length <= 4 ? `${prefix} ${value}` : value
    } else {
      out[field] = value
    }
    seen.add(field)
  }
  // Famille déduite du type (« Extincteur CO2 5 kg », « BAES évacuation »…)
  if (!out.family && out.subtype) {
    const f = resolveFamily(out.subtype)
    if (f) { out.family = f; seen.add('family') }
  }
  out.filled = (Object.keys(FIELD_LABELS) as FieldKey[]).filter((f) => seen.has(f)).map((f) => FIELD_LABELS[f])
  return out
}

/**
 * Code court utilisable comme N° d'unité quand l'étiquette ne contient qu'un
 * identifiant (« EXT-004512 », ou dernier morceau d'un lien). null sinon.
 */
export function shortCodeFromQr(raw: string): string | null {
  const text = raw.trim()
  let candidate = text
  if (/^https?:\/\//i.test(text)) {
    try {
      const segments = new URL(text).pathname.split('/').filter(Boolean)
      candidate = segments.length ? decodeURIComponent(segments[segments.length - 1]!) : ''
    } catch {
      return null
    }
  }
  return candidate.length > 0 && candidate.length <= 24 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(candidate)
    ? candidate
    : null
}

/**
 * Prochain N° libre : suite du dernier ajouté (« EXT-0045 » → « EXT-0046 »),
 * sinon après le plus grand N° numérique existant, sinon le rang suivant.
 */
export function nextSerial(existing: string[], last?: string | null): string {
  const taken = new Set(existing.map((s) => s.trim().toLowerCase()))
  const bump = (base: string): string | null => {
    const m = /^(.*?)(\d+)$/.exec(base.trim())
    if (!m) return null
    const prefix = m[1]!
    const digits = m[2]!
    let n = parseInt(digits, 10)
    for (let i = 0; i < 100000; i++) {
      n++
      const candidate = `${prefix}${String(n).padStart(digits.length, '0')}`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
    return null
  }
  if (last) {
    const b = bump(last)
    if (b) return b
  }
  let best: string | null = null
  let bestN = -1
  for (const s of existing) {
    const t = s.trim()
    if (/^\d+$/.test(t) && parseInt(t, 10) > bestN) { bestN = parseInt(t, 10); best = t }
  }
  if (best) {
    const b = bump(best)
    if (b) return b
  }
  let n = existing.length + 1
  while (taken.has(String(n))) n++
  return String(n)
}
