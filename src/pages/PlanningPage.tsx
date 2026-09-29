import { addDays, format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarPlus, MapPin, PanelRightClose, PanelRightOpen, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QuickActions } from '../shared/ui/QuickActions'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../features/auth/store'
import { listAnomalies, updateAnomaly } from '../features/anomalies/api'
import { ANOMALY_ACTION_LABELS } from '../features/anomalies/schemas'
import type { Anomaly } from '../features/anomalies/schemas'
import { QuoteModal } from '../features/devis/components/QuoteModal'
import type { UpsertQuoteInput } from '../features/devis/schemas'
import { createIntervention, listInterventions, scheduleIntervention } from '../features/planning/api'
import { PlanningTeamView } from '../features/planning/team/PlanningTeamView'
import { PlanningTodoPanel } from '../features/planning/team/PlanningTodoPanel'
import type { FollowItem, PanelTab } from '../features/planning/team/PlanningTodoPanel'
import {
  durationMinutes,
  formatDueShort,
  formatTime,
  isNoReport,
  siteLabel,
  sortTodos,
  startOfWeekMonday,
  toTodoItem,
  todayIso,
} from '../features/planning/team/teamUtils'
import type { TeamRow, TodoItem } from '../features/planning/team/teamUtils'
import { listTechnicians } from '../features/technicians/api'
import type { Technician } from '../features/technicians/schemas'
import { listBlocksForRange } from '../features/planning/blocksApi'
import type { PlanningBlock } from '../features/planning/blocksApi'
import { PlanningEventModal } from '../features/planning/events/PlanningEventModal'
import { InterventionModal } from '../features/planning/components/InterventionModal'
import { InterventionRowActions } from '../features/planning/components/InterventionRowActions'
import { InterventionStatusBadge } from '../features/planning/components/InterventionStatusBadge'
import { PlanningDayView } from '../features/planning/components/PlanningDayView'
import { PlanningMonthView } from '../features/planning/components/PlanningMonthView'
import { PlanningWeekGridView } from '../features/planning/components/PlanningWeekGridView'
import { buildIcsCalendar, buildIcsForIntervention, downloadIcs } from '../features/planning/icsExport'
import type { CreateInterventionInput, Intervention } from '../features/planning/schemas'
import {
  INTERVENTION_PRIORITIES,
  formatEquipmentTypesShort,
} from '../shared/constants/interventions'
import type { InterventionPriority } from '../shared/constants/interventions'

type ViewMode = 'team' | 'week' | 'day' | 'month'

const VIEW_STORAGE_KEY = 'firovia.planning.view'

function readStoredView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === 'team' || v === 'week' || v === 'day' || v === 'month') return v
  } catch {
    // stockage indisponible (navigation privée…) : vue par défaut
  }
  return 'team'
}

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
  const [view, setViewState] = useState<ViewMode>(readStoredView)
  const [exporting, setExporting] = useState(false)
  const profile = useAuthStore((s) => s.profile)

  // ─── Planning « Équipe » ───
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [openAnomalies, setOpenAnomalies] = useState<Anomaly[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()))
  const [panelTab, setPanelTab] = useState<PanelTab>('todo')
  const [panelVisible, setPanelVisible] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [quoteSeed, setQuoteSeed] = useState<Partial<UpsertQuoteInput> | null>(null)
  // Événements d'agenda (visio, rendez-vous…) : « + » sur chaque jour
  const [events, setEvents] = useState<PlanningBlock[]>([])
  const [eventModal, setEventModal] = useState<{ event: PlanningBlock | null; date: string; key: number } | null>(null)

  function setView(v: ViewMode) {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v)
    } catch {
      // préférence non mémorisée : sans conséquence
    }
  }

  /** Événements de -3 mois à +1 an (volume faible, filtrés par jour dans les vues) */
  async function loadEvents(): Promise<PlanningBlock[]> {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const to = new Date(now.getFullYear() + 1, now.getMonth(), 1)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return listBlocksForRange(iso(from), iso(to)).catch(() => [] as PlanningBlock[])
  }

  function openEventModal(event: PlanningBlock | null, date: string) {
    setEventModal({ event, date, key: Date.now() })
  }

  function showToast(msg: string, err = false) {
    setToast({ msg, err })
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 3500)
  }

  async function load() {
    setLoading(true)
    try {
      const [data, techs, anomalies, evts] = await Promise.all([
        listInterventions(),
        listTechnicians().catch(() => [] as Technician[]),
        listAnomalies({ status: 'open' }).catch(() => [] as Anomaly[]),
        loadEvents(),
      ])
      setInterventions(data)
      setTechnicians(techs)
      setOpenAnomalies(anomalies)
      setEvents(evts)
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

  const today = todayIso()
  const todos = useMemo<TodoItem[]>(
    () => sortTodos(interventions.map((i) => toTodoItem(i, today)).filter((t): t is TodoItem => t !== null)),
    [interventions, today],
  )
  const noReports = useMemo(
    () => interventions
      .filter((i) => isNoReport(i, today))
      .sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '')),
    [interventions, today],
  )
  const follows = useMemo<FollowItem[]>(() => {
    const byIntervention = new Map<string, Anomaly[]>()
    for (const a of openAnomalies) {
      if (!a.intervention_id) continue
      byIntervention.set(a.intervention_id, [...(byIntervention.get(a.intervention_id) ?? []), a])
    }
    return interventions
      .filter((i) => i.status === 'terminee' && byIntervention.has(i.id))
      .map((i) => ({ intervention: i, anomalies: byIntervention.get(i.id) ?? [] }))
      .sort((a, b) => (b.intervention.scheduled_date ?? '').localeCompare(a.intervention.scheduled_date ?? ''))
  }, [interventions, openAnomalies])
  const followCounts = useMemo(
    () => new Map(follows.map((f) => [f.intervention.id, f.anomalies.length])),
    [follows],
  )
  const lateCount = todos.filter((t) => t.late).length

  function focusPanel(tab: PanelTab) {
    setView('team')
    setPanelVisible(true)
    setPanelTab(tab)
  }

  async function handleSchedule(interventionId: string, row: TeamRow, date: string, startMin: number) {
    const i = interventions.find((x) => x.id === interventionId)
    if (!i) return
    if (i.status === 'terminee' || i.status === 'en_cours') {
      showToast('Une intervention en cours ou terminée ne peut pas être déplacée.', true)
      return
    }
    try {
      const updated = await scheduleIntervention(interventionId, {
        technicianId: row.technicianId,
        technicianName: row.name,
        date,
        startTime: formatTime(startMin),
        durationMinutes: durationMinutes(i),
      })
      setInterventions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      showToast(`✓ ${siteLabel(i)} : ${row.name} · ${formatDueShort(date)} à ${formatTime(startMin)}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Impossible de planifier cette intervention.', true)
    }
  }

  function handleCreateQuote(f: FollowItem) {
    const i = f.intervention
    setQuoteSeed({
      client_id: i.client_id ?? undefined,
      client_name: i.client_name,
      site_name: i.site_name ?? undefined,
      site_address: i.address ?? undefined,
      intervention_id: i.id,
      notes: `Suite à l'intervention ${i.reference} — anomalies à corriger.`,
      lines: f.anomalies.map((a, n) => ({
        position: n,
        description: `${a.title}${a.action ? ` — ${ANOMALY_ACTION_LABELS[a.action]}` : ''}${a.description ? `\n${a.description}` : ''}`,
        quantity: 1,
        unit_price_ht: 0,
        vat_rate: 20,
      })),
    })
  }

  async function handleScheduleRevisit(f: FollowItem) {
    if (!profile?.organization_id) return
    const i = f.intervention
    setBusyId(i.id)
    try {
      await createIntervention(
        {
          client_name: i.client_name,
          client_id: i.client_id ?? undefined,
          site_name: i.site_name ?? undefined,
          site_id: i.site_id ?? undefined,
          address: i.address ?? undefined,
          equipment_types: i.equipment_types as CreateInterventionInput['equipment_types'],
          priority: f.anomalies.some((a) => a.priority === 'high') ? 'urgente' : 'normale',
          intervention_type: 'corrective',
          recurrence_active: false,
          notes: `Repasse suite à ${i.reference} — anomalies à traiter :\n${f.anomalies
            .map((a) => `• ${a.title}${a.action ? ` (${ANOMALY_ACTION_LABELS[a.action]})` : ''}`)
            .join('\n')}`,
          chantier_address: i.chantier_address ?? undefined,
          chantier_postal_code: i.chantier_postal_code ?? undefined,
          chantier_city: i.chantier_city ?? undefined,
          chantier_contact_name: i.chantier_contact_name ?? undefined,
          chantier_contact_phone: i.chantier_contact_phone ?? undefined,
          chantier_access_parking: i.chantier_access_parking ?? undefined,
          chantier_access_digicode: i.chantier_access_digicode ?? undefined,
          chantier_access_building: i.chantier_access_building ?? undefined,
          chantier_access_hours: i.chantier_access_hours ?? undefined,
        },
        profile.organization_id,
      )
      // Les anomalies passent en « Planifiée » : la suite est décidée
      await Promise.all(f.anomalies.map((a) => updateAnomaly(a.id, { status: 'planned' })))
      await load()
      setPanelTab('todo')
      showToast('✓ Repasse ajoutée à « À planifier » : glisse-la sur un technicien.')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Impossible de créer la repasse.', true)
    } finally {
      setBusyId(null)
    }
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
      const orgName = profile?.organizations?.name ?? 'Firovia'
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
          {total === 0 ? (
            <div className="dash-sub">Aucune intervention pour le moment</div>
          ) : (
            <div className="pt-summary">
              <button type="button" className={`pt-chip acc${todos.length === 0 ? ' zero' : ''}`} onClick={() => focusPanel('todo')}>
                <b>{todos.length}</b> à planifier
              </button>
              <button type="button" className={`pt-chip red${lateCount === 0 ? ' zero' : ''}`} onClick={() => focusPanel('todo')}>
                <b>{lateCount}</b> en retard
              </button>
              <button type="button" className={`pt-chip org${follows.length === 0 ? ' zero' : ''}`} onClick={() => focusPanel('follow')}>
                <b>{follows.length}</b> suite{follows.length > 1 ? 's' : ''} à décider
              </button>
              <button type="button" className={`pt-chip red${noReports.length === 0 ? ' zero' : ''}`} onClick={() => focusPanel('norep')}>
                <b>{noReports.length}</b> sans rapport
              </button>
            </div>
          )}
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

      {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}
      {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

      {!loading && !error && total === 0 && (
        <div className="card">
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
        </div>
      )}

      {!loading && !error && total > 0 && (
        <>
          {/* ═══ Calendrier (en haut) ═══ */}
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className={`filter-pill${view === 'team' ? ' on' : ''}`}
              onClick={() => setView('team')}
              title="Techniciens en lignes, jours en colonnes : répartir le travail de l'équipe"
            >
              Équipe
            </button>
            <button
              type="button"
              className={`filter-pill${view === 'week' ? ' on' : ''}`}
              onClick={() => setView('week')}
            >
              Semaine
            </button>
            <button
              type="button"
              className={`filter-pill${view === 'day' ? ' on' : ''}`}
              onClick={() => setView('day')}
              title="Vue par technicien pour la journée"
            >
              Journée
            </button>
            <button
              type="button"
              className={`filter-pill${view === 'month' ? ' on' : ''}`}
              onClick={() => setView('month')}
            >
              Mois
            </button>
            {view === 'team' && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => setPanelVisible((v) => !v)}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {panelVisible ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                {panelVisible ? 'Masquer le panneau' : `À planifier (${todos.length})`}
              </button>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            {view === 'team' && (
              <div className={`pt-layout${panelVisible ? '' : ' full'}`}>
                <PlanningTeamView
                  interventions={interventions}
                  technicians={technicians}
                  followCounts={followCounts}
                  weekStart={weekStart}
                  onWeekChange={(d) => setWeekStart(startOfWeekMonday(d))}
                  onOpen={openEdit}
                  onSchedule={(id, row, date, start) => void handleSchedule(id, row, date, start)}
                />
                {panelVisible && (
                  <PlanningTodoPanel
                    tab={panelTab}
                    onTabChange={setPanelTab}
                    todos={todos}
                    follows={follows}
                    noReports={noReports}
                    technicians={technicians}
                    busyId={busyId}
                    onOpen={openEdit}
                    onCreateQuote={handleCreateQuote}
                    onScheduleRevisit={(f) => void handleScheduleRevisit(f)}
                  />
                )}
              </div>
            )}
            {view === 'week' && (
              <PlanningWeekGridView
                interventions={interventions}
                onClickIntervention={openEdit}
                events={events}
                onAddEvent={(date) => openEventModal(null, date)}
                onOpenEvent={(e) => openEventModal(e, e.date)}
              />
            )}
            {view === 'day' && (
              <PlanningDayView
                interventions={interventions}
                onClickIntervention={openEdit}
                events={events}
                onAddEvent={(date) => openEventModal(null, date)}
                onOpenEvent={(e) => openEventModal(e, e.date)}
              />
            )}
            {view === 'month' && (
              <PlanningMonthView
                interventions={interventions}
                onClickIntervention={openEdit}
                events={events}
                onAddEvent={(date) => openEventModal(null, date)}
                onOpenEvent={(e) => openEventModal(e, e.date)}
              />
            )}
          </div>

          {/* ═══ Liste des interventions (en bas, toujours visible) ═══ */}
          <div className="card">
            <div className="card-top">
              <span className="card-title">Toutes les interventions ({total})</span>
              <span className="text-ink-3 text-xs font-light">
                Clique sur une ligne pour modifier
              </span>
            </div>
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
                    <td>
                      <strong>{i.reference}</strong>
                      {i.auto_generated && (
                        <span
                          title="Visite récurrente générée automatiquement"
                          style={{
                            marginLeft: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '.62rem',
                            fontWeight: 700,
                            color: 'var(--acc)',
                            background: 'var(--acc-lt, #E8EEF8)',
                            border: '1px solid var(--acc)',
                            borderRadius: 999,
                            padding: '1px 6px',
                            verticalAlign: 'middle',
                            letterSpacing: '.4px',
                            textTransform: 'uppercase',
                          }}
                        >
                          Auto
                        </span>
                      )}
                      {i.recurrence_active === false && (
                        <span
                          title="Intervention ponctuelle : ne créera pas de prochaine visite à la clôture"
                          style={{
                            marginLeft: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '.62rem',
                            fontWeight: 700,
                            color: '#8A4A00',
                            background: '#FFF4E5',
                            border: '1px solid #F5C88F',
                            borderRadius: 999,
                            padding: '1px 6px',
                            verticalAlign: 'middle',
                            letterSpacing: '.4px',
                            textTransform: 'uppercase',
                          }}
                        >
                          One-shot
                        </span>
                      )}
                    </td>
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
          </div>
        </>
      )}

      <InterventionModal
        open={modalOpen}
        onClose={closeModal}
        onChanged={() => void load()}
        intervention={editing}
      />

      {/* Devis correctif pré-rempli depuis les anomalies (« Suite à décider ») */}
      {quoteSeed && (
        <QuoteModal
          open
          onClose={() => setQuoteSeed(null)}
          seed={quoteSeed}
          onSaved={() => {
            setQuoteSeed(null)
            showToast("✓ Devis créé. Programme la repasse quand le client l'accepte.")
          }}
        />
      )}

      {eventModal && profile?.organization_id && (
        <PlanningEventModal
          key={eventModal.key}
          organizationId={profile.organization_id}
          event={eventModal.event}
          defaultDate={eventModal.date}
          onClose={() => setEventModal(null)}
          onSaved={() => {
            setEventModal(null)
            void loadEvents().then(setEvents)
          }}
        />
      )}

      {toast && <div className={`pt-toast${toast.err ? ' err' : ''}`} role="status">{toast.msg}</div>}
    </>
  )
}
