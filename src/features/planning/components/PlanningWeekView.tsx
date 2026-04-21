import { addDays, format, isSameDay, isToday, startOfWeek, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../auth/store'
import {
  EQUIPMENT_TYPES,
  STATUS_BADGE_CLASSES,
} from '../../../shared/constants/interventions'
import type {
  EquipmentType,
  InterventionStatus,
} from '../../../shared/constants/interventions'
import { createBlocks, deleteBlock, formatBlockTime, listBlocksForRange } from '../blocksApi'
import type { PlanningBlock } from '../blocksApi'
import type { Intervention } from '../schemas'

// Créneaux horaires par pas de 30 min, de 7h à 22h
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const options: { value: string; label: string }[] = []
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      options.push({ value: `${hh}:${mm}`, label: `${h}h${mm}` })
    }
  }
  return options
})()

type Range = 'week' | 'twoweeks' | 'month'

const RANGE_DAYS: Record<Range, number> = {
  week: 7,
  twoweeks: 14,
  month: 28,
}

const RANGE_LABELS: Record<Range, string> = {
  week: '1 semaine',
  twoweeks: '2 semaines',
  month: '1 mois',
}

type Props = {
  interventions: Intervention[]
  onClickIntervention: (i: Intervention) => void
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type DayFormProps = {
  date: Date
  visibleDays: Date[]
  organizationId: string
  onCreated: () => void
  onCancel: () => void
}

function DayForm({ date, visibleDays, organizationId, onCreated, onCancel }: DayFormProps) {
  const [label, setLabel] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [allVisible, setAllVisible] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    try {
      const dates = allVisible ? visibleDays.map(toIsoDate) : [toIsoDate(date)]
      await createBlocks(organizationId, dates, {
        label: label.trim(),
        startTime: startTime || null,
        endTime: endTime || null,
      })
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="block-form" onSubmit={(e) => void handleSubmit(e)}>
      <input
        type="text"
        autoFocus
        placeholder="Ex: Déjeuner, réunion..."
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={60}
      />
      <div className="block-form-times">
        <select
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          aria-label="Heure de début"
        >
          <option value="">Début —</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <span>→</span>
        <select
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          aria-label="Heure de fin"
        >
          <option value="">Fin —</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <label className="block-form-check">
        <input
          type="checkbox"
          checked={allVisible}
          onChange={(e) => setAllVisible(e.target.checked)}
        />
        <span>Tous les jours affichés</span>
      </label>
      <div className="block-form-actions">
        <button type="button" onClick={onCancel} disabled={saving} className="block-form-btn subtle">
          Annuler
        </button>
        <button type="submit" disabled={saving || !label.trim()} className="block-form-btn">
          {saving ? '…' : 'Ajouter'}
        </button>
      </div>
    </form>
  )
}

export function PlanningWeekView({ interventions, onClickIntervention }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const orgId = profile?.organization_id

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [range, setRange] = useState<Range>('week')
  const [blocks, setBlocks] = useState<PlanningBlock[]>([])
  const [formForDay, setFormForDay] = useState<string | null>(null)

  const days = Array.from({ length: RANGE_DAYS[range] }, (_, i) => addDays(weekStart, i))
  const firstDay = days[0]!
  const lastDay = days[days.length - 1]!
  const rangeLabel = `${format(firstDay, 'd MMM', { locale: fr })} — ${format(lastDay, 'd MMM yyyy', { locale: fr })}`

  async function loadBlocks() {
    try {
      const data = await listBlocksForRange(toIsoDate(firstDay), toIsoDate(lastDay))
      setBlocks(data)
    } catch (err) {
      console.error('Erreur chargement blocks', err)
    }
  }

  useEffect(() => {
    void loadBlocks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, range])

  async function handleDeleteBlock(b: PlanningBlock) {
    if (!window.confirm(`Supprimer "${b.label}" ?`)) return
    try {
      await deleteBlock(b.id)
      void loadBlocks()
    } catch (err) {
      console.error('Erreur suppression block', err)
    }
  }

  const withoutDate = interventions.filter((i) => !i.scheduled_date)
  const stepDays = RANGE_DAYS[range]

  return (
    <div className="week-view">
      <div className="week-nav">
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => setWeekStart(subDays(weekStart, stepDays))}
          aria-label="Période précédente"
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
          onClick={() => setWeekStart(addDays(weekStart, stepDays))}
          aria-label="Période suivante"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>

        <div className="range-selector">
          {(['week', 'twoweeks', 'month'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`range-btn${range === r ? ' on' : ''}`}
              onClick={() => setRange(r)}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        <span className="week-label">{rangeLabel}</span>
      </div>

      <div className={`week-grid range-${range}`}>
        {days.map((day) => {
          const dayIso = toIsoDate(day)
          const dayInterventions = interventions.filter(
            (i) => i.scheduled_date && isSameDay(new Date(i.scheduled_date), day),
          )
          const dayBlocks = blocks.filter((b) => b.date === dayIso)
          const isCurrentDay = isToday(day)
          const isFormOpen = formForDay === dayIso
          const isCompact = range === 'month'

          return (
            <div
              key={day.toISOString()}
              className={`week-day${isCurrentDay ? ' today' : ''}${isCompact ? ' compact' : ''}`}
            >
              <div className="week-day-header">
                <div className="week-day-name">
                  {cap(format(day, isCompact ? 'EEE' : 'EEEE', { locale: fr }))}
                </div>
                <div className="week-day-date">
                  {format(day, 'd MMM', { locale: fr })}
                </div>
              </div>
              <div className="week-day-items">
                {dayInterventions.map((i) => {
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
                      {!isCompact && (
                        <>
                          <div className="week-item-meta">{equipLabel}</div>
                          {i.technician_name && (
                            <div className="week-item-meta">{i.technician_name}</div>
                          )}
                        </>
                      )}
                    </button>
                  )
                })}

                {dayBlocks.map((b) => {
                  const timeLabel = formatBlockTime(b.start_time, b.end_time)
                  return (
                    <div key={b.id} className="week-block">
                      <div className="week-block-main">
                        {timeLabel && <span className="week-block-time">{timeLabel}</span>}
                        <span className="week-block-label">{b.label}</span>
                      </div>
                      <button
                        type="button"
                        className="week-block-remove"
                        onClick={() => void handleDeleteBlock(b)}
                        aria-label="Supprimer ce créneau"
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                  )
                })}

                {dayInterventions.length === 0 && dayBlocks.length === 0 && !isFormOpen && (
                  <div className="week-day-empty">—</div>
                )}
              </div>

              {orgId && (
                <div className="week-day-footer">
                  {isFormOpen ? (
                    <DayForm
                      date={day}
                      visibleDays={days}
                      organizationId={orgId}
                      onCreated={() => {
                        setFormForDay(null)
                        void loadBlocks()
                      }}
                      onCancel={() => setFormForDay(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="week-day-add"
                      onClick={() => setFormForDay(dayIso)}
                    >
                      <Plus size={12} strokeWidth={2.2} />
                      {isCompact ? '' : 'Ajouter'}
                    </button>
                  )}
                </div>
              )}
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
