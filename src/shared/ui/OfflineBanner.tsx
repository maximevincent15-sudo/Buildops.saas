import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { flushQueue as flushLegacyQueue, getPendingCount as getLegacyCount, onQueueChange as onLegacyChange } from '../../features/equipment/offlineQueue'
import { getQueueCounts, isOffline, isSyncing, onOfflineChange } from '../lib/offline/state'
import { flushOfflineQueue } from '../lib/offline/sync'
import { countPendingFinalize, onPendingFinalizeChange, processPendingFinalize } from '../../features/rapports/deferredFinalize'
import { OfflineFailuresModal } from './OfflineFailuresModal'

type Snapshot = { offline: boolean; pending: number; failed: number; syncing: boolean; reports: number }

let last: Snapshot = { offline: false, pending: 0, failed: 0, syncing: false, reports: 0 }

function snapshot(): Snapshot {
  const counts = getQueueCounts()
  const next = { offline: isOffline(), pending: counts.pending + getLegacyCount(), failed: counts.failed, syncing: isSyncing(), reports: countPendingFinalize() }
  if (next.offline === last.offline && next.pending === last.pending && next.failed === last.failed && next.syncing === last.syncing && next.reports === last.reports) return last
  last = next
  return next
}

function subscribe(cb: () => void): () => void {
  const a = onOfflineChange(cb)
  const b = onLegacyChange(cb)
  const c = onPendingFinalizeChange(cb)
  return () => { a(); b(); c() }
}

/**
 * Bandeau sous la barre de navigation : pas de réseau, enregistrements en
 * attente d'envoi, envois refusés. Les enregistrements partent seuls au
 * retour du réseau ; le bouton permet de relancer l'envoi.
 */
export function OfflineBanner() {
  const { offline, pending, failed, syncing, reports } = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [justSynced, setJustSynced] = useState(false)
  const [wasPending, setWasPending] = useState(0)
  const [showFailures, setShowFailures] = useState(false)

  // « Synchronisation terminée » quand la file se vide
  if (pending !== wasPending) {
    setWasPending(pending)
    if (wasPending > 0 && pending === 0 && !offline) setJustSynced(true)
  }
  useEffect(() => {
    if (!justSynced) return
    const t = window.setTimeout(() => setJustSynced(false), 3000)
    return () => window.clearTimeout(t)
  }, [justSynced])

  async function handleSync() {
    await flushLegacyQueue().catch(() => {})
    await flushOfflineQueue().catch(() => {})
    await processPendingFinalize().catch(() => {})
  }

  if (!offline && pending === 0 && failed === 0 && reports === 0 && !justSynced) return null
  const reportsText = `${reports} rapport${reports > 1 ? 's' : ''} clôturé${reports > 1 ? 's' : ''} sans réseau`

  if (justSynced && pending === 0 && failed === 0 && reports === 0) {
    return (
      <div style={{ ...bannerStyle, background: '#0E7A3F' }}>
        <CheckCircle2 size={16} strokeWidth={2.2} />
        <span>Synchronisation terminée : tout est enregistré.</span>
      </div>
    )
  }

  if (offline) {
    return (
      <div style={{ ...bannerStyle, background: '#B36510' }}>
        <WifiOff size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        <span>
          Hors ligne : vous pouvez continuer, tout est gardé sur l'appareil
          {pending > 0 && ` · ${pending} enregistrement${pending > 1 ? 's' : ''} en attente d'envoi`}
          {reports > 0 && ` · ${reportsText}, finalisé${reports > 1 ? 's' : ''} au retour du réseau`}
        </span>
      </div>
    )
  }

  return (
    <div style={{ ...bannerStyle, background: failed > 0 && pending === 0 ? '#A83A3A' : '#3A5CA8' }}>
      {failed > 0 && pending === 0
        ? <AlertTriangle size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        : <RefreshCw size={16} strokeWidth={2.2} style={{ flexShrink: 0, ...(syncing ? { animation: 'spin 1s linear infinite' } : {}) }} />}
      <span style={{ minWidth: 0 }}>
        {pending > 0 && `${pending} enregistrement${pending > 1 ? 's' : ''} en attente d'envoi`}
        {pending > 0 && failed > 0 && ' · '}
        {failed > 0 && `${failed} refusé${failed > 1 ? 's' : ''} par le serveur`}
        {reports > 0 && `${pending > 0 || failed > 0 ? ' · ' : ''}${reportsText} : finalisation (PDF, envoi) en cours`}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
        {failed > 0 && (
          <button type="button" onClick={() => setShowFailures(true)} style={syncBtnStyle}>
            Voir
          </button>
        )}
        {(pending > 0 || reports > 0) && (
          <button type="button" onClick={() => void handleSync()} disabled={syncing} style={syncBtnStyle}>
            {syncing ? 'Envoi…' : 'Envoyer'}
          </button>
        )}
      </span>
      {showFailures && <OfflineFailuresModal onClose={() => setShowFailures(false)} />}
      <style>{'@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}

const bannerStyle: React.CSSProperties = {
  // Collé sous la barre de navigation (64 px) au défilement, sous le menu mobile
  position: 'sticky',
  top: 72,
  zIndex: 50,
  borderRadius: 10,
  marginBottom: 14,
  color: 'white',
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
  fontWeight: 500,
  boxShadow: '0 2px 8px rgba(0,0,0,.15)',
}

const syncBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
  background: 'rgba(255,255,255,.15)',
  color: 'white',
  border: '1px solid rgba(255,255,255,.3)',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
