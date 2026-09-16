import { addDays, format, isToday, startOfWeek, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'
import type { Intervention } from '../schemas'

type Props = {
  interventions: Intervention[]
  onClickIntervention: (i: Intervention) => void
}

// ─── Grille horaire configurable ─────────────────────────
const START_HOUR = 6
const END_HOUR = 23 // exclusif : dernière ligne = 22:00–23:00
const HOUR_HEIGHT = 32 // px par heure

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// Parse "HH:MM" ou "HH:MM:SS" → { h, m }
function parseTime(t: string | null): { h: number; m: number } | null {
  if (!t) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!match) return null
  return { h: parseInt(match[1]!, 10), m: parseInt(match[2]!, 10) }
}

// Durée par défaut (en minutes) selon le créneau
function defaultDurationForSlot(slot: string | null): number {
  if (slot === 'morning' || slot === 'afternoon') return 240 // 4h
  if (slot === 'fullday') return 8 * 60 // 8h30 → 17h ~= 8h30
  if (slot === 'multiday') return 240 // symbolique, 4h
  return 120 // défaut 2h si aucun slot
}

// Retourne { top, height } en pixels pour une intervention avec start_time et slot
function computeSlotBox(
  startTime: string | null,
  durationMinutes: number | null,
  slot: string | null,
): { top: number; height: number } | null {
  const parsed = parseTime(startTime)
  const duration = durationMinutes ?? defaultDurationForSlot(slot)

  // Défauts par créneau si pas d'heure précise
  let sh: number
  let sm: number
  if (parsed) {
    sh = parsed.h
    sm = parsed.m
  } else if (slot === 'morning') {
    sh = 8; sm = 30
  } else if (slot === 'afternoon') {
    sh = 14; sm = 0
  } else if (slot === 'fullday') {
    sh = 8; sm = 30
  } else {
    return null // pas d'heure du tout
  }

  const startOffsetHours = sh - START_HOUR + sm / 60
  const top = startOffsetHours * HOUR_HEIGHT
  const height = (duration / 60) * HOUR_HEIGHT
  return { top, height }
}

// Classe couleur selon priorité
function priorityColorClass(priority: string, status: string): string {
  if (status === 'terminee') return 'is-done'
  if (priority === 'urgente') return 'is-urgent'
  if (priority === 'reglementaire') return 'is-warn'
  return 'is-normal'
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function PlanningWeekGridView({ interventions, onClickIntervention }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const firstDay = days[0]!
  const lastDay = days[days.length - 1]!
  const rangeLabel = `${format(firstDay, 'd MMM', { locale: fr })} — ${format(lastDay, 'd MMM yyyy', { locale: fr })}`

  // Regroupe les interventions par jour (yyyy-mm-dd)
  const byDay = useMemo(() => {
    const map = new Map<string, Intervention[]>()
    for (const i of interventions) {
      if (!i.scheduled_date) continue
      const key = i.scheduled_date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    }
    return map
  }, [interventions])

  // Interventions sans date planifiée (ni scheduled_date)
  const unscheduled = interventions.filter((i) => !i.scheduled_date)

  // Interventions du jour affiché mais sans heure ni créneau → affichées "hors grille" en haut de la colonne
  function unslottedForDay(day: Date): Intervention[] {
    const list = byDay.get(toIsoDate(day)) ?? []
    return list.filter((i) => !computeSlotBox(i.start_time, i.duration_minutes, i.slot))
  }

  function slottedForDay(day: Date): Intervention[] {
    const list = byDay.get(toIsoDate(day)) ?? []
    return list.filter((i) => computeSlotBox(i.start_time, i.duration_minutes, i.slot))
  }

  return (
    <div style={containerStyle}>
      {/* Nav */}
      <div style={navStyle}>
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => setWeekStart(subDays(weekStart, 7))}
          aria-label="Semaine précédente"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="act-btn"
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          Aujourd'hui
        </button>
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="Semaine suivante"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
        <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
          {rangeLabel}
        </span>
      </div>

      {/* En-tête jours */}
      <div style={{ ...gridStyle, marginBottom: 0, borderBottom: '1px solid var(--brd, #E1E5EA)' }}>
        <div style={hourHeaderStyle}></div>
        {days.map((day) => {
          const isCurrentDay = isToday(day)
          return (
            <div
              key={day.toISOString()}
              style={{
                ...dayHeaderStyle,
                background: isCurrentDay ? 'var(--acc-lt, #E8EEF8)' : 'var(--wht, #F8F9FB)',
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  color: isCurrentDay ? 'var(--acc, #3A5CA8)' : 'var(--ink3, #8B93A5)',
                }}
              >
                {isCurrentDay ? `${cap(format(day, 'EEE', { locale: fr }))} (auj.)` : cap(format(day, 'EEE', { locale: fr }))}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: isCurrentDay ? 'var(--acc, #3A5CA8)' : 'var(--ink, #1C2130)',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}
              >
                {format(day, 'd MMM', { locale: fr })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Grille horaire */}
      <div style={{ ...gridStyle, position: 'relative' }}>
        {/* Colonne heures */}
        <div style={{ borderRight: '1px solid var(--brd, #E1E5EA)' }}>
          {HOURS.map((h) => (
            <div
              key={h}
              style={{
                height: HOUR_HEIGHT,
                padding: '4px 8px',
                textAlign: 'right',
                fontSize: 10.5,
                color: 'var(--ink3, #8B93A5)',
                fontVariantNumeric: 'tabular-nums',
                borderBottom: '1px solid var(--brd2, #EEF0F4)',
              }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Colonnes jours */}
        {days.map((day) => {
          const slotted = slottedForDay(day)
          const unslotted = unslottedForDay(day)
          const isCurrentDay = isToday(day)
          return (
            <div
              key={day.toISOString()}
              style={{
                position: 'relative',
                borderRight: '1px solid var(--brd2, #EEF0F4)',
                background: isCurrentDay ? 'rgba(58, 92, 168, 0.02)' : undefined,
              }}
            >
              {/* Cellules horaires (fond) */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{
                    height: HOUR_HEIGHT,
                    borderBottom: '1px solid var(--brd2, #EEF0F4)',
                  }}
                />
              ))}

              {/* Interventions sans heure : bulle en haut */}
              {unslotted.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: 3,
                    right: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 1,
                  }}
                >
                  {unslotted.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onClickIntervention(i)}
                      style={{
                        ...eventStyleBase,
                        ...eventColorStyles[priorityColorClass(i.priority, i.status)],
                        position: 'relative',
                        padding: '2px 6px',
                        minHeight: 0,
                        fontSize: 10.5,
                      }}
                    >
                      <strong>{i.reference}</strong> · {i.client_name}
                    </button>
                  ))}
                </div>
              )}

              {/* Interventions positionnées à leur heure */}
              {slotted.map((i) => {
                const box = computeSlotBox(i.start_time, i.duration_minutes, i.slot)!
                const colorClass = priorityColorClass(i.priority, i.status)
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => onClickIntervention(i)}
                    style={{
                      ...eventStyleBase,
                      ...eventColorStyles[colorClass],
                      position: 'absolute',
                      top: box.top + (unslotted.length > 0 ? 22 : 3),
                      left: 3,
                      right: 3,
                      height: Math.max(box.height - 4, 32),
                      zIndex: 2,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 11.5 }}>
                      {i.reference} · {i.client_name}
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>
                      {formatEquipmentTypesShort(i)}
                      {i.technician_name ? ` · ${i.technician_name}` : ''}
                    </div>
                    {i.start_time && (
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          opacity: 0.7,
                          marginTop: 1,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {i.start_time.slice(0, 5)}
                        {i.duration_minutes ? ` · ${Math.round(i.duration_minutes / 60 * 10) / 10}h` : ''}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Interventions sans date */}
      {unscheduled.length > 0 && (
        <div style={unscheduledStyle}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: 'var(--ink3, #8B93A5)',
              marginBottom: 8,
            }}
          >
            Sans date planifiée ({unscheduled.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unscheduled.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onClickIntervention(i)}
                style={{
                  ...eventStyleBase,
                  ...eventColorStyles[priorityColorClass(i.priority, i.status)],
                  padding: '6px 10px',
                }}
              >
                <strong>{i.reference}</strong> · {i.client_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  border: '1px solid var(--brd, #E1E5EA)',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'var(--bg, #fff)',
}

const navStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 12px',
  borderBottom: '1px solid var(--brd, #E1E5EA)',
  background: 'var(--wht, #F8F9FB)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '60px repeat(7, 1fr)',
}

const dayHeaderStyle: React.CSSProperties = {
  padding: '8px 8px',
  textAlign: 'center',
  borderRight: '1px solid var(--brd2, #EEF0F4)',
}

const hourHeaderStyle: React.CSSProperties = {
  borderRight: '1px solid var(--brd, #E1E5EA)',
  background: 'var(--wht, #F8F9FB)',
}

const unscheduledStyle: React.CSSProperties = {
  padding: '12px 14px',
  background: 'var(--wht, #F8F9FB)',
  borderTop: '1px solid var(--brd, #E1E5EA)',
}

const eventStyleBase: React.CSSProperties = {
  border: 0,
  borderLeftStyle: 'solid',
  borderLeftWidth: 3,
  borderRadius: 5,
  padding: '6px 8px',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  overflow: 'hidden',
  transition: 'transform .1s, box-shadow .1s',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
}

const eventColorStyles: Record<string, React.CSSProperties> = {
  'is-normal': {
    background: 'var(--acc-lt, #E8EEF8)',
    color: 'var(--acc, #3A5CA8)',
    borderLeftColor: 'var(--acc, #3A5CA8)',
  },
  'is-warn': {
    background: '#FDF3E0',
    color: '#B36510',
    borderLeftColor: '#B36510',
  },
  'is-urgent': {
    background: '#FDECEC',
    color: '#B02A1E',
    borderLeftColor: '#B02A1E',
  },
  'is-done': {
    background: '#E6F4EB',
    color: '#0E7A3F',
    borderLeftColor: '#0E7A3F',
  },
}
