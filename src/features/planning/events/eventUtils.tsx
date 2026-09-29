import type { ReactNode } from 'react'
import type { PlanningBlock, PlanningBlockColor } from '../blocksApi'

export const EVENT_COLORS: Array<{ value: PlanningBlockColor; label: string }> = [
  { value: 'acc', label: 'Bleu' },
  { value: 'grn', label: 'Vert' },
  { value: 'org', label: 'Orange' },
  { value: 'red', label: 'Rouge' },
  { value: 'neutral', label: 'Gris' },
]

const URL_RE = /(https?:\/\/[^\s<>"']+)/g

/** Liens contenus dans une note (visio, documents…). */
export function extractLinks(text: string | null | undefined): string[] {
  return text ? Array.from(text.matchAll(URL_RE), (m) => m[1].replace(/[.,;:!?)]+$/, '')) : []
}

/** Rend une note avec ses liens cliquables (sans HTML brut). */
export function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, n) =>
    n % 2 === 1 ? (
      <a key={n} href={part} target="_blank" rel="noopener noreferrer" className="pe-link">{part}</a>
    ) : (
      part
    ),
  )
}

/** "HH:MM:SS" → "09:00" */
export function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

export function eventTimeLabel(e: PlanningBlock): string {
  const s = shortTime(e.start_time)
  const end = shortTime(e.end_time)
  if (!s) return 'Journée'
  return end ? `${s}–${end}` : s
}

export function sortEvents(list: PlanningBlock[]): PlanningBlock[] {
  return [...list].sort((a, b) => (a.start_time ?? '00').localeCompare(b.start_time ?? '00'))
}
