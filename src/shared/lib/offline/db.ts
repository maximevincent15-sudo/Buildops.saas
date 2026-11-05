/**
 * Stockage local du hors ligne (IndexedDB) :
 * - responses : réponses de lecture gardées (une par URL et par compte) ;
 * - queue : écritures faites sans réseau, à envoyer dans l'ordre ;
 * - files : fichiers déposés sans réseau (photos, PDF), affichables sur place.
 * Si IndexedDB est indisponible (navigation privée…), tout échoue en silence
 * et l'app fonctionne comme avant, en ligne seulement.
 */

const DB_NAME = 'firovia-offline'
const DB_VERSION = 1

export type CachedResponse = {
  key: string
  userId: string
  table: string
  url: string
  status: number
  headers: Record<string, string>
  body: string
  savedAt: number
}

export type FormEntry = { name: string; value: string | Blob; filename?: string }

export type QueuedRequest = {
  seq?: number
  userId: string
  createdAt: string
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
  form: FormEntry[] | null
  blob: Blob | null
  kind: 'rest' | 'rpc' | 'storage' | 'function'
  table: string | null
  /** Insert simple (pas un upsert) : un 409 au renvoi veut dire « déjà enregistré » */
  plainInsert: boolean
  attempts: number
  lastError: string | null
  /** Refusé par le serveur : gardé pour être montré, plus renvoyé */
  failed: boolean
}

export type StoredFile = { path: string; userId: string; blob: Blob; contentType: string; savedAt: number }

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('responses')) {
        const s = db.createObjectStore('responses', { keyPath: 'key' })
        s.createIndex('table', ['userId', 'table'])
        s.createIndex('userId', 'userId')
      }
      if (!db.objectStoreNames.contains('queue')) {
        const q = db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true })
        q.createIndex('userId', 'userId')
      }
      if (!db.objectStoreNames.contains('files')) {
        const f = db.createObjectStore('files', { keyPath: 'path' })
        f.createIndex('userId', 'userId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(name: 'responses' | 'queue' | 'files', mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb()
  return db.transaction(name, mode).objectStore(name)
}

// ─── Réponses ─────────────────────────────────────────────

export async function getResponse(key: string): Promise<CachedResponse | undefined> {
  return done((await store('responses', 'readonly')).get(key) as IDBRequest<CachedResponse | undefined>)
}

export async function putResponse(r: CachedResponse): Promise<void> {
  await done((await store('responses', 'readwrite')).put(r))
}

export async function listResponsesForTable(userId: string, table: string): Promise<CachedResponse[]> {
  const s = await store('responses', 'readonly')
  return done(s.index('table').getAll([userId, table]) as IDBRequest<CachedResponse[]>)
}

async function deleteByUser(name: 'responses' | 'files' | 'queue', userId: string): Promise<void> {
  const s = await store(name, 'readwrite')
  const keys = await done(s.index('userId').getAllKeys(userId))
  await Promise.all(keys.map((k) => done(s.delete(k))))
}

/** Données gardées d'un compte (déconnexion) ; la file d'attente est conservée */
export async function clearUserCache(userId: string): Promise<void> {
  await deleteByUser('responses', userId)
}

/** Réponses gardées depuis plus de `maxAgeMs` : supprimées (ménage au démarrage) */
export async function pruneResponses(maxAgeMs: number): Promise<void> {
  const s = await store('responses', 'readwrite')
  const all = await done(s.getAll() as IDBRequest<CachedResponse[]>)
  const limit = Date.now() - maxAgeMs
  await Promise.all(all.filter((r) => r.savedAt < limit).map((r) => done(s.delete(r.key))))
}

// ─── File d'attente ────────────────────────────────────────

export async function addToQueue(q: QueuedRequest): Promise<number> {
  return done((await store('queue', 'readwrite')).add(q)) as Promise<number>
}

export async function listQueue(userId: string): Promise<QueuedRequest[]> {
  const all = await done((await store('queue', 'readonly')).index('userId').getAll(userId) as IDBRequest<QueuedRequest[]>)
  return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export async function updateQueued(q: QueuedRequest): Promise<void> {
  await done((await store('queue', 'readwrite')).put(q))
}

export async function deleteQueued(seq: number): Promise<void> {
  await done((await store('queue', 'readwrite')).delete(seq))
}

// ─── Fichiers déposés sans réseau ──────────────────────────

export async function putFile(f: StoredFile): Promise<void> {
  await done((await store('files', 'readwrite')).put(f))
}

export async function getFile(path: string): Promise<StoredFile | undefined> {
  return done((await store('files', 'readonly')).get(path) as IDBRequest<StoredFile | undefined>)
}

export async function deleteFile(path: string): Promise<void> {
  await done((await store('files', 'readwrite')).delete(path))
}
