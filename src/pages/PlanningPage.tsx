import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useEffect, useState } from 'react'
import { listInterventions } from '../features/planning/api'
import { InterventionModal } from '../features/planning/components/InterventionModal'
import { InterventionStatusBadge } from '../features/planning/components/InterventionStatusBadge'
import type { Intervention } from '../features/planning/schemas'
import {
  EQUIPMENT_TYPES,
  INTERVENTION_PRIORITIES,
} from '../shared/constants/interventions'
import type {
  EquipmentType,
  InterventionPriority,
} from '../shared/constants/interventions'

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
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const total = interventions.length

  return (
    <>
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
          <button type="button" className="btn-sm acc" onClick={() => setModalOpen(true)}>
            + Nouvelle intervention
          </button>
        </div>
      </div>

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
            <button type="button" className="btn-sm acc" onClick={() => setModalOpen(true)}>
              + Créer une intervention
            </button>
          </div>
        )}

        {!loading && !error && total > 0 && (
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
              </tr>
            </thead>
            <tbody>
              {interventions.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.reference}</strong></td>
                  <td>
                    <div>{i.client_name}</div>
                    {i.site_name && (
                      <div style={{ fontSize: '.72rem', color: 'var(--ink2)' }}>
                        {i.site_name}
                      </div>
                    )}
                  </td>
                  <td>{EQUIPMENT_TYPES[i.equipment_type as EquipmentType] ?? i.equipment_type}</td>
                  <td>{i.technician_name ?? '—'}</td>
                  <td>{formatDate(i.scheduled_date)}</td>
                  <td>{INTERVENTION_PRIORITIES[i.priority as InterventionPriority] ?? i.priority}</td>
                  <td><InterventionStatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <InterventionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void load()}
      />
    </>
  )
}
