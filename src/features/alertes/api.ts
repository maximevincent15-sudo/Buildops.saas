import { supabase } from '../../shared/lib/supabase'
import type { EquipmentType } from '../../shared/constants/interventions'
import { INSPECTION_FREQUENCIES_DAYS } from './frequencies'

export type RegulatoryAlert = {
  key: string // client_name + equipment_type (sert de clé React)
  clientName: string
  siteName: string | null
  equipmentType: string
  lastInterventionId: string
  lastInterventionReference: string
  lastInterventionDate: string // ISO YYYY-MM-DD
  nextDueDate: string // ISO YYYY-MM-DD
  daysUntilDue: number // négatif si dépassé
  frequencyDays: number
}

export type AlertSeverity = 'overdue' | 'urgent' | 'soon' | 'ok'

export function classifyAlert(daysUntilDue: number): AlertSeverity {
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 30) return 'urgent'
  if (daysUntilDue <= 90) return 'soon'
  return 'ok'
}

function isoDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Calcule les échéances réglementaires à partir de l'historique
 * des interventions finalisées. Pour chaque couple (client, équipement),
 * on prend l'intervention la plus récente et on calcule la prochaine
 * date de contrôle attendue selon la fréquence de l'équipement.
 */
export async function computeRegulatoryAlerts(): Promise<RegulatoryAlert[]> {
  const { data, error } = await supabase
    .from('interventions')
    .select('id, reference, client_name, site_name, equipment_type, scheduled_date, status, created_at')
    .eq('status', 'terminee')
  if (error) throw error

  const rows = (data ?? []) as Array<{
    id: string
    reference: string
    client_name: string
    site_name: string | null
    equipment_type: string
    scheduled_date: string | null
    created_at: string
  }>

  // Tri client-side descendant (scheduled_date si dispo, sinon created_at)
  rows.sort((a, b) => {
    const dateA = a.scheduled_date ?? a.created_at
    const dateB = b.scheduled_date ?? b.created_at
    return dateB.localeCompare(dateA)
  })

  // Groupe par (client, équipement), on garde la plus récente (déjà triée DESC)
  const groups = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const key = `${r.client_name}::${r.equipment_type}`
    if (!groups.has(key)) groups.set(key, r)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alerts: RegulatoryAlert[] = []
  for (const [key, r] of groups.entries()) {
    const baseDateStr = r.scheduled_date ?? r.created_at
    if (!baseDateStr) continue

    const freqDays =
      INSPECTION_FREQUENCIES_DAYS[r.equipment_type as EquipmentType] ?? 365
    const lastDate = new Date(baseDateStr)
    lastDate.setHours(0, 0, 0, 0)
    const nextDate = new Date(lastDate.getTime() + freqDays * 24 * 60 * 60 * 1000)
    const daysUntilDue = Math.floor(
      (nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    )

    alerts.push({
      key,
      clientName: r.client_name,
      siteName: r.site_name,
      equipmentType: r.equipment_type,
      lastInterventionId: r.id,
      lastInterventionReference: r.reference,
      lastInterventionDate: isoDateOnly(lastDate),
      nextDueDate: isoDateOnly(nextDate),
      daysUntilDue,
      frequencyDays: freqDays,
    })
  }

  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}
