/**
 * Couche hors ligne branchée sous le client Supabase (option global.fetch).
 *
 * - Lectures (/rest/v1 GET) : réseau d'abord, réponse gardée sur l'appareil ;
 *   sans réseau (ou réseau trop lent), la dernière réponse gardée est servie.
 * - Écritures (/rest/v1 POST, PATCH, DELETE) : envoyées tout de suite si le
 *   réseau répond ; sinon mises en file d'attente, avec une réponse simulée
 *   pour que l'écran continue, et reportées dans les lectures gardées.
 *   Un ajout reçoit son identifiant dès le départ : renvoyé deux fois, il
 *   n'est enregistré qu'une fois.
 * - Fichiers (photos, PDF) et fonctions (mails) : mis en file sans réseau.
 * - Connexion (/auth/v1) : jamais touchée.
 */

import {
  addToQueue,
  getResponse,
  listResponsesForTable,
  putFile,
  putResponse,
} from './db'
import type { CachedResponse, FormEntry, QueuedRequest } from './db'
import { applyWriteToBody, findRows, parseFilters, restTarget } from './pgrst'
import type { Filter, PendingWrite, Row } from './pgrst'
import { getOfflineUser, isOffline, markNetworkDown, markNetworkUp } from './state'
import { refreshQueueCounts, scheduleSync } from './sync'

/** Tables dont l'identifiant (uuid) est donné par défaut : on peut le fixer côté appareil */
const ID_TABLES = new Set([
  'anomalies', 'catalog_items', 'certifications', 'checklist_templates', 'client_portal_tokens', 'clients',
  'contract_lines', 'contracts', 'dossier_documents', 'equipment_checks', 'equipment_units', 'expenses',
  'family_templates', 'interventions', 'invoice_lines', 'invoices', 'legacy_documents', 'organization_fixed_costs',
  'organization_invitations', 'overtime_hours', 'planning_blocks', 'quote_lines', 'quotes', 'reports', 'sites',
  'technicians', 'vehicles', 'zones',
])

/** Lecture : au-delà, si une réponse est gardée, on la sert sans attendre */
const READ_TIMEOUT_MS = 8_000
/** Écriture : au-delà, elle part en file d'attente (renvoi sans doublon) */
const WRITE_TIMEOUT_MS = 20_000
/** Photo : au-delà (réseau trop faible), elle part en file d'attente et l'écran continue */
const PHOTO_UPLOAD_TIMEOUT_MS = 25_000
const PHOTO_BUCKET_PATH = /^report-photos\//

/** fetch du navigateur, lu à chaque appel (les tests peuvent le remplacer) */
const nativeFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

const STORAGE_SPECIAL = /^\/storage\/v1\/object\/(sign|list|public|authenticated|info|copy|move|upload\/sign)\//

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input)
  if (input instanceof URL) return new URL(input.href)
  return new URL(input.url)
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof DOMException && e.name !== 'AbortError')
}

function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const noBody = status === 204 || status === 205 || status === 304
  return new Response(noBody ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Firovia-Offline': '1', ...extra },
  })
}

function offlineError(): Response {
  return jsonResponse(503, {
    message: 'Hors ligne : ces données n\'ont pas encore été téléchargées sur cet appareil.',
    code: 'OFFLINE',
    details: null,
    hint: null,
  })
}

function fromCache(c: CachedResponse): Response {
  const noBody = c.status === 204 || c.status === 205 || c.status === 304
  return new Response(noBody ? null : c.body, { status: c.status, headers: { ...c.headers, 'X-Firovia-Offline': '1' } })
}

function keptHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['content-type', 'content-range', 'preference-applied']) {
    const v = h.get(name)
    if (v) out[name] = v
  }
  return out
}

function requestHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['prefer', 'accept', 'content-type', 'content-profile', 'accept-profile', 'x-upsert', 'cache-control']) {
    const v = h.get(name)
    if (v) out[name] = v
  }
  return out
}

/** Attend la réponse au plus `ms` ; « timeout » sinon (la requête continue) */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), ms))])
}

function cacheKey(userId: string, method: string, headers: Headers, url: URL, body = ''): string {
  return [userId, method, headers.get('accept') ?? '', headers.get('prefer') ?? '', url.pathname + url.search, body].join('|')
}

async function storeResponse(key: string, userId: string, table: string, url: URL, res: Response): Promise<void> {
  try {
    const body = await res.clone().text()
    if (body.length > 4_000_000) return
    await putResponse({ key, userId, table, url: url.pathname + url.search, status: res.status, headers: keptHeaders(res.headers), body, savedAt: Date.now() })
  } catch { /* stockage plein ou indisponible : on continue en ligne */ }
}

// ─── Lectures ──────────────────────────────────────────────

async function readThrough(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, method: string, headers: Headers, table: string, bodyKey = ''): Promise<Response> {
  const userId = getOfflineUser()
  if (!userId) return nativeFetch(input, init)
  const key = cacheKey(userId, method, headers, url, bodyKey)

  if (isOffline()) {
    const cached = await getResponse(key).catch(() => undefined)
    return cached ? fromCache(cached) : offlineError()
  }

  // Réseau et copie locale en parallèle ; la copie se met à jour en arrière-plan
  const network = nativeFetch(input, init).then((res) => {
    markNetworkUp()
    if (res.status === 200 || res.status === 206) void storeResponse(key, userId, table, url, res)
    return res
  })
  network.catch(() => { /* traité plus bas */ })
  const cached = await getResponse(key).catch(() => undefined)
  if (!cached) {
    try {
      return await network
    } catch (e) {
      if (isNetworkError(e)) { markNetworkDown(); return offlineError() }
      throw e
    }
  }
  const winner = await withTimeout(network.catch((e: unknown) => (isNetworkError(e) ? 'error' as const : Promise.reject(e))), READ_TIMEOUT_MS)
  if (winner === 'timeout' || winner === 'error') {
    if (winner === 'error') markNetworkDown()
    return fromCache(cached)
  }
  return winner
}

// ─── Écritures sur les tables ──────────────────────────────

type ParsedWrite = { url: URL; body: string | null; write: PendingWrite }

/** Fixe l'identifiant des nouvelles lignes (ajout simple) pour un renvoi sans doublon */
function prepareWrite(url: URL, method: 'POST' | 'PATCH' | 'DELETE', headers: Headers, table: string, bodyText: string | null): ParsedWrite {
  const prefer = headers.get('prefer') ?? ''
  const upsert = /resolution=(merge|ignore)-duplicates/.test(prefer)
  let parsed: unknown = null
  try { parsed = bodyText ? JSON.parse(bodyText) : null } catch { parsed = null }
  let body = bodyText
  const rows: Row[] = Array.isArray(parsed) ? (parsed as Row[]) : parsed && typeof parsed === 'object' ? [parsed as Row] : []

  if (method === 'POST' && !upsert && ID_TABLES.has(table) && rows.length > 0) {
    let added = false
    for (const r of rows) {
      if (r && typeof r === 'object' && !('id' in r)) { r.id = crypto.randomUUID(); added = true }
    }
    if (added) {
      body = JSON.stringify(parsed)
      const cols = url.searchParams.get('columns')
      if (cols && !cols.split(',').some((c) => c.replace(/"/g, '') === 'id')) url.searchParams.set('columns', `${cols},"id"`)
    }
  }
  const onConflict = url.searchParams.get('on_conflict')
  const write: PendingWrite = {
    method,
    table,
    filters: method === 'POST' ? null : parseFilters(url.searchParams),
    rows: method === 'POST' ? rows : [],
    patch: method === 'PATCH' && rows[0] ? rows[0] : null,
    onConflict: onConflict ? onConflict.split(',').map((c) => c.trim()) : null,
    upsert,
  }
  return { url, body, write }
}

/** Réponse simulée d'une écriture mise en attente, et report dans les lectures gardées */
async function simulateWrite(userId: string, headers: Headers, w: PendingWrite): Promise<Response> {
  const cachedList = await listResponsesForTable(userId, w.table).catch(() => [] as CachedResponse[])
  const bodies: unknown[] = []
  for (const c of cachedList) {
    try { bodies.push(JSON.parse(c.body)) } catch { /* corps illisible */ }
  }
  const now = new Date().toISOString()
  let rows: Row[] = []
  if (w.method === 'POST') {
    rows = w.rows.map((r) => {
      const conflict = w.onConflict ?? (w.upsert ? ['id'] : null)
      const existing = conflict
        ? findRows(bodies, conflict.map((c): Filter => ({ col: c, op: 'eq', value: String(r[c] ?? ''), negate: false })))[0]
        : undefined
      const merged: Row = { ...(existing ?? {}), ...r }
      if (!('id' in merged) && ID_TABLES.has(w.table)) merged.id = existing?.id ?? crypto.randomUUID()
      if (!('created_at' in merged)) merged.created_at = now
      merged.updated_at = now
      return merged
    })
  } else if (w.method === 'PATCH' && w.patch) {
    const found = w.filters ? findRows(bodies, w.filters) : []
    rows = found.map((r) => ({ ...r, ...w.patch, updated_at: now }))
    const idFilter = w.filters?.find((f) => f.col === 'id' && f.op === 'eq' && !f.negate)
    if (rows.length === 0 && idFilter) rows = [{ id: idFilter.value, ...w.patch, updated_at: now }]
  } else if (w.method === 'DELETE') {
    rows = w.filters ? findRows(bodies, w.filters) : []
  }

  // Report dans les lectures gardées (l'écran rechargé sans réseau montre la modification)
  const effective: PendingWrite = w.method === 'POST' ? { ...w, rows } : w
  for (const c of cachedList) {
    try {
      const nextBody = applyWriteToBody(JSON.parse(c.body), new URL(c.url, 'https://x').searchParams, effective)
      if (nextBody !== null) await putResponse({ ...c, body: JSON.stringify(nextBody) })
    } catch { /* ignore */ }
  }

  const prefer = headers.get('prefer') ?? ''
  const accept = headers.get('accept') ?? ''
  if (!prefer.includes('return=representation')) return jsonResponse(w.method === 'POST' ? 201 : 204, null)
  const body = accept.includes('vnd.pgrst.object') ? (rows[0] ?? { ...(w.patch ?? {}) }) : rows
  return jsonResponse(w.method === 'POST' ? 201 : 200, body)
}

async function enqueue(q: Omit<QueuedRequest, 'createdAt' | 'attempts' | 'lastError' | 'failed'>): Promise<void> {
  await addToQueue({ ...q, createdAt: new Date().toISOString(), attempts: 0, lastError: null, failed: false })
  void refreshQueueCounts()
  scheduleSync()
}

async function tableWrite(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, method: 'POST' | 'PATCH' | 'DELETE', headers: Headers, table: string): Promise<Response> {
  const userId = getOfflineUser()
  const bodyText = typeof init?.body === 'string' ? init.body : null
  if (!userId || (init?.body != null && bodyText === null)) return nativeFetch(input, init)

  const { url: finalUrl, body, write } = prepareWrite(url, method, headers, table, bodyText)
  const queueIt = async () => {
    await enqueue({
      userId, method, url: finalUrl.pathname + finalUrl.search, headers: requestHeaders(headers), body,
      form: null, blob: null, kind: 'rest', table, plainInsert: method === 'POST' && !write.upsert,
    })
    return simulateWrite(userId, headers, write)
  }

  if (isOffline()) return queueIt()
  try {
    const res = await withTimeout(nativeFetch(finalUrl.href, { ...init, body }), WRITE_TIMEOUT_MS)
    if (res === 'timeout') { markNetworkDown(); return queueIt() }
    markNetworkUp()
    return res
  } catch (e) {
    if (!isNetworkError(e)) throw e
    markNetworkDown()
    return queueIt()
  }
}

// ─── Fonctions SQL (rpc) ───────────────────────────────────

async function rpcCall(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, headers: Headers, name: string): Promise<Response> {
  const userId = getOfflineUser()
  const bodyText = typeof init?.body === 'string' ? init.body : ''
  if (!userId) return nativeFetch(input, init)
  const key = cacheKey(userId, 'RPC', headers, url, bodyText)
  const fallback = async () => {
    const cached = await getResponse(key).catch(() => undefined)
    if (cached) return fromCache(cached)
    // Sans réponse connue : l'appel part au retour du réseau
    await enqueue({ userId, method: 'POST', url: url.pathname + url.search, headers: requestHeaders(headers), body: bodyText, form: null, blob: null, kind: 'rpc', table: name, plainInsert: false })
    return jsonResponse(200, null)
  }
  if (isOffline()) return fallback()
  try {
    const res = await withTimeout(nativeFetch(input, init), WRITE_TIMEOUT_MS)
    if (res === 'timeout') { markNetworkDown(); return fallback() }
    markNetworkUp()
    if (res.status === 200) await storeResponse(key, userId, `rpc:${name}`, url, res)
    return res
  } catch (e) {
    if (!isNetworkError(e)) throw e
    markNetworkDown()
    return fallback()
  }
}

// ─── Fichiers (Storage) ────────────────────────────────────

async function formEntries(body: FormData): Promise<FormEntry[]> {
  const out: FormEntry[] = []
  body.forEach((value, name) => {
    out.push(typeof value === 'string' ? { name, value } : { name, value, filename: (value as File).name })
  })
  return out
}

function fileFromForm(entries: FormEntry[]): Blob | null {
  const f = entries.find((e) => typeof e.value !== 'string')
  return f ? (f.value as Blob) : null
}

async function storageUpload(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, method: string, headers: Headers): Promise<Response> {
  const userId = getOfflineUser()
  if (!userId) return nativeFetch(input, init)
  const objectPath = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ''))
  const queueIt = async () => {
    const raw = init?.body
    let form: FormEntry[] | null = null
    let blob: Blob | null = null
    if (typeof FormData !== 'undefined' && raw instanceof FormData) form = await formEntries(raw)
    else if (raw instanceof Blob) blob = raw
    else if (raw instanceof ArrayBuffer) blob = new Blob([raw], { type: headers.get('content-type') ?? 'application/octet-stream' })
    else return offlineError()
    const file = blob ?? (form ? fileFromForm(form) : null)
    if (file) {
      await putFile({ path: objectPath, userId, blob: file, contentType: file.type || headers.get('content-type') || 'application/octet-stream', savedAt: Date.now() }).catch(() => {})
    }
    await enqueue({ userId, method, url: url.pathname + url.search, headers: requestHeaders(headers), body: null, form, blob, kind: 'storage', table: null, plainInsert: false })
    return jsonResponse(200, { Key: objectPath, Id: crypto.randomUUID() })
  }
  if (isOffline()) return queueIt()
  try {
    if (PHOTO_BUCKET_PATH.test(objectPath)) {
      // Photo : l'envoi est abandonné au-delà du délai et repart de la file
      // (un envoi arrivé quand même est reconnu au renvoi, sans doublon)
      const controller = new AbortController()
      init?.signal?.addEventListener('abort', () => controller.abort(), { once: true })
      const res = await withTimeout(nativeFetch(input, { ...init, signal: controller.signal }), PHOTO_UPLOAD_TIMEOUT_MS)
      if (res === 'timeout') {
        controller.abort()
        markNetworkDown()
        return queueIt()
      }
      markNetworkUp()
      return res
    }
    const res = await nativeFetch(input, init)
    markNetworkUp()
    return res
  } catch (e) {
    if (!isNetworkError(e)) throw e
    markNetworkDown()
    return queueIt()
  }
}

async function storageOther(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, method: string, headers: Headers): Promise<Response> {
  const userId = getOfflineUser()
  if (!userId) return nativeFetch(input, init)
  const bodyText = typeof init?.body === 'string' ? init.body : ''
  // Suppression de fichiers : en file sans réseau
  if (method === 'DELETE') {
    const queueIt = async () => {
      await enqueue({ userId, method, url: url.pathname + url.search, headers: requestHeaders(headers), body: bodyText, form: null, blob: null, kind: 'storage', table: null, plainInsert: false })
      return jsonResponse(200, [])
    }
    if (isOffline()) return queueIt()
    try {
      const res = await nativeFetch(input, init)
      markNetworkUp()
      return res
    } catch (e) {
      if (!isNetworkError(e)) throw e
      markNetworkDown()
      return queueIt()
    }
  }
  // Lien signé, liste : gardés comme des lectures (les téléchargements, eux, passent tels quels)
  if (method === 'POST' && /^\/storage\/v1\/object\/(sign|list)\//.test(url.pathname)) return readThrough(input, init, url, method, headers, 'storage', bodyText)
  return nativeFetch(input, init)
}

// ─── Fonctions serveur (mails, notifications) ──────────────

async function functionCall(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, headers: Headers): Promise<Response> {
  const userId = getOfflineUser()
  const bodyText = typeof init?.body === 'string' ? init.body : null
  if (!userId || (init?.body != null && bodyText === null)) return nativeFetch(input, init)
  const queueIt = async () => {
    await enqueue({ userId, method: 'POST', url: url.pathname + url.search, headers: requestHeaders(headers), body: bodyText, form: null, blob: null, kind: 'function', table: url.pathname.split('/').pop() ?? null, plainInsert: false })
    return jsonResponse(200, { queued: true })
  }
  if (isOffline()) return queueIt()
  try {
    const res = await nativeFetch(input, init)
    markNetworkUp()
    return res
  } catch (e) {
    if (!isNetworkError(e)) throw e
    markNetworkDown()
    return queueIt()
  }
}

// ─── Point d'entrée ────────────────────────────────────────

export function createOfflineFetch(supabaseUrl: string): typeof fetch {
  const base = new URL(supabaseUrl).origin
  return async (input, init) => {
    let url: URL
    try { url = urlOf(input) } catch { return nativeFetch(input, init) }
    if (url.origin !== base) return nativeFetch(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const path = url.pathname

    if (path.startsWith('/rest/v1/')) {
      const target = restTarget(path)
      if (!target) return nativeFetch(input, init)
      if (target.kind === 'rpc') return rpcCall(input, init, url, headers, target.name)
      if (method === 'GET' || method === 'HEAD') return readThrough(input, init, url, method, headers, target.name)
      if (method === 'POST' || method === 'PATCH' || method === 'DELETE') return tableWrite(input, init, url, method, headers, target.name)
      return nativeFetch(input, init)
    }
    if (path.startsWith('/storage/v1/object/')) {
      if ((method === 'POST' || method === 'PUT') && !STORAGE_SPECIAL.test(path)) return storageUpload(input, init, url, method, headers)
      return storageOther(input, init, url, method, headers)
    }
    if (path.startsWith('/functions/v1/') && method === 'POST') return functionCall(input, init, url, headers)
    return nativeFetch(input, init)
  }
}
