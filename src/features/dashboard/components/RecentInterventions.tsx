import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { listRecentInterventions } from '../../planning/api'
import type { Intervention } from '../../planning/schemas'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'

function timeOrDate(d: string | null): string {
  if (!d) return '—'
  try {
    const date = new Date(d)
    // Si la date est aujourd'hui et qu'on a un horaire valide, on l'affiche
    if (date.toString() === 'Invalid Date') return '—'
    if (isToday(date)) {
      // Heure si dispo (HH:MM)
      const hh = date.getHours()
      const mm = date.getMinutes()
      if (hh !== 0 || mm !== 0) {
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      }
      return 'Auj.'
    }
    if (isYesterday(date)) return 'Hier'
    return format(date, 'd MMM', { locale: fr })
  } catch {
    return '—'
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
          Aucune intervention pour le moment. Clique sur <strong>+ Nouvelle intervention</strong> en haut pour démarrer.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="b-list">
          {rows.map((r) => {
            const time = timeOrDate(r.scheduled_date ?? r.created_at)
            const equip = formatEquipmentTypesShort(r)
            const pill = statusPill(r.status)
            const subParts: string[] = []
            if (r.site_name) subParts.push(r.site_name)
            if (r.technician_name) subParts.push(r.technician_name)
            if (equip) subParts.push(equip)
            return (
              <div key={r.id} className="b-list-item">
                <div className="b-inter-time">{time}</div>
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
