import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import type { Technician } from '../../technicians/schemas'
import type { PlanningBlock } from '../blocksApi'
import { DayAddButton, DayEventList } from '../events/DayEvents'
import type { Intervention } from '../schemas'
import {
  DAY_START_MINUTES,
  EQUIPMENT_TAGS,
  WEEK_CAPACITY_HOURS,
  addDays,
  durationMinutes,
  isNoReport,
  normalizeName,
  placeLabel,
  siteLabel,
  startMinutes,
  technicianRowKey,
  timeLabel,
  toIsoDate,
  todayIso,
} from './teamUtils'
import type { TeamRow } from './teamUtils'

type Props = {
  interventions: Intervention[]
  technicians: Technician[]
  /** Interventions terminées avec des anomalies ouvertes → « Suite à décider » (id → nb d'anomalies) */
  followCounts: Map<string, number>
  weekStart: Date
  onWeekChange: (d: Date) => void
  onOpen: (i: Intervention) => void
  /** Glisser-déposer : affecte l'intervention au technicien / jour, à partir de startMinutes */
  onSchedule: (interventionId: string, row: TeamRow, date: string, startMinutes: number) => void
  /** Événements d'agenda (optionnels : la vue Équipe est centrée sur les techniciens) */
  events?: PlanningBlock[]
  onAddEvent?: (date: string) => void
  onOpenEvent?: (e: PlanningBlock) => void
}

const DAY_FMT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
const RANGE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export function PlanningTeamView({
  interventions,
  technicians,
  followCounts,
  weekStart,
  onWeekChange,
  onOpen,
  onSchedule,
  events = [],
  onAddEvent,
  onOpenEvent,
}: Props) {
  const [sector, setSector] = useState('')
  const [showWeekend, setShowWeekend] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const today = todayIso()

  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, n) => addDays(weekStart, n)),
    [weekStart, showWeekend],
  )
  const dayIsos = days.map(toIsoDate)
  const weekEndIso = toIsoDate(addDays(weekStart, 6))
  const weekStartIso = toIsoDate(weekStart)

  const techniciansByName = useMemo(() => {
    const m = new Map<string, Technician>()
    for (const t of technicians) m.set(normalizeName(`${t.first_name} ${t.last_name}`), t)
    return m
  }, [technicians])

  // Interventions de la semaine rangées par ligne (technicien)
  const weekByRow = useMemo(() => {
    const m = new Map<string, Intervention[]>()
    for (const i of interventions) {
      if (!i.scheduled_date || i.scheduled_date < weekStartIso || i.scheduled_date > weekEndIso) continue
      if (i.status === 'brouillon') continue
      const key = technicianRowKey(i, techniciansByName)
      if (!key) continue
      m.set(key, [...(m.get(key) ?? []), i])
    }
    return m
  }, [interventions, techniciansByName, weekStartIso, weekEndIso])

  // Lignes : techniciens actifs + noms saisis librement présents cette semaine
  const rows = useMemo<TeamRow[]>(() => {
    const list: TeamRow[] = technicians
      .filter((t) => t.active)
      .map((t) => ({
        key: t.id,
        technicianId: t.id,
        name: `${t.first_name} ${t.last_name}`.trim(),
        sector: t.sector,
        email: t.email,
      }))
    const known = new Set(list.map((r) => r.key))
    for (const [key, items] of weekByRow) {
      if (known.has(key)) continue
      list.push({ key, technicianId: null, name: items[0].technician_name?.trim() || 'Technicien', sector: null, email: null })
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [technicians, weekByRow])

  const sectors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sector).filter((s): s is string => !!s))).sort((a, b) => a.localeCompare(b, 'fr')),
    [rows],
  )
  const visibleRows = sector ? rows.filter((r) => r.sector === sector) : rows

  function handleDrop(e: DragEvent<HTMLTableCellElement>, row: TeamRow, date: string) {
    e.preventDefault()
    setDropTarget(null)
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    // Empile après la dernière intervention du jour (hors celle qu'on déplace)
    const sameDay = (weekByRow.get(row.key) ?? []).filter((i) => i.scheduled_date === date && i.id !== id)
    const lastEnd = sameDay.reduce((max, i) => {
      const s = startMinutes(i)
      return s === null ? max : Math.max(max, s + durationMinutes(i))
    }, DAY_START_MINUTES)
    onSchedule(id, row, date, lastEnd)
  }

  const rangeLabel = `${RANGE_FMT.format(days[0])} – ${RANGE_FMT.format(days[days.length - 1])} ${days[0].getFullYear()}`

  return (
    <div>
      <div className="pt-toolbar">
        <div className="pt-toolbar-l">
          <button type="button" className="pt-nav" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Semaine précédente">
            <ChevronLeft size={15} />
          </button>
          <button type="button" className="btn-sm" onClick={() => onWeekChange(new Date())}>Aujourd'hui</button>
          <button type="button" className="pt-nav" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label="Semaine suivante">
            <ChevronRight size={15} />
          </button>
          <span className="pt-range">{rangeLabel}</span>
        </div>
        <div className="pt-toolbar-l">
          <label className="pt-check">
            <input type="checkbox" checked={showWeekend} onChange={(e) => setShowWeekend(e.target.checked)} /> Week-end
          </label>
          {sectors.length > 0 && (
            <select className="pt-select" value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Tous les secteurs</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="pt-legend">
        <span><i className="pt-lg plan" />Planifiée</span>
        <span><i className="pt-lg site" />En cours</span>
        <span><i className="pt-lg done" />Terminée</span>
        <span><i className="pt-lg follow" />Suite à décider</span>
        <span><i className="pt-lg norep" />Sans rapport</span>
      </div>

      {visibleRows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <p className="text-ink-2 text-sm">Aucun technicien à afficher. Ajoute tes techniciens dans RH → Techniciens.</p>
        </div>
      ) : (
        <div className="pt-grid-wrap">
          <table className="pt-grid" style={{ minWidth: 165 + days.length * 105 }}>
            <thead>
              <tr>
                <th className="pt-th-tech">Technicien</th>
                {days.map((d, n) => (
                  <th key={dayIsos[n]} className={dayIsos[n] === today ? 'today' : ''}>
                    <div className="pt-day-head">
                      <span>
                        {DAY_FMT.format(d)}
                        {dayIsos[n] === today && <span className="pt-today">aujourd'hui</span>}
                      </span>
                      {onAddEvent && <DayAddButton date={dayIsos[n]} onAdd={onAddEvent} />}
                    </div>
                    {onOpenEvent && (
                      <DayEventList events={events.filter((e) => e.date === dayIsos[n])} onOpen={onOpenEvent} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const items = weekByRow.get(row.key) ?? []
                const hours = items.reduce((s, i) => s + durationMinutes(i), 0) / 60
                const pct = Math.min(100, Math.round((hours / WEEK_CAPACITY_HOURS) * 100))
                const loadCls = pct >= 80 ? 'hi' : pct <= 40 ? 'lo' : ''
                const initials = row.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <tr key={row.key}>
                    <td className="pt-tech">
                      <div className="pt-tech-row">
                        <div className="pt-av">{initials}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="pt-name">{row.name}</div>
                          {row.sector && <div className="pt-sector">{row.sector}</div>}
                        </div>
                      </div>
                      <div className="pt-load" title={`${Math.round(hours * 10) / 10} h planifiées sur ${WEEK_CAPACITY_HOURS} h`}>
                        <div className="pt-load-bar"><div className={`pt-load-fill ${loadCls}`} style={{ width: `${pct}%` }} /></div>
                        <div className="pt-load-lbl">{Math.round(hours * 10) / 10} h / {WEEK_CAPACITY_HOURS} h cette semaine</div>
                      </div>
                    </td>
                    {dayIsos.map((date) => {
                      const cellKey = `${row.key}|${date}`
                      const cards = items
                        .filter((i) => i.scheduled_date === date)
                        .sort((a, b) => (startMinutes(a) ?? 0) - (startMinutes(b) ?? 0))
                      return (
                        <td
                          key={cellKey}
                          className={`${date === today ? 'today' : ''}${dropTarget === cellKey ? ' drop' : ''}`}
                          onDragOver={(e) => { e.preventDefault(); if (dropTarget !== cellKey) setDropTarget(cellKey) }}
                          onDragLeave={() => setDropTarget((t) => (t === cellKey ? null : t))}
                          onDrop={(e) => handleDrop(e, row, date)}
                        >
                          {cards.map((i) => (
                            <TeamCard key={i.id} i={i} today={today} followCount={followCounts.get(i.id) ?? 0} onOpen={onOpen} />
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TeamCard({ i, today, followCount, onOpen }: { i: Intervention; today: string; followCount: number; onOpen: (i: Intervention) => void }) {
  let cls = 'plan'
  let status = 'Planifiée'
  if (i.status === 'en_cours') { cls = 'site'; status = 'En cours' }
  if (i.status === 'terminee') {
    cls = followCount > 0 ? 'follow' : 'done'
    status = followCount > 0 ? `Suite à décider · ${followCount} anomalie${followCount > 1 ? 's' : ''}` : '✓ Terminée'
  } else if (isNoReport(i, today)) {
    cls = 'norep'
    status = '⚠ Sans rapport'
  }
  const movable = i.status !== 'terminee' && i.status !== 'en_cours'
  const place = placeLabel(i)
  return (
    <button
      type="button"
      className={`pt-card ${cls}`}
      draggable={movable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={() => onOpen(i)}
      title={`${i.reference} — ${i.client_name}${i.site_name ? ` · ${i.site_name}` : ''}`}
    >
      <span className="pt-card-time">{timeLabel(i)}{i.priority === 'urgente' && <span className="pt-urg">Urgent</span>}</span>
      <span className="pt-card-site">{siteLabel(i)}</span>
      <span className="pt-card-sub">{[place, i.site_name ? i.client_name : null].filter(Boolean).join(' · ') || i.reference}</span>
      {i.equipment_types.length > 0 && (
        <span className="pt-tags">
          {i.equipment_types.map((t) => (
            <span key={t} className={`pt-tag ${EQUIPMENT_TAGS[t]?.cls ?? ''}`}>{EQUIPMENT_TAGS[t]?.label ?? t}</span>
          ))}
        </span>
      )}
      <span className="pt-card-status">{status}</span>
    </button>
  )
}
