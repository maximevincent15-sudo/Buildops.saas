import { Link2, Lock, Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { PlanningBlock } from '../blocksApi'
import { eventTimeLabel, extractLinks, sortEvents } from './eventUtils'

type Props = {
  date: string
  events: PlanningBlock[]
  onAdd: (date: string) => void
  onOpen: (e: PlanningBlock) => void
}

/** Bouton « + » d'un jour et ses événements d'agenda (en-tête des vues Équipe / Semaine). */
export function DayAddButton({ date, onAdd }: Pick<Props, 'date' | 'onAdd'>) {
  return (
    <button
      type="button"
      className="pe-add"
      onClick={(ev) => { ev.stopPropagation(); onAdd(date) }}
      title="Ajouter un événement (visio, rendez-vous, déjeuner…)"
      aria-label="Ajouter un événement"
    >
      <Plus size={13} strokeWidth={2.4} />
    </button>
  )
}

type ChipProps = {
  event: PlanningBlock
  onOpen: (e: PlanningBlock) => void
  className?: string
  style?: CSSProperties
}

/** Puce d'événement : heure, titre, 🔒 si privé, lien direct (visio…). */
export function EventChip({ event: e, onOpen, className = '', style }: ChipProps) {
  const link = extractLinks(e.notes)[0]
  return (
    <div
      className={`pe-pill ${e.color} ${className}`}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(e)}
      onKeyDown={(k) => { if (k.key === 'Enter') onOpen(e) }}
      title={[`${eventTimeLabel(e)} · ${e.label}`, e.notes].filter(Boolean).join('\n')}
    >
      <span className="pe-head">
        <span className="pe-time">{eventTimeLabel(e)}</span>
        {e.is_private && <Lock size={10} className="pe-ico" aria-label="Privé" />}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="pe-ico pe-ico-link"
            onClick={(ev) => ev.stopPropagation()}
            title="Ouvrir le lien"
          >
            <Link2 size={11} />
          </a>
        )}
      </span>
      <span className="pe-label">{e.label}</span>
    </div>
  )
}

export function DayEventList({ events, onOpen }: Pick<Props, 'events' | 'onOpen'>) {
  if (events.length === 0) return null
  return (
    <div className="pe-list">
      {sortEvents(events).map((e) => <EventChip key={e.id} event={e} onOpen={onOpen} />)}
    </div>
  )
}
