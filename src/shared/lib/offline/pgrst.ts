/**
 * Petit moteur PostgREST côté navigateur, pour le hors ligne :
 * lecture des filtres d'une URL /rest/v1, évaluation sur une ligne, et
 * report d'une écriture en attente dans les réponses déjà gardées (pour que
 * l'écran affiche la modification même après un rechargement sans réseau).
 * Tout ce qui n'est pas sûr est laissé tel quel (« inconnu » = on ne touche pas).
 */

export type Row = Record<string, unknown>

export type Filter = { col: string; op: string; value: string; negate: boolean }

/** Paramètres d'URL qui ne sont pas des filtres */
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

export type RestTarget = { kind: 'table' | 'rpc'; name: string }

/** /rest/v1/equipment_checks → table « equipment_checks » ; /rest/v1/rpc/x → rpc « x » */
export function restTarget(pathname: string): RestTarget | null {
  const m = /^\/rest\/v1\/(rpc\/)?([^/?#]+)/.exec(pathname)
  if (!m) return null
  return { kind: m[1] ? 'rpc' : 'table', name: decodeURIComponent(m[2]!) }
}

/**
 * Filtres simples d'une requête (col=op.valeur). Renvoie null si la requête
 * contient un filtre qu'on ne sait pas évaluer (or, and, filtre sur une table
 * jointe…).
 */
export function parseFilters(params: URLSearchParams): Filter[] | null {
  const out: Filter[] = []
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue
    if (key === 'or' || key === 'and' || key.includes('.')) return null
    let value = raw
    let negate = false
    if (value.startsWith('not.')) {
      negate = true
      value = value.slice(4)
    }
    const dot = value.indexOf('.')
    if (dot < 0) return null
    out.push({ col: key, op: value.slice(0, dot), value: value.slice(dot + 1), negate })
  }
  return out
}

function parseList(value: string): string[] {
  // (a,b,"c,d")
  const inner = value.replace(/^\(/, '').replace(/\)$/, '')
  const items: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (ch === '"') { quoted = !quoted; continue }
    if (ch === ',' && !quoted) { items.push(cur); cur = ''; continue }
    cur += ch
  }
  items.push(cur)
  return items
}

function asComparable(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function compare(a: unknown, b: string): number | null {
  const av = asComparable(a)
  if (av === null) return null
  const an = typeof av === 'number' ? av : Number(av)
  const bn = Number(b)
  if (!Number.isNaN(an) && !Number.isNaN(bn) && String(av).trim() !== '' && b.trim() !== '') return an === bn ? 0 : an < bn ? -1 : 1
  const as = String(av)
  return as === b ? 0 : as < b ? -1 : 1
}

function likeToRegex(pattern: string, insensitive: boolean): RegExp {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*')
  return new RegExp(`^${esc}$`, insensitive ? 'i' : '')
}

/** true / false, ou undefined si on ne sait pas évaluer */
export function evalFilter(row: Row, f: Filter): boolean | undefined {
  if (!(f.col in row)) return undefined
  const v = row[f.col]
  let res: boolean | undefined
  switch (f.op) {
    case 'eq': { const c = compare(v, f.value); res = c === null ? false : c === 0; break }
    case 'neq': { const c = compare(v, f.value); res = c === null ? false : c !== 0; break }
    case 'gt': { const c = compare(v, f.value); res = c === null ? false : c > 0; break }
    case 'gte': { const c = compare(v, f.value); res = c === null ? false : c >= 0; break }
    case 'lt': { const c = compare(v, f.value); res = c === null ? false : c < 0; break }
    case 'lte': { const c = compare(v, f.value); res = c === null ? false : c <= 0; break }
    case 'is':
      if (f.value === 'null') res = v === null || v === undefined
      else if (f.value === 'true') res = v === true
      else if (f.value === 'false') res = v === false
      else return undefined
      break
    case 'in': {
      const list = parseList(f.value)
      const av = asComparable(v)
      res = av === null ? false : list.some((x) => compare(av, x) === 0)
      break
    }
    case 'like':
    case 'ilike':
      if (typeof v !== 'string') { res = false; break }
      res = likeToRegex(f.value, f.op === 'ilike').test(v)
      break
    default:
      return undefined
  }
  return f.negate ? !res : res
}

/** true si tous les filtres passent, false si l'un échoue, undefined si inconnu */
export function rowMatches(row: Row, filters: Filter[]): boolean | undefined {
  let unknown = false
  for (const f of filters) {
    const r = evalFilter(row, f)
    if (r === false) return false
    if (r === undefined) unknown = true
  }
  return unknown ? undefined : true
}

/** La sélection contient-elle une table jointe (« organizations(name) ») ? */
export function hasEmbed(params: URLSearchParams): boolean {
  return (params.get('select') ?? '').includes('(')
}

// ─── Écriture en attente → réponse simulée et report dans le cache ──────

export type PendingWrite = {
  method: 'POST' | 'PATCH' | 'DELETE'
  table: string
  /** Filtres de l'écriture (PATCH / DELETE) */
  filters: Filter[] | null
  /** Lignes envoyées (POST) */
  rows: Row[]
  /** Champs modifiés (PATCH) */
  patch: Row | null
  /** Colonnes de conflit d'un upsert (« intervention_id,equipment_unit_id ») */
  onConflict: string[] | null
  upsert: boolean
}

function sameConflict(a: Row, b: Row, cols: string[]): boolean {
  return cols.every((c) => c in a && c in b && asComparable(a[c]) === asComparable(b[c]))
}

/**
 * Applique une écriture en attente au corps JSON d'une réponse gardée (liste
 * ou objet). Renvoie le nouveau corps, ou null si rien ne change.
 */
export function applyWriteToBody(body: unknown, cachedParams: URLSearchParams, w: PendingWrite): unknown | null {
  const isList = Array.isArray(body)
  if (!isList && (body === null || typeof body !== 'object')) return null
  const rows = (isList ? body : [body]) as Row[]
  let changed = false
  let next: Row[] = rows

  if (w.method === 'PATCH' && w.patch && w.filters) {
    next = rows.map((r) => {
      if (rowMatches(r, w.filters!) !== true) return r
      changed = true
      return { ...r, ...w.patch }
    })
  } else if (w.method === 'DELETE' && w.filters) {
    if (!isList) return null
    next = rows.filter((r) => {
      const hit = rowMatches(r, w.filters!) === true
      if (hit) changed = true
      return !hit
    })
  } else if (w.method === 'POST') {
    const cachedFilters = parseFilters(cachedParams)
    next = [...rows]
    for (const nr of w.rows) {
      const conflictCols = w.onConflict ?? (w.upsert ? ['id'] : null)
      const idx = conflictCols ? next.findIndex((r) => sameConflict(r, nr, conflictCols)) : -1
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...nr, id: next[idx]!.id ?? nr.id }
        changed = true
      } else if (isList && cachedFilters && !hasEmbed(cachedParams) && rowMatches(nr, cachedFilters) === true) {
        next.push(nr)
        changed = true
      }
    }
  }
  if (!changed) return null
  return isList ? next : next[0]
}

/** Lignes connues d'une table (dans les réponses gardées) qui passent les filtres */
export function findRows(bodies: unknown[], filters: Filter[]): Row[] {
  const seen = new Map<string, Row>()
  for (const b of bodies) {
    const rows = (Array.isArray(b) ? b : b && typeof b === 'object' ? [b] : []) as Row[]
    for (const r of rows) {
      if (rowMatches(r, filters) !== true) continue
      const key = typeof r.id === 'string' ? r.id : JSON.stringify(r)
      seen.set(key, { ...(seen.get(key) ?? {}), ...r })
    }
  }
  return [...seen.values()]
}
