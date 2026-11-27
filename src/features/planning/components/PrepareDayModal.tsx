import { CheckCircle2, CloudDownload, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ModalPortal } from '../../../shared/ui/ModalPortal'
import { isOffline } from '../../../shared/lib/offline/state'
import { formatEquipmentTypes } from '../../../shared/constants/interventions'
import { askPersistentStorage, listVisitsToPrepare, prefetchReport, prefetchUnitPhotos, savePrepared } from '../prepareDay'
import { technicianLabel } from '../schemas'
import type { Intervention } from '../schemas'

type Props = {
  /** Fiche technicien du compte : seulement ses visites ; null = toutes les visites */
  technicianId: string | null
  onClose: () => void
  onDone?: () => void
}

type StepState = 'waiting' | 'loading' | 'done' | 'error'

const dayLabel = (i: Intervention) => {
  if (i.status === 'en_cours') return 'En cours'
  if (!i.scheduled_date) return 'Sans date'
  const d = new Date(`${i.scheduled_date.slice(0, 10)}T12:00:00`)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay ? "Aujourd'hui" : 'Demain'
}

/**
 * Avant de partir : garde sur l'appareil les rapports des visites du jour
 * (et du lendemain), pour travailler sans réseau sur place.
 */
export function PrepareDayModal({ technicianId, onClose, onDone }: Props) {
  const [visits, setVisits] = useState<Intervention[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [states, setStates] = useState<Record<string, StepState>>({})
  const [photos, setPhotos] = useState<{ done: number; total: number } | null>(null)
  const [phase, setPhase] = useState<'choose' | 'running' | 'finished'>('choose')
  const [summary, setSummary] = useState<{ ok: number; failed: number; photos: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const offline = isOffline()

  useEffect(() => {
    if (offline) return
    let alive = true
    listVisitsToPrepare(technicianId)
      .then((list) => {
        if (!alive) return
        setVisits(list)
        setSelected(new Set(list.map((v) => v.id)))
      })
      .catch(() => { if (alive) { setVisits([]); setError('Impossible de charger les visites. Vérifiez le réseau.') } })
    return () => { alive = false }
  }, [technicianId, offline])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run() {
    if (!visits) return
    const chosen = visits.filter((v) => selected.has(v.id))
    if (chosen.length === 0) return
    setPhase('running')
    setError(null)
    void askPersistentStorage()
    let ok = 0
    let failed = 0
    const doneIds: string[] = []
    for (const v of chosen) {
      if (isOffline()) { setStates((s) => ({ ...s, [v.id]: 'error' })); failed += 1; continue }
      setStates((s) => ({ ...s, [v.id]: 'loading' }))
      try {
        await prefetchReport(v.id)
        setStates((s) => ({ ...s, [v.id]: 'done' }))
        ok += 1
        doneIds.push(v.id)
      } catch {
        setStates((s) => ({ ...s, [v.id]: 'error' }))
        failed += 1
      }
    }
    let savedPhotos = 0
    try {
      const siteIds = Array.from(new Set(chosen.map((v) => v.site_id).filter((x): x is string => !!x)))
      savedPhotos = await prefetchUnitPhotos(siteIds, (done, total) => setPhotos({ done, total }))
    } catch { /* photos manquées : elles s'afficheront avec du réseau */ }
    savePrepared(doneIds)
    setSummary({ ok, failed, photos: savedPhotos })
    setPhase('finished')
    onDone?.()
  }

  const count = selected.size

  return (
    <ModalPortal>
      <div className="overlay open">
        <div className="modal" style={{ maxWidth: 560 }}>
          <div className="modal-head">
            <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CloudDownload size={16} strokeWidth={2} />
              Préparer ma journée
            </span>
            {phase !== 'running' && (
              <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            {offline ? (
              <p className="text-ink-2 text-sm" style={{ margin: 0 }}>
                Il faut du réseau pour préparer la journée. Faites-le avant de partir, au bureau ou à la maison.
              </p>
            ) : phase === 'finished' && summary ? (
              <>
                <p className="text-sm" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <CheckCircle2 size={18} strokeWidth={2} style={{ color: 'var(--grn)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong>C'est prêt.</strong> {summary.ok} visite{summary.ok > 1 ? 's' : ''} gardée{summary.ok > 1 ? 's' : ''} sur cet appareil
                    {summary.photos > 0 ? `, ${summary.photos} photo${summary.photos > 1 ? 's' : ''} de repérage` : ''}.
                    {' '}Sur place, vous pouvez faire les contrôles sans réseau : tout partira au retour du réseau.
                  </span>
                </p>
                {summary.failed > 0 && (
                  <p className="text-red text-sm" style={{ margin: 0 }}>
                    {summary.failed} visite{summary.failed > 1 ? 's' : ''} n'{summary.failed > 1 ? 'ont' : 'a'} pas pu être préparée{summary.failed > 1 ? 's' : ''} : réessayez avec un meilleur réseau.
                  </p>
                )}
                <p className="text-ink-3 text-xs" style={{ margin: 0 }}>
                  Rouvrez Firovia depuis l'icône de l'écran d'accueil (ou le même navigateur) sur cet appareil.
                </p>
              </>
            ) : visits === null ? (
              <p className="text-ink-3 text-sm" style={{ margin: 0 }}>Chargement des visites…</p>
            ) : visits.length === 0 ? (
              <p className="text-ink-2 text-sm" style={{ margin: 0 }}>Aucune visite aujourd'hui ni demain.</p>
            ) : (
              <>
                <p className="text-ink-2 text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
                  Les rapports cochés sont gardés sur cet appareil (appareils, derniers contrôles, consignes, photos de repérage),
                  pour travailler sans réseau sur place. Comptez quelques secondes par visite : restez sur cet écran.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {visits.map((v) => {
                    const st = states[v.id]
                    return (
                      <label
                        key={v.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--brd)', borderRadius: 8, cursor: phase === 'choose' ? 'pointer' : 'default' }}
                      >
                        {phase === 'choose' ? (
                          <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} style={{ width: 'auto' }} />
                        ) : st === 'loading' ? (
                          <Loader2 size={16} className="spin" style={{ color: 'var(--acc)' }} />
                        ) : st === 'done' ? (
                          <CheckCircle2 size={16} style={{ color: 'var(--grn)' }} />
                        ) : st === 'error' ? (
                          <XCircle size={16} style={{ color: 'var(--red)' }} />
                        ) : (
                          <span style={{ width: 16, height: 16, borderRadius: 8, border: '1.5px solid var(--brd2)', display: 'inline-block' }} />
                        )}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.35 }}>
                          <strong>{v.reference}</strong> · {v.site_name || v.client_name}
                          <span className="text-ink-3" style={{ display: 'block', fontSize: 12 }}>
                            {dayLabel(v)} · {formatEquipmentTypes(v.equipment_types)}{technicianLabel(v) ? ` · ${technicianLabel(v)}` : ''}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {photos && photos.total > 0 && (
                  <p className="text-ink-2 text-sm" style={{ margin: 0 }}>Photos de repérage : {photos.done} / {photos.total}</p>
                )}
              </>
            )}

            {error && <p className="text-red text-sm" style={{ margin: 0 }}>{error}</p>}

            <div className="modal-foot">
              {phase === 'finished' || offline ? (
                <button type="button" className="mf prim" onClick={onClose}>Fermer</button>
              ) : (
                <>
                  <button type="button" className="mf out" onClick={onClose} disabled={phase === 'running'}>Annuler</button>
                  <button
                    type="button"
                    className="mf prim"
                    onClick={() => void run()}
                    disabled={phase === 'running' || !visits || count === 0}
                  >
                    {phase === 'running' ? 'Préparation…' : `Préparer ${count} visite${count > 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
