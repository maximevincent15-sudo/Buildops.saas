/**
 * Envoi de la file d'attente hors ligne, dans l'ordre, au retour du réseau.
 * - Réussite : l'enregistrement quitte la file.
 * - Ajout déjà présent (409) : il était déjà parti, il quitte la file.
 *   De même pour un fichier déjà envoyé (photo partie malgré un délai dépassé).
 * - Refus du serveur (4xx) : gardé et signalé, les suivants continuent.
 * - Réseau absent ou serveur indisponible : on s'arrête, nouvel essai plus tard.
 */

import { deleteFile, deleteQueued, getFile, listQueue, updateQueued } from './db'
import type { QueuedRequest } from './db'
import { getOfflineUser, isOffline, markNetworkDown, markNetworkUp, onOfflineChange, setQueueCounts, setSyncing } from './state'

type Config = { url: string; apiKey: string; getToken: () => Promise<string | null> }
let config: Config | null = null

export function configureOfflineSync(c: Config) {
  config = c
}

const nativeFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

export async function refreshQueueCounts(): Promise<void> {
  const userId = getOfflineUser()
  if (!userId) { setQueueCounts(0, 0); return }
  try {
    const list = await listQueue(userId)
    setQueueCounts(list.filter((q) => !q.failed).length, list.filter((q) => q.failed).length)
  } catch {
    setQueueCounts(0, 0)
  }
}

/** Enregistrements en attente ou refusés du compte connecté (écran de suivi) */
export async function getQueueItems(): Promise<QueuedRequest[]> {
  const userId = getOfflineUser()
  if (!userId) return []
  return listQueue(userId).catch(() => [])
}

/** Retire un enregistrement refusé (l'utilisateur l'abandonne) */
export async function dropQueueItem(seq: number): Promise<void> {
  await deleteQueued(seq)
  await refreshQueueCounts()
}

/** Remet un enregistrement refusé dans la file et relance l'envoi */
export async function retryQueueItem(seq: number): Promise<void> {
  const userId = getOfflineUser()
  if (!userId) return
  const item = (await listQueue(userId)).find((q) => q.seq === seq)
  if (!item) return
  await updateQueued({ ...item, failed: false })
  await refreshQueueCounts()
  await flushOfflineQueue()
}

/** Chemin du fichier dans le stockage (« bucket/dossier/fichier »), à partir de l'adresse de l'envoi */
function storagePathOf(q: QueuedRequest): string {
  return decodeURIComponent(q.url.replace(/^\/storage\/v1\/object\//, '').split('?')[0]!)
}

/**
 * Fichier relu en entier, en mémoire. Sur iPhone, une photo relue depuis la
 * mémoire de l'appareil s'affichait mais partait vide à l'envoi (« No content
 * provided »). À défaut, la copie gardée sur l'appareil pour l'affichage.
 * null : la photo est vraiment vide.
 */
async function readWhole(blob: Blob | null, path: string | null): Promise<Blob | null> {
  if (blob) {
    const buf = await blob.arrayBuffer().catch(() => null)
    if (buf && buf.byteLength > 0) return new Blob([buf], { type: blob.type })
  }
  if (path) {
    const f = await getFile(path).catch(() => undefined)
    const buf = f ? await f.blob.arrayBuffer().catch(() => null) : null
    if (f && buf && buf.byteLength > 0) return new Blob([buf], { type: f.contentType || f.blob.type })
  }
  return null
}

async function buildBody(q: QueuedRequest): Promise<{ body: BodyInit | null; emptyFile: boolean }> {
  const path = q.kind === 'storage' && q.method !== 'DELETE' ? storagePathOf(q) : null
  if (q.form) {
    const fd = new FormData()
    let emptyFile = false
    for (const e of q.form) {
      if (typeof e.value === 'string') {
        fd.append(e.name, e.value)
        continue
      }
      const whole = await readWhole(e.value, path)
      if (!whole) emptyFile = true
      else fd.append(e.name, whole, e.filename)
    }
    return { body: fd, emptyFile }
  }
  if (q.blob) {
    const whole = await readWhole(q.blob, path)
    return whole ? { body: whole, emptyFile: false } : { body: null, emptyFile: true }
  }
  return { body: q.body, emptyFile: false }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text) as { message?: string; error?: string; msg?: string }
      return j.message ?? j.error ?? j.msg ?? text.slice(0, 200)
    } catch {
      return text.slice(0, 200) || `Erreur ${res.status}`
    }
  } catch {
    return `Erreur ${res.status}`
  }
}

/** Fichier déjà présent dans le stockage : l'envoi précédent était arrivé */
async function isDuplicateUpload(q: QueuedRequest, res: Response): Promise<boolean> {
  if (q.kind !== 'storage' || q.method !== 'POST') return false
  if (res.status === 409) return true
  if (res.status !== 400) return false
  try {
    return /duplicate|already exists/i.test(await res.clone().text())
  } catch {
    return false
  }
}

let running: Promise<{ sent: number; failed: number }> | null = null

/** Envoie la file ; renvoie le nombre d'envois réussis et refusés pendant ce passage */
export function flushOfflineQueue(): Promise<{ sent: number; failed: number }> {
  if (running) return running
  running = (async () => {
    let sent = 0
    let failed = 0
    const userId = getOfflineUser()
    if (!config || !userId || isOffline()) return { sent, failed }
    const token = await config.getToken().catch(() => null)
    if (!token) return { sent, failed }
    const items = (await listQueue(userId).catch(() => [] as QueuedRequest[])).filter((q) => !q.failed)
    if (items.length === 0) { await refreshQueueCounts(); return { sent, failed } }
    setSyncing(true)
    try {
      for (const q of items) {
        const headers: Record<string, string> = { ...q.headers, apikey: config.apiKey, Authorization: `Bearer ${token}` }
        // FormData : le navigateur pose lui-même le content-type (avec la frontière)
        if (q.form) delete headers['content-type']
        const built = await buildBody(q)
        if (built.emptyFile) {
          // Rien à envoyer : la photo est perdue sur l'appareil, il faut la reprendre
          await updateQueued({ ...q, attempts: q.attempts + 1, lastError: 'Photo vide sur cet appareil : reprenez-la.', failed: true })
          failed++
          continue
        }
        let res: Response
        try {
          res = await nativeFetch(`${config.url}${q.url}`, { method: q.method, headers, body: built.body })
        } catch {
          markNetworkDown()
          break
        }
        markNetworkUp()
        if (res.ok || (res.status === 409 && q.plainInsert) || await isDuplicateUpload(q, res)) {
          await deleteQueued(q.seq!)
          if (q.kind === 'storage' && q.method !== 'DELETE') {
            // Fichier envoyé : la copie locale n'est plus utile
            await deleteFile(storagePathOf(q)).catch(() => {})
          }
          sent++
          continue
        }
        if (res.status === 401 || res.status >= 500 || res.status === 429) {
          // Session à rafraîchir ou serveur indisponible : nouvel essai plus tard
          await updateQueued({ ...q, attempts: q.attempts + 1, lastError: await errorMessage(res) })
          break
        }
        await updateQueued({ ...q, attempts: q.attempts + 1, lastError: await errorMessage(res), failed: true })
        failed++
      }
    } finally {
      setSyncing(false)
      await refreshQueueCounts()
    }
    return { sent, failed }
  })().finally(() => { running = null })
  return running
}

let timer: number | null = null

/** Envoi dans un instant (regroupe les demandes rapprochées) */
export function scheduleSync(delayMs = 1500) {
  if (typeof window === 'undefined') return
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    if (!isOffline()) void flushOfflineQueue()
  }, delayMs)
}

if (typeof window !== 'undefined') {
  // Retour du réseau : on envoie
  let wasOffline = isOffline()
  onOfflineChange(() => {
    const off = isOffline()
    if (wasOffline && !off) scheduleSync(800)
    wasOffline = off
  })
  // Filet de sécurité : toutes les 30 s s'il reste des enregistrements
  window.setInterval(() => {
    if (!isOffline()) void refreshQueueCounts().then(() => scheduleSync(0))
  }, 30_000)
}
