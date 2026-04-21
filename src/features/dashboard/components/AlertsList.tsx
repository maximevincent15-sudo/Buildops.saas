import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listInterventionsByStatus } from '../../planning/api'
import type { Intervention } from '../../planning/schemas'
import { EQUIPMENT_TYPES } from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'

export function AlertsList() {
  const [alerts, setAlerts] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listInterventionsByStatus('a_planifier', 4)
      .then((data) => { if (alive) setAlerts(data) })
      .catch(() => { /* silently */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const count = alerts.length

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">À planifier</span>
        {count > 0 && (
          <span className="badge b-red">{count} urgente{count > 1 ? 's' : ''}</span>
        )}
        {count === 0 && !loading && (
          <span className="badge b-grn">Tout est planifié</span>
        )}
      </div>

      {loading && (
        <p className="text-ink-2 text-sm font-light" style={{ padding: '.5rem 0' }}>Chargement…</p>
      )}

      {!loading && count === 0 && (
        <p className="text-ink-2 text-sm font-light" style={{ padding: '.5rem 0' }}>
          Aucune intervention en attente de date. Bien joué ! 🎯
        </p>
      )}

      {!loading && count > 0 && alerts.map((a) => {
        const equip = EQUIPMENT_TYPES[a.equipment_type as EquipmentType] ?? a.equipment_type
        const isUrgent = a.priority === 'reglementaire' || a.priority === 'urgente'
        return (
          <div key={a.id} className={`al-item${isUrgent ? ' crit' : ''}`}>
            <div className={`al-dot dot-${isUrgent ? 'r' : 'o'}`} />
            <div>
              <div className="al-main">
                {a.client_name}{a.site_name ? ` — ${a.site_name}` : ''} · {equip}
              </div>
              <div className="al-sub">
                {a.priority === 'reglementaire' && 'Échéance réglementaire · '}
                {a.priority === 'urgente' && 'Priorité urgente · '}
                Sans date planifiée
              </div>
            </div>
          </div>
        )
      })}

      {!loading && count > 0 && (
        <div style={{ marginTop: '.6rem', textAlign: 'right' }}>
          <Link to="/planning" className="card-lnk">Tout voir dans le planning</Link>
        </div>
      )}
    </div>
  )
}
