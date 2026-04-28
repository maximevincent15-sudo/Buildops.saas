import type { PlanningBlock } from './blocksApi'
import type { Intervention } from './schemas'
import { INTERVENTION_STATUSES, formatEquipmentTypes } from '../../shared/constants/interventions'
import type { InterventionStatus } from '../../shared/constants/interventions'

// Convertit une Date locale en format iCal "YYYYMMDDTHHMMSS" (floating local time)
function dtLocal(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hh}${mm}${ss}`
}

function dtUtcNow(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`
}

function dateOnly(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

// Échappe les caractères spéciaux iCal (;  ,  \  newline)
function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(':')
  return { h: parseInt(h ?? '0', 10), m: parseInt(m ?? '0', 10) }
}

function interventionToEvent(i: Intervention): string | null {
  if (!i.scheduled_date) return null

  const date = new Date(i.scheduled_date)
  if (isNaN(date.getTime())) return null

  const equipLabel = formatEquipmentTypes(i.equipment_types) === '—'
    ? (i.equipment_type ?? '')
    : formatEquipmentTypes(i.equipment_types)
  const statusLabel = INTERVENTION_STATUSES[i.status as InterventionStatus] ?? i.status

  const summary = `${i.reference} — ${i.client_name} (${equipLabel})`
  const descLines: string[] = []
  if (i.site_name) descLines.push(`Site : ${i.site_name}`)
  if (i.technician_name) descLines.push(`Technicien : ${i.technician_name}`)
  if (i.address) descLines.push(`Adresse : ${i.address}`)
  descLines.push(`Statut : ${statusLabel}`)
  if (i.notes) descLines.push(`Notes : ${i.notes}`)
  const description = descLines.join('\\n')

  // Événement journée entière (on n'a pas d'heure par intervention)
  const start = dateOnly(date)
  const end = dateOnly(new Date(date.getTime() + 24 * 60 * 60 * 1000))

  const lines = [
    'BEGIN:VEVENT',
    `UID:int-${i.id}@buildops`,
    `DTSTAMP:${dtUtcNow()}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    i.address ? `LOCATION:${escapeIcs(i.address)}` : '',
    'END:VEVENT',
  ].filter(Boolean)

  return lines.join('\r\n')
}

function blockToEvent(b: PlanningBlock): string {
  const baseDate = new Date(b.date)
  let dtstartLine: string
  let dtendLine: string

  if (b.start_time && b.end_time) {
    const { h: sh, m: sm } = parseTime(b.start_time)
    const { h: eh, m: em } = parseTime(b.end_time)
    const start = new Date(baseDate)
    start.setHours(sh, sm, 0, 0)
    const end = new Date(baseDate)
    end.setHours(eh, em, 0, 0)
    dtstartLine = `DTSTART:${dtLocal(start)}`
    dtendLine = `DTEND:${dtLocal(end)}`
  } else if (b.start_time) {
    const { h: sh, m: sm } = parseTime(b.start_time)
    const start = new Date(baseDate)
    start.setHours(sh, sm, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000) // 1h par défaut
    dtstartLine = `DTSTART:${dtLocal(start)}`
    dtendLine = `DTEND:${dtLocal(end)}`
  } else {
    const start = dateOnly(baseDate)
    const end = dateOnly(new Date(baseDate.getTime() + 24 * 60 * 60 * 1000))
    dtstartLine = `DTSTART;VALUE=DATE:${start}`
    dtendLine = `DTEND;VALUE=DATE:${end}`
  }

  const lines = [
    'BEGIN:VEVENT',
    `UID:blk-${b.id}@buildops`,
    `DTSTAMP:${dtUtcNow()}`,
    dtstartLine,
    dtendLine,
    `SUMMARY:${escapeIcs(b.label)}`,
    'END:VEVENT',
  ]
  return lines.join('\r\n')
}

export function buildIcsCalendar(
  interventions: Intervention[],
  blocks: PlanningBlock[],
  calendarName: string,
): string {
  const events = [
    ...interventions.map(interventionToEvent).filter((x): x is string => x !== null),
    ...blocks.map(blockToEvent),
  ]

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BuildOps//Planning//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

/**
 * Exporte une seule intervention en .ics.
 * Le fichier .ics téléchargé peut être ouvert direct dans Outlook, Apple Calendar,
 * Google Calendar (via "Importer") pour ajouter l'événement au calendrier perso.
 */
export function buildIcsForIntervention(intervention: Intervention): string {
  return buildIcsCalendar([intervention], [], `Intervention ${intervention.reference}`)
}

export function downloadIcs(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
