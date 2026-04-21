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
import { createBlocks, deleteBlock, listBlocksForRange } from '../blocksApi'
import type { PlanningBlock } from '../blocksApi'
import type { Intervention } from '../schemas'

type Props = {
  interventions: Intervention[]
  onClickIntervention: (i: Intervention) => void
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD en timezone locale (pas UTC pour éviter les décalages d'un jour)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type DayFormProps = {
  date: Date
  weekDays: Date[]
  organizationId: string
  onCreated: () => void
  onCancel: () => void
}

function DayForm({ date, weekDays, organizationId, onCreated, onCancel }: DayFormProps) {
  const [label, setLabel] = useState('')
  const [allWeek, setAllWeek] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    try {
      const dates = allWeek ? weekDays.map(toIsoDate) : [toIsoDate(date)]
      await createBlocks(organizationId, dates, label.trim())
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
      <label className="block-form-check">
        <input
          type="checkbox"
          checked={allWeek}
          onChange={(e) => setAllWeek(e.target.checked)}
        />
        <span>Tous les jours de cette semaine</span>
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
  const [blocks, setBlocks] = useState<PlanningBlock[]>([])
  const [formForDay, setFormForDay] = useState<string | null>(null)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const firstDay = days[0]!
  const lastDay = days[6]!
  const weekLabel = `${format(firstDay, 'd MMM', { locale: fr })} — ${format(lastDay, 'd MMM yyyy', { locale: fr })}`

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
  }, [weekStart])

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
          const dayIso = toIsoDate(day)
          const dayInterventions = interventions.filter(
            (i) => i.scheduled_date && isSameDay(new Date(i.scheduled_date), day),
          )
          const dayBlocks = blocks.filter((b) => b.date === dayIso)
          const isCurrentDay = isToday(day)
          const isFormOpen = formForDay === dayIso
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
                      <div className="week-item-meta">{equipLabel}</div>
                      {i.technician_name && (
                        <div className="week-item-meta">{i.technician_name}</div>
                      )}
                    </button>
                  )
                })}

                {dayBlocks.map((b) => (
                  <div key={b.id} className="week-block">
                    <span className="week-block-label">{b.label}</span>
                    <button
                      type="button"
                      className="week-block-remove"
                      onClick={() => void handleDeleteBlock(b)}
                      aria-label="Supprimer ce créneau"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}

                {dayInterventions.length === 0 && dayBlocks.length === 0 && !isFormOpen && (
                  <div className="week-day-empty">—</div>
                )}
              </div>

              {orgId && (
                <div className="week-day-footer">
                  {isFormOpen ? (
                    <DayForm
                      date={day}
                      weekDays={days}
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
                      Ajouter
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
