import { RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { QueuedRequest } from '../lib/offline/db'
import { dropQueueItem, getQueueItems, retryQueueItem } from '../lib/offline/sync'
import { ModalPortal } from './ModalPortal'

const TABLE_LABELS: Record<string, string> = {
  equipment_checks: 'Contrôle d’un appareil',
  equipment_units: 'Appareil',
  zones: 'Zone',
  anomalies: 'Anomalie',
  reports: 'Rapport',
  interventions: 'Intervention',
  sites: 'Site',
  clients: 'Client',
}

const METHOD_LABELS: Record<string, string> = {
  POST: 'ajout',
  PATCH: 'modification',
  PUT: 'modification',
  DELETE: 'suppression',
}

/** Nom lisible d'un élément de la file : « Appareil · modification », « Photo »… */
function describeQueued(q: QueuedRequest): string {
  if (q.kind === 'storage') return q.method === 'DELETE' ? 'Photo · suppression' : 'Photo'
  if (q.kind === 'rpc') return `Action · ${q.url.split('/rpc/')[1]?.split('?')[0] ?? 'serveur'}`
  if (q.kind === 'function') return `Envoi · ${q.url.split('/functions/v1/')[1]?.split('?')[0] ?? 'serveur'}`
  const what = (q.table && TABLE_LABELS[q.table]) ?? q.table ?? 'Enregistrement'
  const how = METHOD_LABELS[q.method.toUpperCase()]
  return how ? `${what} · ${how}` : what
}

/** Indice pour reconnaître l'élément : nom de fichier, n° d'appareil, nom de zone… */
function hintOf(q: QueuedRequest): string | null {
  if (q.kind === 'storage') {
    const path = decodeURIComponent(q.url.split('?')[0] ?? '')
    return path.split('/').pop() || null
  }
  if (!q.body) return null
  try {
    const parsed = JSON.parse(q.body) as unknown
    const row = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | undefined
    if (!row || typeof row !== 'object') return null
    for (const key of ['serial_number', 'name', 'title', 'reference', 'implantation']) {
      const v = row[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  } catch {
    return null
  }
  return null
}

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Enregistrements refusés par le serveur : voir la raison, réessayer ou retirer */
export function OfflineFailuresModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<QueuedRequest[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const reload = useCallback(async () => {
    const list = await getQueueItems()
    setItems(list.filter((q) => q.failed))
  }, [])

  useEffect(() => {
    let cancelled = false
    void getQueueItems().then((list) => {
      if (!cancelled) setItems(list.filter((q) => q.failed))
    })
    return () => { cancelled = true }
  }, [])

  async function retry(seq: number) {
    setBusy(seq)
    try {
      await retryQueueItem(seq)
    } finally {
      await reload()
      setBusy(null)
    }
  }

  async function drop(q: QueuedRequest) {
    if (!window.confirm(`Retirer « ${describeQueued(q)} » ? Il ne sera pas envoyé.`)) return
    setBusy(q.seq!)
    try {
      await dropQueueItem(q.seq!)
    } finally {
      await reload()
      setBusy(null)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay open">
        <div className="modal" style={{ maxWidth: 620 }}>
          <div className="modal-head">
            <span className="modal-title">Enregistrements refusés</span>
            <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
          </div>

          <p className="text-ink-2 text-sm" style={{ margin: '0 0 .9rem', lineHeight: 1.5 }}>
            Faits sur cet appareil, ils n’ont pas été acceptés par le serveur. Ils ne sont plus renvoyés tout seuls :
            réessayez-les, ou retirez-les s’ils ne servent plus.
          </p>

          {items === null ? (
            <p className="text-ink-3 text-sm">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-grn text-sm">✅ Plus aucun enregistrement refusé.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((q) => {
                const hint = hintOf(q)
                return (
                  <div key={q.seq} style={{ border: '.5px solid var(--brd)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <strong style={{ fontSize: '.9rem' }}>{describeQueued(q)}</strong>
                      <span className="text-ink-3 text-xs" style={{ flexShrink: 0 }}>{when(q.createdAt)}</span>
                    </div>
                    {hint && <div className="text-ink-2 text-xs" style={{ marginTop: 2, wordBreak: 'break-word' }}>{hint}</div>}
                    <div className="text-xs" style={{ marginTop: 6, color: 'var(--red)', wordBreak: 'break-word' }}>
                      {q.lastError || 'Refusé sans message'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void retry(q.seq!)}
                        disabled={busy !== null}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <RefreshCw size={13} /> {busy === q.seq ? 'Envoi…' : 'Réessayer'}
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void drop(q)}
                        disabled={busy !== null}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)' }}
                      >
                        <Trash2 size={13} /> Retirer
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
