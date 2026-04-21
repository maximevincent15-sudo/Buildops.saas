import { addDays, format, isSameDay, isToday, startOfWeek, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import {
  EQUIPMENT_TYPES,
  STATUS_BADGE_CLASSES,
} from '../../../shared/constants/interventions'
import type {
  EquipmentType,
  InterventionStatus,
} from '../../../shared/constants/interventions'
import type { Intervention } from '../schemas'

type Props = {
  interventions: Intervention[]
  onClickIntervention: (i: Intervention) => void
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function PlanningWeekView({ interventions, onClickIntervention }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const firstDay = days[0]!
  const lastDay = days[6]!
  const weekLabel = `${format(firstDay, 'd MMM', { locale: fr })} — ${format(lastDay, 'd MMM yyyy', { locale: fr })}`

  const withoutDate = interventions.filter((i) => !i.scheduled_date)

  return (
    <div className="week-view">
      <div className="week-nav">
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
          Cette semaine
        </button>
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="Semaine suivante"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
        <span className="week-label">{weekLabel}</span>
      </div>

      <div className="week-grid">
        {days.map((day) => {
          const dayInterventions = interventions.filter(
            (i) => i.scheduled_date && isSameDay(new Date(i.scheduled_date), day),
          )
          const isCurrentDay = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className={`week-day${isCurrentDay ? ' today' : ''}`}
            >
              <div className="week-day-header">
                <div className="week-day-name">
                  {cap(format(day, 'EEEE', { locale: fr }))}
                </div>
                <div className="week-day-date">
                  {format(day, 'd MMM', { locale: fr })}
                </div>
              </div>
              <div className="week-day-items">
                {dayInterventions.length === 0 ? (
                  <div className="week-day-empty">—</div>
                ) : (
                  dayInterventions.map((i) => {
                    const statusClass =
                      STATUS_BADGE_CLASSES[i.status as InterventionStatus] ?? 'b-gry'
                    const equipLabel =
                      EQUIPMENT_TYPES[i.equipment_type as EquipmentType] ?? i.equipment_type
                    return (
                      <button
                        key={i.id}
                        type="button"
                        className={`week-item ${statusClass}`}
                        onClick={() => onClickIntervention(i)}
                      >
                        <div className="week-item-ref">{i.reference}</div>
                        <div className="week-item-client">{i.client_name}</div>
                        <div className="week-item-meta">{equipLabel}</div>
                        {i.technician_name && (
                          <div className="week-item-meta">{i.technician_name}</div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {withoutDate.length > 0 && (
        <div className="week-unscheduled">
          <div className="week-unscheduled-title">
            Sans date planifiée ({withoutDate.length})
          </div>
          <div className="week-unscheduled-items">
            {withoutDate.map((i) => {
              const statusClass =
                STATUS_BADGE_CLASSES[i.status as InterventionStatus] ?? 'b-gry'
              const equipLabel =
                EQUIPMENT_TYPES[i.equipment_type as EquipmentType] ?? i.equipment_type
              return (
                <button
                  key={i.id}
                  type="button"
                  className={`week-item ${statusClass}`}
                  onClick={() => onClickIntervention(i)}
                >
                  <div className="week-item-ref">{i.reference}</div>
                  <div className="week-item-client">{i.client_name}</div>
                  <div className="week-item-meta">{equipLabel}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
