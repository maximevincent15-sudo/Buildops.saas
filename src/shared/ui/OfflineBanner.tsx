import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOnlineStatus } from '../lib/networkStatus'
import { getPendingCount, flushQueue, onQueueChange } from '../../features/equipment/offlineQueue'

/**
 * Bandeau affiché en haut des pages (sous la barre de navigation, jamais
 * par-dessus : le menu reste accessible sur téléphone) quand le navigateur est
 * hors ligne ou quand des contrôles attendent d'être synchronisés.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [justSynced, setJustSynced] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    setPendingCount(getPendingCount())
    return onQueueChange(() => setPendingCount(getPendingCount()))
  }, [])

  // Auto-sync quand la connexion revient
  useEffect(() => {
    if (online && pendingCount > 0 && !syncing) {
      void handleSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  async function handleSync() {
    setSyncing(true)
    try {
      const before = getPendingCount()
      const result = await flushQueue()
      setSyncError(result.failed > 0 ? result.error ?? 'erreur inconnue' : null)
      if (before > 0 && getPendingCount() === 0) {
        setJustSynced(true)
        setTimeout(() => setJustSynced(false), 3000)
      }
    } finally {
      setSyncing(false)
      setPendingCount(getPendingCount())
    }
  }

  // Rien à afficher si tout est OK et queue vide
  if (online && pendingCount === 0 && !justSynced) return null

  // Toast "synchronisé"
  if (justSynced) {
    return (
      <div style={{ ...bannerStyle, background: '#0E7A3F' }}>
        <CheckCircle2 size={16} strokeWidth={2.2} />
        <span>Synchronisation terminée ✓</span>
      </div>
    )
  }

  // Bannière offline
  if (!online) {
    return (
      <div style={{ ...bannerStyle, background: '#B36510' }}>
        <WifiOff size={16} strokeWidth={2.2} />
        <span>
          Mode hors ligne — Firovia continue de fonctionner
          {pendingCount > 0 && ` · ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`}
        </span>
      </div>
    )
  }

  // Bannière avec queue en attente + bouton sync
  return (
    <div style={{ ...bannerStyle, background: '#3A5CA8' }}>
      <RefreshCw
        size={16}
        strokeWidth={2.2}
        style={{ flexShrink: 0, ...(syncing ? { animation: 'spin 1s linear infinite' } : {}) }}
      />
      <span style={{ minWidth: 0 }}>
        {pendingCount} contrôle{pendingCount > 1 ? 's' : ''} en attente de synchronisation
        {syncError && (
          <span style={{ display: 'block', fontSize: 12, opacity: .9 }}>
            Envoi impossible pour l'instant ({syncError.slice(0, 120)}). Vérifie ta connexion, ou déconnecte-toi puis reconnecte-toi.
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={syncing}
        style={syncBtnStyle}
      >
        {syncing ? 'Sync…' : 'Synchroniser'}
      </button>
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
  marginLeft: 'auto',
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
