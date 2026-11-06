import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { normalizeSearch } from '../../shared/lib/search'
import type { EquipmentType } from '../../shared/constants/interventions'
import { INSPECTION_FREQUENCIES_DAYS } from '../alertes/frequencies'
import type { Intervention } from './schemas'

/**
 * Classement de la liste des interventions du planning : onglets, recherche,
 * technicien, tri par date avec un intertitre par mois. Les visites sans date
 * passent en tête, triées par échéance estimée.
 */

export type ListTab = 'todo' | 'unscheduled' | 'week' | 'late' | 'done' | 'all'

export const LIST_TABS: Array<{ key: ListTab; label: string }> = [
  { key: 'todo', label: 'À faire' },
  { key: 'unscheduled', label: 'À planifier' },
  { key: 'week', label: 'Cette semaine' },
  { key: 'late', label: 'En retard' },
  { key: 'done', label: 'Terminées' },
  { key: 'all', label: 'Toutes' },
]

const OPEN_STATUSES = new Set(['a_planifier', 'planifiee', 'en_cours', 'brouillon'])

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lundi et dimanche de la semaine en cours (AAAA-MM-JJ) */
export function currentWeek(today = new Date()): { start: string; end: string } {
  const start = new Date(today)
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: isoDay(start), end: isoDay(end) }
}

/**
 * Échéance d'une visite : sa date prévue, sinon la dernière visite terminée du
 * même site (types en commun) plus la fréquence de contrôle la plus courte.
 */
export function estimatedDue(i: Intervention, all: Intervention[]): string | null {
  if (i.scheduled_date) return i.scheduled_date.slice(0, 10)
  if (!i.site_id) return null
  const types = new Set(i.equipment_types)
  const last = all
    .filter((v) => v.id !== i.id && v.status === 'terminee' && v.site_id === i.site_id && !!v.scheduled_date
      && (types.size === 0 || v.equipment_types.some((t) => types.has(t))))
    .map((v) => v.scheduled_date!.slice(0, 10))
    .sort()
    .at(-1)
  if (!last) return null
  const days = Math.min(...(i.equipment_types.length > 0 ? i.equipment_types : ['extincteurs'])
    .map((t) => INSPECTION_FREQUENCIES_DAYS[t as EquipmentType] ?? 365))
  const due = new Date(`${last}T12:00:00`)
  due.setDate(due.getDate() + days)
  return isoDay(due)
}

export function matchesTab(i: Intervention, tab: ListTab, today: string, week: { start: string; end: string }): boolean {
  const day = i.scheduled_date?.slice(0, 10) ?? null
  switch (tab) {
    case 'todo': return OPEN_STATUSES.has(i.status)
    case 'unscheduled': return OPEN_STATUSES.has(i.status) && (i.status === 'a_planifier' || !day)
    case 'week': return !!day && day >= week.start && day <= week.end
    case 'late': return (i.status === 'planifiee' || i.status === 'en_cours') && !!day && day < today
    case 'done': return i.status === 'terminee'
    case 'all': return true
  }
}

export function matchesQuery(i: Intervention, q: string): boolean {
  if (!q) return true
  return normalizeSearch([
    i.reference, i.client_name, i.site_name ?? '', i.dossier_number ?? '', i.technician_name ?? '',
    i.chantier_city ?? '', i.address ?? '', i.chantier_address ?? '',
  ].join(' ')).includes(q)
}

export type ListGroup = { key: string; label: string; items: Intervention[] }

/**
 * Tri et regroupement : sans date d'abord (échéance la plus proche en tête),
 * puis un groupe par mois. Avec `recentFirst`, les dates les plus récentes en
 * haut (tous les onglets sauf « Cette semaine »).
 */
export function groupForList(list: Intervention[], dueById: Map<string, string | null>, recentFirst: boolean): ListGroup[] {
  const undated = list
    .filter((i) => !i.scheduled_date)
    .sort((a, b) => {
      const da = dueById.get(a.id) ?? null
      const db = dueById.get(b.id) ?? null
      if (da && db && da !== db) return da < db ? -1 : 1
      if (!!da !== !!db) return da ? -1 : 1
      return a.created_at < b.created_at ? -1 : 1
    })
  const dated = list
    .filter((i) => !!i.scheduled_date)
    .sort((a, b) => {
      const ka = `${a.scheduled_date}${a.start_time ?? ''}`
      const kb = `${b.scheduled_date}${b.start_time ?? ''}`
      return recentFirst ? kb.localeCompare(ka) : ka.localeCompare(kb)
    })
  const groups: ListGroup[] = []
  if (undated.length > 0) groups.push({ key: 'undated', label: 'À planifier (sans date)', items: undated })
  for (const i of dated) {
    const month = i.scheduled_date!.slice(0, 7)
    let g = groups.find((x) => x.key === month)
    if (!g) {
      const label = format(new Date(`${month}-01T12:00:00`), 'MMMM yyyy', { locale: fr })
      groups.push(g = { key: month, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] })
    }
    g.items.push(i)
  }
  return groups
}
