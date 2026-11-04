import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { listRecentInterventions } from '../../planning/api'
import type { Intervention } from '../../planning/schemas'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'

/**
 * Heure (aujourd'hui) ou date de l'intervention. La date prévue est un jour
 * sans heure (« 2026-11-04 ») : on la lit en heure locale, sinon elle
 * devient « 01:00 » ; l'heure vient de start_time. L'année s'affiche si ce
 * n'est pas l'année en cours.
 */
function timeOrDate(r: Pick<Intervention, 'scheduled_date' | 'start_time' | 'created_at'>): { label: string; year?: number } {
  try {
    const date = r.scheduled_date ? new Date(`${r.scheduled_date.slice(0, 10)}T12:00:00`) : new Date(r.created_at)
    if (Number.isNaN(date.getTime())) return { label: '—' }
    if (isToday(date)) {
      return { label: r.scheduled_date && r.start_time ? r.start_time.slice(0, 5).replace(':', 'h') : 'Auj.' }
    }
    if (isYesterday(date)) return { label: 'Hier' }
    const year = date.getFullYear()
    return { label: format(date, 'd MMM', { locale: fr }), year: year === new Date().getFullYear() ? undefined : year }
  } catch {
    return { label: '—' }
  }
}

function statusPill(status: Intervention['status']) {
  switch (status) {
    case 'terminee': return { cls: 'b-pill done', label: '✓ Terminée' }
    case 'en_cours': return { cls: 'b-pill live', label: 'En cours' }
    case 'planifiee': return { cls: 'b-pill', label: 'À venir' }
    case 'a_planifier': return { cls: 'b-pill r', label: 'À planifier' }
    case 'annulee': return { cls: 'b-pill', label: 'Annulée' }
    default: return { cls: 'b-pill', label: status }
  }
}

/**
 * RecentInterventions v2 — Direction B (Mercury-vibe).
 *
 * Liste des interventions récentes au format « planning du jour » :
 * - Heure (ou date courte) en Syne Bold à gauche
 * - Client · site · technicien · équipement au milieu
 * - Status pill à droite (Terminée vert / En cours jaune avec dot / À venir gris)
 */
export function RecentInterventions() {
  const [rows, setRows] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listRecentInterventions(5)
      .then((data) => { if (alive) setRows(data) })
      .catch(() => { /* silent */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const liveCount = rows.filter((r) => r.status === 'en_cours').length

  return (
    <div className="b-card">
      <div className="b-section-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>Interventions récentes</div>
          <div className="b-section-s" style={{ fontSize: 12 }}>
            {rows.length === 0
              ? 'Aucune intervention pour le moment'
              : `${rows.length} dernière${rows.length > 1 ? 's' : ''}`}
            {liveCount > 0 && ` · ${liveCount} en cours`}
          </div>
        </div>
        <Link to="/planning" className="b-section-link">Planning →</Link>
      </div>

      {loading && (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>Chargement…</p>
      )}

      {!loading && rows.length === 0 && (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>
          Aucune intervention pour le moment. Cliquez sur <strong>+ Nouvelle intervention</strong> en haut pour démarrer.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="b-list">
          {rows.map((r) => {
            const time = timeOrDate(r)
            const equip = formatEquipmentTypesShort(r)
            const pill = statusPill(r.status)
            const subParts: string[] = []
            if (r.site_name) subParts.push(r.site_name)
            if (r.technician_name) subParts.push(r.technician_name)
            if (equip) subParts.push(equip)
            return (
              <div key={r.id} className="b-list-item">
                <div className="b-inter-time">
                  {time.label}
                  {time.year && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)' }}>{time.year}</div>}
                </div>
                <div className="b-inter-info">
                  <div className="b-inter-c">{r.client_name}</div>
                  <div className="b-inter-s">{subParts.join(' · ')}</div>
                </div>
                <span className={pill.cls}>{pill.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
