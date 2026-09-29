import { Link2, Lock, Plus } from 'lucide-react'
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

export function DayEventList({ events, onOpen }: Pick<Props, 'events' | 'onOpen'>) {
  if (events.length === 0) return null
  return (
    <div className="pe-list">
      {sortEvents(events).map((e) => {
        const link = extractLinks(e.notes)[0]
        return (
          <div
            key={e.id}
            className={`pe-pill ${e.color}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(e)}
            onKeyDown={(k) => { if (k.key === 'Enter') onOpen(e) }}
            title={[e.label, e.notes].filter(Boolean).join('\n')}
          >
            <span className="pe-time">{eventTimeLabel(e)}</span>
            <span className="pe-label">{e.label}</span>
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
          </div>
        )
      })}
    </div>
  )
}
