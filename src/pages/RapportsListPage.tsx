import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckCircle2, Download, FileEdit } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listReports } from '../features/rapports/api'
import type { ReportWithIntervention } from '../features/rapports/api'
import { EQUIPMENT_TYPES } from '../shared/constants/interventions'
import type { EquipmentType } from '../shared/constants/interventions'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

export function RapportsListPage() {
  const [reports, setReports] = useState<ReportWithIntervention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'finalized' | 'draft'>('all')

  async function load() {
    setLoading(true)
    try {
      const data = await listReports()
      setReports(data)
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

  const filtered = reports.filter((r) => {
    if (filter === 'finalized') return !!r.completed_at
    if (filter === 'draft') return !r.completed_at
    return true
  })

  const total = reports.length
  const finalized = reports.filter((r) => !!r.completed_at).length
  const drafts = total - finalized

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Rapports d'intervention</div>
          <div className="dash-sub">
            {total === 0 && 'Aucun rapport pour le moment'}
            {total === 1 && '1 rapport enregistré'}
            {total > 1 && `${total} rapports · ${finalized} finalisé${finalized > 1 ? 's' : ''}${drafts > 0 ? `, ${drafts} brouillon${drafts > 1 ? 's' : ''}` : ''}`}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-pill${filter === 'all' ? ' on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tous ({total})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'finalized' ? ' on' : ''}`}
            onClick={() => setFilter('finalized')}
          >
            Finalisés ({finalized})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'draft' ? ' on' : ''}`}
            onClick={() => setFilter('draft')}
          >
            Brouillons ({drafts})
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
              Aucun rapport pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '1.2rem' }}>
              Les rapports apparaissent ici dès que tu démarres une intervention et rédiges un rapport terrain.
            </p>
            <Link to="/planning" className="btn-sm acc">Aller au planning</Link>
          </div>
        )}

        {!loading && !error && total > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p className="text-ink-3 text-sm font-light">
              Aucun rapport dans ce filtre.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <table className="dtbl">
            <thead>
              <tr>
                <th>Réf.</th>
                <th>Client</th>
                <th>Équipement</th>
                <th>Technicien</th>
                <th>Statut</th>
                <th>Date finalisation</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const interv = r.intervention
                if (!interv) return null
                const equipLabel =
                  EQUIPMENT_TYPES[interv.equipment_type as EquipmentType] ??
                  interv.equipment_type
                const isDone = !!r.completed_at
                return (
                  <tr key={r.id}>
                    <td><strong>{interv.reference}</strong></td>
                    <td>{interv.client_name}</td>
                    <td>{equipLabel}</td>
                    <td>{interv.technician_name ?? '—'}</td>
                    <td>
                      {isDone ? (
                        <span className="badge b-grn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={10} /> Finalisé
                        </span>
                      ) : (
                        <span className="badge b-org" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <FileEdit size={10} /> Brouillon
                        </span>
                      )}
                    </td>
                    <td>{formatDate(r.completed_at)}</td>
                    <td>
                      {r.pdf_url ? (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="act-btn done"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Download size={11} />
                          Télécharger
                        </a>
                      ) : (
                        <Link
                          to={`/rapports/${interv.id}`}
                          className="act-btn subtle"
                        >
                          Ouvrir
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
