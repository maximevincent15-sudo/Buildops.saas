import { CloudDownload, MapPin, Navigation } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../auth/store'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'
import { listMyInterventions, setInterventionStatus } from '../api'
import type { Intervention } from '../schemas'
import { interventionAddress as addressOf } from '../address'
import { lastPrepared } from '../prepareDay'
import { PrepareDayModal } from './PrepareDayModal'

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function dayLabel(date: string | null): string {
  if (!date) return 'Sans date'
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * « Ma journée » : les interventions du technicien connecté (en cours,
 * aujourd'hui, puis les 7 prochains jours), avec Démarrer et l'itinéraire.
 */
export function MyDayCard() {
  const myTechnicianId = useAuthStore((s) => s.myTechnicianId)
  const navigate = useNavigate()
  const [items, setItems] = useState<Intervention[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [prepareOpen, setPrepareOpen] = useState(false)
  const [prepared, setPrepared] = useState(() => lastPrepared())

  useEffect(() => {
    if (!myTechnicianId) return
    let alive = true
    listMyInterventions(myTechnicianId)
      .then((list) => { if (alive) setItems(list) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [myTechnicianId])

  if (!myTechnicianId) return null

  const today = isoDay(new Date())
  const preparedLabel = prepared && prepared.at.slice(0, 10) === today && prepared.ids.length > 0
    ? `Journée préparée à ${new Date(prepared.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : ${prepared.ids.length} visite${prepared.ids.length > 1 ? 's' : ''} disponible${prepared.ids.length > 1 ? 's' : ''} sans réseau`
    : null
  const todayItems = (items ?? []).filter((i) => i.status === 'en_cours' || i.scheduled_date === today)
  const upcoming = (items ?? []).filter((i) => i.status !== 'en_cours' && i.scheduled_date && i.scheduled_date > today && i.status !== 'terminee')

  async function start(i: Intervention) {
    setBusy(i.id)
    try {
      await setInterventionStatus(i.id, 'en_cours')
      navigate(`/rapports/${i.id}`)
    } catch {
      setBusy(null)
      alert('Impossible de démarrer. Vérifiez votre connexion et réessayez.')
    }
  }

  return (
    <div className="b-card myday">
      <div className="b-section-head" style={{ marginBottom: 10 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>Ma journée</div>
          <div className="b-section-s" style={{ fontSize: 12 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn-sm"
            onClick={() => setPrepareOpen(true)}
            title="Garder les rapports du jour sur cet appareil pour travailler sans réseau"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <CloudDownload size={13} strokeWidth={2} />
            Préparer ma journée
          </button>
          <Link to="/planning" className="btn-sm">Mon planning</Link>
        </div>
      </div>
      {preparedLabel && (
        <p className="text-ink-3 text-xs" style={{ margin: '-4px 0 8px' }}>{preparedLabel}</p>
      )}
      {prepareOpen && (
        <PrepareDayModal technicianId={myTechnicianId} onClose={() => setPrepareOpen(false)} onDone={() => setPrepared(lastPrepared())} />
      )}

      {items === null ? (
        <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>Chargement…</p>
      ) : todayItems.length === 0 ? (
        <p className="text-ink-2 text-sm font-light" style={{ margin: 0 }}>Aucune intervention prévue aujourd'hui.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {todayItems.map((i) => {
            const address = addressOf(i)
            const done = i.status === 'terminee'
            return (
              <div key={i.id} className={`myday-item${i.status === 'en_cours' ? ' live' : ''}${done ? ' done' : ''}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="myday-time">
                    {i.start_time ? i.start_time.slice(0, 5).replace(':', 'h') : 'Dans la journée'}
                    {i.status === 'en_cours' && <span className="myday-pill">En cours</span>}
                    {done && <span className="myday-pill ok">Terminé</span>}
                  </div>
                  <div className="myday-title">{i.site_name || i.client_name}</div>
                  <div className="myday-meta">
                    {i.site_name && i.client_name !== i.site_name ? `${i.client_name} · ` : ''}{formatEquipmentTypesShort(i)}
                  </div>
                  {address && (
                    <div className="myday-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} /> {address}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                  {i.status === 'en_cours' ? (
                    <Link to={`/rapports/${i.id}`} className="btn-sm acc" style={{ textAlign: 'center' }}>Continuer</Link>
                  ) : done ? (
                    <Link to={`/rapports/${i.id}`} className="btn-sm" style={{ textAlign: 'center' }}>Rapport</Link>
                  ) : (
                    <button type="button" className="btn-sm acc" disabled={busy === i.id} onClick={() => void start(i)}>
                      {busy === i.id ? '…' : 'Démarrer'}
                    </button>
                  )}
                  {address && !done && (
                    <a
                      className="btn-sm"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <Navigation size={12} /> Itinéraire
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="myday-sub">Cette semaine</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {upcoming.slice(0, 8).map((i) => (
              <Link key={i.id} to="/planning" className="myday-row">
                <span className="myday-day">{dayLabel(i.scheduled_date)}{i.start_time ? ` · ${i.start_time.slice(0, 5).replace(':', 'h')}` : ''}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.site_name || i.client_name} · {formatEquipmentTypesShort(i)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
