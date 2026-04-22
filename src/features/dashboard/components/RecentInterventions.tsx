import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { listRecentInterventions } from '../../planning/api'
import { InterventionStatusBadge } from '../../planning/components/InterventionStatusBadge'
import type { Intervention } from '../../planning/schemas'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'

function formatShortDate(d: string | null): string {
  if (!d) return '—'
  try {
    const date = new Date(d)
    if (isToday(date)) return "Auj."
    if (isYesterday(date)) return 'Hier'
    return format(date, 'd MMM', { locale: fr })
  } catch {
    return '—'
  }
}

export function RecentInterventions() {
  const [rows, setRows] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listRecentInterventions(5)
      .then((data) => { if (alive) setRows(data) })
      .catch(() => { /* ignoré — dashboard peut rester muet */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">Interventions récentes</span>
        <Link to="/planning" className="card-lnk">Voir tout</Link>
      </div>

      {loading && (
        <p className="text-ink-2 text-sm font-light" style={{ padding: '.5rem 0' }}>Chargement…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-ink-2 text-sm font-light" style={{ padding: '.5rem 0' }}>
          Aucune intervention pour le moment. Clique sur <strong>+ Nouvelle intervention</strong> en haut pour démarrer.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <table className="dtbl">
          <thead>
            <tr>
              <th>Réf.</th>
              <th>Client</th>
              <th>Équipement</th>
              <th>Statut</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.reference}</td>
                <td>{r.client_name}</td>
                <td>{formatEquipmentTypesShort(r)}</td>
                <td><InterventionStatusBadge status={r.status} /></td>
                <td>{formatShortDate(r.scheduled_date ?? r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
