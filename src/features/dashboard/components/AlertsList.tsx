import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Flame, Wrench } from 'lucide-react'
import { listInterventionsByStatus } from '../../planning/api'
import type { Intervention } from '../../planning/schemas'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'

/**
 * AlertsList v2 — Direction B (Mercury-vibe).
 *
 * Liste compacte des interventions urgentes / réglementaires en attente
 * de planification. Style cohérent avec « Alertes réglementaires » du mockup :
 * - IcoBox coloré (rouge pour échus, orange pour urgents, vert pour info)
 * - Client + détail (équipement · ville)
 * - Tag à droite (Échu · J-X, ou J-X simple)
 */
export function AlertsList() {
  const [alerts, setAlerts] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listInterventionsByStatus('a_planifier', 4)
      .then((data) => { if (alive) setAlerts(data) })
      .catch(() => { /* silent */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const count = alerts.length

  return (
    <div className="b-card">
      <div className="b-section-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>Alertes réglementaires</div>
          <div className="b-section-s" style={{ fontSize: 12 }}>
            {count === 0 ? 'Tout est planifié' : `${count} en attente de planification`}
          </div>
        </div>
        <Link to="/planning" className="b-section-link">Voir tout →</Link>
      </div>

      {loading && (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>Chargement…</p>
      )}

      {!loading && count === 0 && (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>
          ✓ Aucune intervention en attente. Tout est planifié.
        </p>
      )}

      {!loading && count > 0 && (
        <div className="b-list">
          {alerts.map((a) => {
            const equip = formatEquipmentTypesShort(a)
            const isReglementaire = a.priority === 'reglementaire'
            const isUrgent = a.priority === 'urgente'
            const variant: 'r' | 'o' | 'g' = isReglementaire ? 'r' : isUrgent ? 'o' : 'o'
            const Ico = isReglementaire ? AlertTriangle : isUrgent ? Flame : Wrench
            const tagLabel = isReglementaire
              ? 'Échéance'
              : isUrgent
              ? 'Urgent'
              : 'À planifier'
            const tagCls = isReglementaire ? 'b-pill r' : isUrgent ? 'b-pill o' : 'b-pill'
            const subParts: string[] = []
            if (equip) subParts.push(equip)
            if (a.site_name) subParts.push(a.site_name)
            return (
              <div key={a.id} className="b-list-item">
                <div className={`b-alert-icobox ${variant}`}>
                  <Ico size={18} strokeWidth={2} />
                </div>
                <div className="b-alert-info">
                  <div className="b-alert-t">{a.client_name}</div>
                  <div className="b-alert-s">{subParts.join(' · ') || 'Sans date'}</div>
                </div>
                <span className={tagCls}>{tagLabel}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
