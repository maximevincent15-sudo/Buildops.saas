import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { MapPin, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listInterventions } from '../features/planning/api'
import { InterventionModal } from '../features/planning/components/InterventionModal'
import { InterventionRowActions } from '../features/planning/components/InterventionRowActions'
import { InterventionStatusBadge } from '../features/planning/components/InterventionStatusBadge'
import { PlanningWeekView } from '../features/planning/components/PlanningWeekView'
import type { Intervention } from '../features/planning/schemas'
import {
  EQUIPMENT_TYPES,
  INTERVENTION_PRIORITIES,
} from '../shared/constants/interventions'
import type {
  EquipmentType,
  InterventionPriority,
} from '../shared/constants/interventions'

type ViewMode = 'list' | 'week'

function formatDate(d: string | null) {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

export function PlanningPage() {
  const [interventions, setInterventions] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Intervention | null>(null)
  const [view, setView] = useState<ViewMode>('list')
  const [isFullscreen, setIsFullscreen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await listInterventions()
      setInterventions(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(i: Intervention) {
    setEditing(i)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  const total = interventions.length

  return (
    <div className={isFullscreen ? 'planning-fullscreen' : undefined}>
      <div className="dash-top">
        <div>
          <div className="dash-title">Planning des interventions</div>
          <div className="dash-sub">
            {total === 0 && 'Aucune intervention pour le moment'}
            {total === 1 && '1 intervention enregistrée'}
            {total > 1 && `${total} interventions enregistrées`}
          </div>
        </div>
        <div className="dash-acts">
          {view === 'week' && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {isFullscreen ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
              <span className="fs-label">{isFullscreen ? 'Réduire' : 'Plein écran'}</span>
            </button>
          )}
          <button type="button" className="btn-sm acc" onClick={openCreate}>
            + Nouvelle intervention
          </button>
        </div>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-pill${view === 'list' ? ' on' : ''}`}
            onClick={() => setView('list')}
          >
            Liste
          </button>
          <button
            type="button"
            className={`filter-pill${view === 'week' ? ' on' : ''}`}
            onClick={() => setView('week')}
          >
            Semaine
          </button>
        </div>
      )}

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {!loading && !error && total === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucune intervention pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '1.2rem' }}>
              Crée ta première intervention pour la voir apparaître ici.
            </p>
            <button type="button" className="btn-sm acc" onClick={openCreate}>
              + Créer une intervention
            </button>
          </div>
        )}

        {!loading && !error && total > 0 && view === 'list' && (
          <>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '.75rem' }}>
              Clique sur une ligne pour modifier ou supprimer une intervention.
            </p>
            <table className="dtbl">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Client / Site</th>
                  <th>Équipement</th>
                  <th>Technicien</th>
                  <th>Date prévue</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {interventions.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => openEdit(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><strong>{i.reference}</strong></td>
                    <td>
                      <div>{i.client_name}</div>
                      {i.site_name && (
                        <div style={{ fontSize: '.72rem', color: 'var(--ink2)' }}>
                          {i.site_name}
                        </div>
                      )}
                      {i.address && (
                        <div style={{ fontSize: '.68rem', color: 'var(--ink3)', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={10} strokeWidth={2} />
                          {i.address}
                        </div>
                      )}
                    </td>
                    <td>{EQUIPMENT_TYPES[i.equipment_type as EquipmentType] ?? i.equipment_type}</td>
                    <td>{i.technician_name ?? '—'}</td>
                    <td>{formatDate(i.scheduled_date)}</td>
                    <td>{INTERVENTION_PRIORITIES[i.priority as InterventionPriority] ?? i.priority}</td>
                    <td><InterventionStatusBadge status={i.status} /></td>
                    <td><InterventionRowActions intervention={i} onChanged={() => void load()} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!loading && !error && total > 0 && view === 'week' && (
          <PlanningWeekView
            interventions={interventions}
            onClickIntervention={openEdit}
          />
        )}
      </div>

      <InterventionModal
        open={modalOpen}
        onClose={closeModal}
        onChanged={() => void load()}
        intervention={editing}
      />
    </div>
  )
}
