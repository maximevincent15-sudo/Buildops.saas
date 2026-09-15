import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'
import type { Intervention } from '../schemas'

type Props = {
  interventions: Intervention[]
  onClickIntervention: (i: Intervention) => void
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function priorityColor(priority: string, status: string): { bg: string; fg: string; bar: string } {
  if (status === 'terminee') return { bg: '#E6F4EB', fg: '#0E7A3F', bar: '#0E7A3F' }
  if (priority === 'urgente') return { bg: '#FDECEC', fg: '#B02A1E', bar: '#B02A1E' }
  if (priority === 'reglementaire') return { bg: '#FDF3E0', fg: '#B36510', bar: '#B36510' }
  return { bg: 'var(--acc-lt, #E8EEF8)', fg: 'var(--acc, #3A5CA8)', bar: 'var(--acc, #3A5CA8)' }
}

export function PlanningMonthView({ interventions, onClickIntervention }: Props) {
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()))

  const days = useMemo(() => {
    const first = startOfWeek(monthStart, { weekStartsOn: 1 })
    const last = endOfMonth(monthStart)
    const cells: Date[] = []
    let d = first
    while (d <= last || cells.length % 7 !== 0) {
      cells.push(d)
      d = addDays(d, 1)
    }
    // Toujours 6 lignes = 42 cellules pour un rendu constant
    while (cells.length < 42) {
      cells.push(d)
      d = addDays(d, 1)
    }
    return cells
  }, [monthStart])

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

  const monthLabel = cap(format(monthStart, 'MMMM yyyy', { locale: fr }))
  const weekDayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div style={containerStyle}>
      <div style={navStyle}>
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => setMonthStart(subMonths(monthStart, 1))}
          aria-label="Mois précédent"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="act-btn"
          onClick={() => setMonthStart(startOfMonth(new Date()))}
        >
          Ce mois
        </button>
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => setMonthStart(addMonths(monthStart, 1))}
          aria-label="Mois suivant"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
        <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
          {monthLabel}
        </span>
      </div>

      <div style={weekHeaderStyle}>
        {weekDayLabels.map((d) => (
          <div key={d} style={weekHeaderCellStyle}>
            {d}
          </div>
        ))}
      </div>

      <div style={gridStyle}>
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const dayInterventions = byDay.get(dayKey) ?? []
          const inMonth = isSameMonth(day, monthStart)
          const isCurrentDay = isToday(day)
          return (
            <div
              key={day.toISOString()}
              style={{
                ...cellStyle,
                background: isCurrentDay
                  ? 'var(--acc-lt, #E8EEF8)'
                  : inMonth
                    ? 'var(--bg, #fff)'
                    : 'var(--wht, #F8F9FB)',
                color: inMonth ? 'var(--ink, #1C2130)' : 'var(--ink3, #8B93A5)',
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: isCurrentDay ? 800 : 600,
                  color: isCurrentDay
                    ? 'var(--acc, #3A5CA8)'
                    : inMonth
                      ? 'var(--ink, #1C2130)'
                      : 'var(--ink3, #8B93A5)',
                  marginBottom: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {format(day, 'd')}
                {isSameDay(day, new Date()) && (
                  <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>· auj.</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayInterventions.slice(0, 3).map((i) => {
                  const c = priorityColor(i.priority, i.status)
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onClickIntervention(i)}
                      style={{
                        border: 0,
                        borderLeft: `3px solid ${c.bar}`,
                        background: c.bg,
                        color: c.fg,
                        padding: '3px 6px',
                        borderRadius: 4,
                        fontFamily: 'inherit',
                        fontSize: 10.5,
                        textAlign: 'left',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                      title={`${i.reference} · ${i.client_name} · ${formatEquipmentTypesShort(i)}`}
                    >
                      {i.reference} · {i.client_name}
                    </button>
                  )
                })}
                {dayInterventions.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontStyle: 'italic', paddingLeft: 3 }}>
                    + {dayInterventions.length - 3} autres
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

const weekHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  borderBottom: '1px solid var(--brd, #E1E5EA)',
  background: 'var(--wht, #F8F9FB)',
}

const weekHeaderCellStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'center',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--ink3, #8B93A5)',
  borderRight: '1px solid var(--brd2, #EEF0F4)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gridAutoRows: 'minmax(88px, 1fr)',
}

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRight: '1px solid var(--brd2, #EEF0F4)',
  borderBottom: '1px solid var(--brd2, #EEF0F4)',
  overflow: 'hidden',
  minHeight: 88,
}
