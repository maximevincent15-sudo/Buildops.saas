import { addDays, format, isToday, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  STATUS_BADGE_CLASSES,
  formatEquipmentTypesShort,
} from '../../../shared/constants/interventions'
import type { InterventionStatus } from '../../../shared/constants/interventions'
import type { Intervention } from '../schemas'

type Props = {
  interventions: Intervention[]
  onClickIntervention: (i: Intervention) => void
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function sameIsoDay(dateStr: string | null, target: Date): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  )
}

/**
 * Vue Journée : 1 colonne par technicien, interventions du jour dans chaque
 * colonne. Utilisée le matin par le gérant pour voir la journée en un coup
 * d'œil et savoir qui fait quoi.
 *
 * - Techniciens listés depuis les interventions du jour + une colonne
 *   "Non assigné" pour celles sans technician_name.
 * - Read-only : clic = ouvre le modal d'édition standard.
 */
export function PlanningDayView({ interventions, onClickIntervention }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  const dayInterventions = useMemo(
    () => interventions.filter((i) => sameIsoDay(i.scheduled_date, selectedDate)),
    [interventions, selectedDate],
  )

  // Regroupe par technicien. Les "non assigné" vont dans une colonne dédiée.
  const columnsByTech = useMemo(() => {
    const map = new Map<string, Intervention[]>()
    // Techniciens avec au moins 1 intervention aujourd'hui
    for (const i of dayInterventions) {
      const key = i.technician_name?.trim() || '__unassigned__'
      const list = map.get(key) ?? []
      list.push(i)
      map.set(key, list)
    }
    // Tri chronologique par nom (unassigned en dernier)
    const entries = Array.from(map.entries())
    entries.sort(([a], [b]) => {
      if (a === '__unassigned__') return 1
      if (b === '__unassigned__') return -1
      return a.localeCompare(b, 'fr')
    })
    return entries
  }, [dayInterventions])

  const isCurrentDay = isToday(selectedDate)
  const dayLabel = cap(format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr }))

  return (
    <div>
      {/* Barre de navigation date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <button
            type="button"
            className="btn-sm"
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
            title="Jour précédent"
            style={{ padding: '.4rem .6rem' }}
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`btn-sm${isCurrentDay ? ' acc' : ''}`}
            onClick={() => setSelectedDate(new Date())}
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            className="btn-sm"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            title="Jour suivant"
            style={{ padding: '.4rem .6rem' }}
          >
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        <div
          style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--ink, #1C2130)',
          }}
        >
          {dayLabel}
        </div>

        <div style={{ fontSize: '.8rem', color: 'var(--ink2, #5A6070)' }}>
          {dayInterventions.length === 0 && 'Aucune intervention ce jour'}
          {dayInterventions.length === 1 && '1 intervention · ' + columnsByTech.length + ' technicien(s)'}
          {dayInterventions.length > 1 &&
            `${dayInterventions.length} interventions · ${columnsByTech.length} technicien(s)`}
        </div>
      </div>

      {/* Grille de colonnes par technicien */}
      {dayInterventions.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: 'var(--wht, #F8F9FB)',
            border: '1px dashed var(--brd, #E1E5EA)',
            borderRadius: 10,
            color: 'var(--ink2, #5A6070)',
            fontSize: '.9rem',
          }}
        >
          Rien de prévu pour <strong>{dayLabel.toLowerCase()}</strong>.
          <br />
          <span style={{ fontSize: '.8rem', color: 'var(--ink3, #8A8F9A)' }}>
            Utilisez les flèches ci-dessus pour naviguer d'un jour à l'autre.
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, columnsByTech.length)}, minmax(220px, 1fr))`,
            gap: '.75rem',
            overflowX: 'auto',
            paddingBottom: '.5rem',
          }}
        >
          {columnsByTech.map(([techKey, techInterventions]) => {
            const isUnassigned = techKey === '__unassigned__'
            const techLabel = isUnassigned ? 'Non assigné' : techKey
            // Tri chronologique inter-technicien : on trie par date (ou par ref si pas d'heure)
            const sorted = [...techInterventions].sort((a, b) => {
              const da = a.scheduled_date ?? ''
              const db = b.scheduled_date ?? ''
              if (da !== db) return da.localeCompare(db)
              return a.reference.localeCompare(b.reference)
            })

            return (
              <div
                key={techKey}
                style={{
                  background: '#fff',
                  border: `1px solid ${isUnassigned ? '#F5C88F' : 'var(--brd, #E1E5EA)'}`,
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Header technicien */}
                <div
                  style={{
                    padding: '.7rem .85rem',
                    borderBottom: `1px solid ${isUnassigned ? '#F5C88F' : 'var(--brd, #E1E5EA)'}`,
                    background: isUnassigned ? '#FFF4E5' : 'var(--wht, #F8F9FB)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: '.85rem',
                      fontWeight: 700,
                      color: isUnassigned ? '#8A4A00' : 'var(--ink, #1C2130)',
                    }}
                  >
                    {techLabel}
                  </div>
                  <span
                    style={{
                      fontSize: '.7rem',
                      color: isUnassigned ? '#8A4A00' : 'var(--ink2, #5A6070)',
                      background: isUnassigned ? '#fff' : '#fff',
                      border: `1px solid ${isUnassigned ? '#F5C88F' : 'var(--brd)'}`,
                      borderRadius: 999,
                      padding: '1px 8px',
                      fontWeight: 600,
                    }}
                  >
                    {sorted.length}
                  </span>
                </div>

                {/* Liste des interventions */}
                <div style={{ padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {sorted.map((i) => {
                    const statusClass =
                      STATUS_BADGE_CLASSES[i.status as InterventionStatus] ?? 'b-gry'
                    const equipLabel = formatEquipmentTypesShort(i)
                    return (
                      <button
                        key={i.id}
                        type="button"
                        className={`week-item ${statusClass}`}
                        onClick={() => onClickIntervention(i)}
                        style={{
                          display: 'block',
                          textAlign: 'left',
                          padding: '.55rem .65rem',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="week-item-ref" style={{ fontSize: '.7rem', fontWeight: 700 }}>
                          {i.reference}
                        </div>
                        <div className="week-item-client" style={{ fontSize: '.82rem', fontWeight: 600, marginTop: 2 }}>
                          {i.client_name}
                        </div>
                        {i.site_name && (
                          <div style={{ fontSize: '.7rem', color: 'var(--ink2)', marginTop: 1 }}>
                            {i.site_name}
                          </div>
                        )}
                        <div className="week-item-meta" style={{ fontSize: '.72rem', marginTop: 3, color: 'var(--ink2)' }}>
                          {equipLabel}
                        </div>
                        {i.address && (
                          <div
                            style={{
                              fontSize: '.68rem',
                              color: 'var(--ink3)',
                              marginTop: 3,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <MapPin size={9} strokeWidth={2} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {i.address}
                            </span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
