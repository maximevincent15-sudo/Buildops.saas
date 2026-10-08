import type { Technician } from '../../technicians/schemas'
import type { Intervention } from '../schemas'

/**
 * Logique du planning « Équipe » : dates de la semaine, horaires, statuts
 * opérationnels (à planifier, en retard, sans rapport) et charge par technicien.
 */

// ─── Dates (chaînes YYYY-MM-DD en heure locale) ─────────────────────────

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfWeekMonday(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (r.getDay() + 6) % 7 // lundi = 0
  r.setDate(r.getDate() - dow)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

// ─── Horaires ───────────────────────────────────────────────────────────

/** "HH:MM" ou "HH:MM:SS" → minutes depuis minuit. */
export function parseTime(t: string | null | undefined): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const SLOT_MINUTES: Record<string, number> = { morning: 240, afternoon: 240, fullday: 480, multiday: 480 }
const SLOT_START: Record<string, number> = { morning: 8 * 60, afternoon: 13 * 60 + 30, fullday: 8 * 60, multiday: 8 * 60 }
const SLOT_LABELS: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', fullday: 'Journée', multiday: 'Plusieurs jours' }

export const DEFAULT_DURATION_MINUTES = 120
export const DAY_START_MINUTES = 8 * 60
export const WEEK_CAPACITY_HOURS = 35

export function durationMinutes(i: Intervention): number {
  return i.duration_minutes ?? (i.slot ? SLOT_MINUTES[i.slot] : undefined) ?? DEFAULT_DURATION_MINUTES
}

/** Début effectif (pour trier / empiler) : heure saisie, sinon début du créneau. */
export function startMinutes(i: Intervention): number | null {
  return parseTime(i.start_time) ?? (i.slot ? SLOT_START[i.slot] : null)
}

export function timeLabel(i: Intervention): string {
  const start = parseTime(i.start_time)
  if (start !== null) return `${formatTime(start)} – ${formatTime(start + durationMinutes(i))}`
  if (i.slot) return SLOT_LABELS[i.slot] ?? 'Horaire libre'
  return 'Horaire libre'
}

// ─── Techniciens ────────────────────────────────────────────────────────

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isAssigned(i: Intervention): boolean {
  return !!(i.technician_id || i.technician_name?.trim())
}

/** Ligne du planning : un technicien de la fiche, ou un nom saisi librement (ancien). */
export type TeamRow = {
  key: string
  technicianId: string | null
  name: string
  sector: string | null
  email: string | null
}

export function technicianRowKey(i: Intervention, techniciansByName: Map<string, Technician>): string | null {
  if (i.technician_id) return i.technician_id
  const name = i.technician_name?.trim()
  if (!name) return null
  return techniciansByName.get(normalizeName(name))?.id ?? `name:${normalizeName(name)}`
}

// ─── Statuts opérationnels ──────────────────────────────────────────────

/** Horizon au-delà duquel une visite préventive non assignée n'est pas encore « à planifier ». */
const TODO_HORIZON_DAYS = 45

export type TodoItem = {
  intervention: Intervention
  /** Échéance : date prévue (visite générée par le contrat) ou null */
  due: string | null
  late: boolean
  urgent: boolean
}

/**
 * À planifier = sans date (« À planifier ») OU planifiée sans technicien
 * (visite préventive générée automatiquement) dont l'échéance approche.
 */
export function toTodoItem(i: Intervention, today: string): TodoItem | null {
  if (i.status === 'terminee' || i.status === 'brouillon' || i.status === 'en_cours') return null
  const horizon = toIsoDate(addDays(new Date(today), TODO_HORIZON_DAYS))
  const isTodo =
    i.status === 'a_planifier' ||
    (i.status === 'planifiee' && !isAssigned(i) && !!i.scheduled_date && i.scheduled_date <= horizon)
  if (!isTodo) return null
  const due = i.scheduled_date
  return { intervention: i, due, late: !!due && due < today, urgent: i.priority === 'urgente' }
}

export function sortTodos(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.late !== b.late) return a.late ? -1 : 1
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
    if (!!a.due !== !!b.due) return a.due ? -1 : 1
    return a.intervention.created_at < b.intervention.created_at ? -1 : 1
  })
}

/** Sans rapport = date passée, technicien affecté, mais pas encore terminée. */
export function isNoReport(i: Intervention, today: string): boolean {
  return (
    (i.status === 'planifiee' || i.status === 'en_cours') &&
    isAssigned(i) &&
    !!i.scheduled_date &&
    i.scheduled_date < today
  )
}

// ─── Affichage ──────────────────────────────────────────────────────────

export const EQUIPMENT_TAGS: Record<string, { label: string; cls: string }> = {
  extincteurs: { label: 'EXT', cls: 'ext' },
  ria: { label: 'RIA', cls: 'ria' },
  desenfumage: { label: 'DÉSENF', cls: 'desenf' },
  ssi: { label: 'SSI', cls: 'ssi' },
  extinction_auto: { label: 'EXT. AUTO', cls: 'auto' },
}

export function siteLabel(i: Intervention): string {
  return i.site_name?.trim() || i.client_name
}

export type City = { name: string; postalCode: string | null }

/**
 * Ville de l'intervention : celle du chantier si renseignée, sinon lue dans
 * l'adresse (« 45 avenue de la République, 95000 Cergy »).
 */
export function cityOf(i: Intervention): City | null {
  const chantier = i.chantier_city?.trim()
  if (chantier) return { name: chantier, postalCode: i.chantier_postal_code?.trim() || null }
  const m = /\b(\d{5})\s+([^,\d][^,]*?)\s*$/.exec(i.address?.trim() ?? '')
  if (!m) return null
  const name = m[2].replace(/\s+cedex(\s*\d+)?$/i, '').trim()
  return name ? { name, postalCode: m[1] } : null
}

export function placeLabel(i: Intervention): string | null {
  return cityOf(i)?.name ?? null
}

/** Clé de regroupement : même ville quelle que soit la casse ou les accents */
export function cityKey(c: City): string {
  return c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s-]+/g, ' ').trim()
}

export function formatDueShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
