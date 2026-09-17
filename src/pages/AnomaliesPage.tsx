import { AlertTriangle, Check, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  closeAnomaly,
  listAnomalies,
  reopenAnomaly,
  resolveAnomaly,
} from '../features/anomalies/api'
import type { AnomalyFilters } from '../features/anomalies/api'
import {
  ACTIVE_ANOMALY_STATUSES,
  ANOMALY_ACTION_LABELS,
  ANOMALY_PRIORITIES,
  ANOMALY_PRIORITY_LABELS,
  ANOMALY_STATUS_LABELS,
  computeDueBucket,
} from '../features/anomalies/schemas'
import type {
  Anomaly,
  AnomalyPriority,
  AnomalyStatus,
} from '../features/anomalies/schemas'
import { listEquipmentUnits, listSites } from '../features/equipment/api'
import type { EquipmentUnit, Site } from '../features/equipment/schemas'
import { listClients } from '../features/clients/api'
import type { Client } from '../features/clients/schemas'

type StatusFilter = 'active' | AnomalyStatus | 'all'
type PriorityFilter = 'all' | AnomalyPriority

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  active: 'Actives',
  all: 'Toutes',
  open: 'Ouvertes',
  planned: 'Planifiées',
  resolved: 'Résolues',
  closed: 'Clôturées',
}

export function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [units, setUnits] = useState<EquipmentUnit[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const filters: AnomalyFilters = {}
      if (statusFilter === 'active') filters.onlyActive = true
      else if (statusFilter !== 'all') filters.status = statusFilter
      if (siteFilter !== 'all') filters.siteId = siteFilter

      const [a, u, s, c] = await Promise.all([
        listAnomalies(filters),
        listEquipmentUnits(),
        listSites(),
        listClients(),
      ])
      setAnomalies(a)
      setUnits(u)
      setSites(s)
      setClients(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, siteFilter])

  const unitsById = useMemo(() => {
    const m = new Map<string, EquipmentUnit>()
    for (const u of units) m.set(u.id, u)
    return m
  }, [units])

  const sitesById = useMemo(() => {
    const m = new Map<string, Site>()
    for (const s of sites) m.set(s.id, s)
    return m
  }, [sites])

  const clientsById = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients) m.set(c.id, c)
    return m
  }, [clients])

  const filtered = useMemo(() => {
    let list = anomalies
    if (priorityFilter !== 'all') {
      list = list.filter((a) => a.priority === priorityFilter)
    }
    return list
  }, [anomalies, priorityFilter])

  // Compteurs de résumé
  const counts = useMemo(() => {
    const open = anomalies.filter((a) => a.status === 'open').length
    const planned = anomalies.filter((a) => a.status === 'planned').length
    const overdue = anomalies.filter(
      (a) => ACTIVE_ANOMALY_STATUSES.includes(a.status) && computeDueBucket(a.due_date) === 'overdue',
    ).length
    const highPriority = anomalies.filter(
      (a) => ACTIVE_ANOMALY_STATUSES.includes(a.status) && a.priority === 'high',
    ).length
    return { open, planned, overdue, highPriority }
  }, [anomalies])

  async function handleResolve(id: string) {
    try {
      await resolveAnomaly(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur résolution')
    }
  }

  async function handleReopen(id: string) {
    try {
      await reopenAnomaly(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réouverture')
    }
  }

  async function handleClose(id: string) {
    if (!confirm('Clôturer définitivement cette anomalie ?')) return
    try {
      await closeAnomaly(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur clôture')
    }
  }

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Anomalies</h1>
          <div className="dash-sub">
            {loading && 'Chargement…'}
            {!loading && filtered.length === 0 && 'Aucune anomalie trouvée'}
            {!loading && filtered.length === 1 && '1 anomalie'}
            {!loading && filtered.length > 1 && `${filtered.length} anomalies`}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-red text-sm" style={{ marginBottom: 12 }}>
          Erreur : {error}
        </p>
      )}

      {/* Tuiles de synthèse */}
      <div style={statsRowStyle}>
        <SummaryTile label="Ouvertes" value={counts.open} color="#B02A1E" bg="#FDECEC" />
        <SummaryTile label="Planifiées" value={counts.planned} color="#3A5CA8" bg="#E8EEF8" />
        <SummaryTile label="Prio. haute" value={counts.highPriority} color="#B02A1E" bg="#FDECEC" />
        <SummaryTile label="En retard" value={counts.overdue} color="#B02A1E" bg="#FDECEC" />
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['active', 'all', 'open', 'planned', 'resolved', 'closed'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-pill${statusFilter === s ? ' on' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select
          className="input-sm"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
        >
          <option value="all">Toutes priorités</option>
          {ANOMALY_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Priorité {ANOMALY_PRIORITY_LABELS[p].toLowerCase()}
            </option>
          ))}
        </select>
        <select
          className="input-sm"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
        >
          <option value="all">Tous sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Liste */}
      <div className="card">
        {loading && (
          <p className="text-ink-2 text-sm font-light" style={{ padding: 12 }}>
            Chargement…
          </p>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <AlertTriangle size={22} color="#B36510" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
              Aucune anomalie ne correspond à ces filtres
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 6 }}>
              Les anomalies sont créées automatiquement quand un contrôle unitaire
              se termine avec un verdict "à surveiller" ou "à réformer".
            </div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((a) => {
              const unit = a.equipment_unit_id ? unitsById.get(a.equipment_unit_id) ?? null : null
              const site = unit?.site_id ? sitesById.get(unit.site_id) ?? null : null
              const client = unit?.client_id ? clientsById.get(unit.client_id) ?? null : null
              const dueBucket = computeDueBucket(a.due_date)
              return (
                <div key={a.id} style={anomalyRowStyle}>
                  {/* Priority badge */}
                  <div style={priorityBadgeStyle(a.priority)}>
                    {a.priority === 'high' ? '🔴' : a.priority === 'normal' ? '🟠' : '🟢'}
                  </div>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                        {a.title}
                      </div>
                      <div style={statusChipStyle(a.status)}>
                        {ANOMALY_STATUS_LABELS[a.status]}
                      </div>
                      {a.action && (
                        <div style={actionChipStyle}>
                          {ANOMALY_ACTION_LABELS[a.action]}
                        </div>
                      )}
                    </div>

                    {(unit || site || client) && (
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>
                        {unit && (
                          <>
                            <strong>N°{unit.serial_number}</strong>
                            {unit.brand && ` · ${unit.brand}`}
                          </>
                        )}
                        {client && ` · ${client.name}`}
                        {site && ` — ${site.name}`}
                      </div>
                    )}

                    {a.description && (
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4, fontStyle: 'italic' }}>
                        {a.description}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                      <span>
                        Détectée le{' '}
                        {new Date(a.detected_at).toLocaleDateString('fr-FR')}
                        {a.detected_by_name ? ` par ${a.detected_by_name}` : ''}
                      </span>
                      {a.due_date && (
                        <span style={dueBadgeStyle(dueBucket)}>
                          Échéance : {new Date(a.due_date).toLocaleDateString('fr-FR')}
                          {dueBucket === 'overdue' && ' ⚠ en retard'}
                          {dueBucket === 'soon' && ' (bientôt)'}
                        </span>
                      )}
                      {a.resolved_at && (
                        <span>
                          Résolue le {new Date(a.resolved_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {a.intervention_id && (
                      <Link
                        to={`/rapports/${a.intervention_id}`}
                        className="btn-sm"
                        style={{ fontSize: 11.5 }}
                      >
                        Voir intervention
                      </Link>
                    )}
                    {ACTIVE_ANOMALY_STATUSES.includes(a.status) && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleResolve(a.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}
                      >
                        <Check size={12} strokeWidth={2.5} />
                        Résolue
                      </button>
                    )}
                    {a.status === 'resolved' && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleReopen(a.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}
                      >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        Rouvrir
                      </button>
                    )}
                    {a.status !== 'closed' && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleClose(a.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}
                        title="Clôturer définitivement (équipement retiré, faux positif...)"
                      >
                        <XCircle size={12} strokeWidth={2.5} />
                        Clôturer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sous-composants ────────────────────────────────────────

function SummaryTile({
  label, value, color, bg,
}: { label: string; value: number; color: string; bg: string }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        padding: '10px 14px',
        borderRadius: 8,
        background: bg,
        border: `1px solid ${bg}`,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 16,
  flexWrap: 'wrap',
}

const anomalyRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '12px 14px',
  borderBottom: '1px solid var(--brd, #E6E8EC)',
  alignItems: 'flex-start',
}

function priorityBadgeStyle(priority: AnomalyPriority): React.CSSProperties {
  return {
    fontSize: 14,
    lineHeight: '20px',
    flexShrink: 0,
    paddingTop: 2,
    filter: priority === 'low' ? 'grayscale(0.3)' : 'none',
  }
}

function statusChipStyle(status: AnomalyStatus): React.CSSProperties {
  const colors: Record<AnomalyStatus, { bg: string; fg: string }> = {
    open: { bg: '#FDECEC', fg: '#B02A1E' },
    planned: { bg: '#E8EEF8', fg: '#3A5CA8' },
    resolved: { bg: '#E6F4EB', fg: '#0E7A3F' },
    closed: { bg: '#EEF0F3', fg: '#5A6070' },
  }
  const c = colors[status]
  return {
    fontSize: 10.5,
    fontWeight: 700,
    color: c.fg,
    background: c.bg,
    padding: '2px 8px',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  }
}

const actionChipStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--ink2)',
  background: 'var(--wht, #F8F9FB)',
  border: '1px solid var(--brd, #E6E8EC)',
  padding: '2px 8px',
  borderRadius: 4,
}

function dueBadgeStyle(bucket: 'overdue' | 'soon' | 'ok' | null): React.CSSProperties {
  if (bucket === 'overdue') return { color: '#B02A1E', fontWeight: 600 }
  if (bucket === 'soon') return { color: '#B36510', fontWeight: 500 }
  return {}
}
