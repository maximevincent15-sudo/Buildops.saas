/**
 * État du hors ligne, partagé par la couche réseau, la synchronisation et
 * l'interface : compte connecté, réseau absent ou instable, nombre
 * d'enregistrements en attente.
 */

let currentUserId: string | null = null
/** Réseau défaillant constaté (requête échouée ou trop lente) : on passe en hors ligne quelques instants */
let networkDownUntil = 0
let pendingCount = 0
let failedCount = 0
let syncing = false

const FORCE_KEY = 'firovia_force_offline'
const DOWN_MS = 20_000

const listeners = new Set<() => void>()

export function onOfflineChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function emit() {
  for (const cb of listeners) {
    try { cb() } catch { /* ignore */ }
  }
}

export function setOfflineUser(userId: string | null) {
  currentUserId = userId
  emit()
}

export function getOfflineUser(): string | null {
  return currentUserId
}

/** Mode « sans réseau » forcé (tests, ou technicien qui veut travailler hors ligne) */
export function isForcedOffline(): boolean {
  try { return localStorage.getItem(FORCE_KEY) === '1' } catch { return false }
}

export function setForcedOffline(on: boolean) {
  try {
    if (on) localStorage.setItem(FORCE_KEY, '1')
    else localStorage.removeItem(FORCE_KEY)
  } catch { /* ignore */ }
  networkDownUntil = 0
  emit()
}

export function markNetworkDown() {
  const wasDown = isOffline()
  networkDownUntil = Date.now() + DOWN_MS
  if (!wasDown) emit()
  // Nouvel essai automatique après le délai
  window.setTimeout(() => emit(), DOWN_MS + 50)
}

export function markNetworkUp() {
  if (networkDownUntil === 0) return
  networkDownUntil = 0
  emit()
}

/** Pas de réseau (annoncé par le navigateur, constaté, ou forcé) */
export function isOffline(): boolean {
  if (isForcedOffline()) return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return Date.now() < networkDownUntil
}

export function setQueueCounts(pending: number, failed: number) {
  if (pending === pendingCount && failed === failedCount) return
  pendingCount = pending
  failedCount = failed
  emit()
}

export function getQueueCounts(): { pending: number; failed: number } {
  return { pending: pendingCount, failed: failedCount }
}

export function setSyncing(on: boolean) {
  if (syncing === on) return
  syncing = on
  emit()
}

export function isSyncing(): boolean {
  return syncing
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { networkDownUntil = 0; emit() })
  window.addEventListener('offline', () => emit())
}
