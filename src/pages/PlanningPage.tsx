import { addDays, format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarPlus, MapPin, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QuickActions } from '../shared/ui/QuickActions'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../features/auth/store'
import { listInterventions } from '../features/planning/api'
import { listBlocksForRange } from '../features/planning/blocksApi'
import { InterventionModal } from '../features/planning/components/InterventionModal'
import { InterventionRowActions } from '../features/planning/components/InterventionRowActions'
import { InterventionStatusBadge } from '../features/planning/components/InterventionStatusBadge'
import { PlanningWeekView } from '../features/planning/components/PlanningWeekView'
import { buildIcsCalendar, buildIcsForIntervention, downloadIcs } from '../features/planning/icsExport'
import type { Intervention } from '../features/planning/schemas'
import {
  INTERVENTION_PRIORITIES,
  formatEquipmentTypesShort,
} from '../shared/constants/interventions'
import type { InterventionPriority } from '../shared/constants/interventions'

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
  const [exporting, setExporting] = useState(false)
  const profile = useAuthStore((s) => s.profile)

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

  async function handleExportIcs() {
    setExporting(true)
    try {
      // Exporte les blocs de -30 jours à +180 jours (6 mois à venir)
      const today = new Date()
      const start = subDays(today, 30)
      const end = addDays(today, 180)
      const toIso = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }
      const blocks = await listBlocksForRange(toIso(start), toIso(end))
      const orgName = profile?.organizations?.name ?? 'BuildOps'
      const ics = buildIcsCalendar(interventions, blocks, `Planning ${orgName}`)
      const stamp = format(today, 'yyyyMMdd')
      downloadIcs(`planning-${stamp}.ics`, ics)
    } catch (e) {
      alert(`Erreur lors de l'export : ${e instanceof Error ? e.message : 'inconnue'}`)
    } finally {
      setExporting(false)
    }
  }

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
          {total > 0 && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => void handleExportIcs()}
              disabled={exporting}
              title="Télécharge un fichier .ics à importer dans Google Calendar, Outlook, Apple Calendar, Teams…"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <CalendarPlus size={14} strokeWidth={2} />
              {exporting ? 'Export…' : 'Exporter (.ics)'}
            </button>
          )}
          <Link
            to="/planning/import"
            className="btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={13} strokeWidth={2} />
            Importer
          </Link>
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
                      {(i.address || i.scheduled_date) && (
                        <div style={{ marginTop: '4px' }}>
                          <QuickActions
                            address={i.address}
                            onAddToCalendar={
                              i.scheduled_date
                                ? () => {
                                    const ics = buildIcsForIntervention(i)
                                    downloadIcs(`${i.reference}.ics`, ics)
                                  }
                                : undefined
                            }
                          />
                        </div>
                      )}
                    </td>
                    <td>{formatEquipmentTypesShort(i)}</td>
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
    </>
  )
}
