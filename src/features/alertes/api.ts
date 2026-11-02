import { supabase } from '../../shared/lib/supabase'
import type { EquipmentType } from '../../shared/constants/interventions'
import { familiesForTypes } from '../equipment/identification'
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
  /** Équipements de ce type marqués non vérifiés lors de la dernière intervention */
  uncheckedCount: number
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

type NotVerifiedUnit = { family: string; lastCheckDate: string | null }

/**
 * Équipements marqués « non vérifiés » dans ces interventions (par intervention),
 * avec la date de leur dernier vrai contrôle.
 */
async function listNotVerifiedUnits(interventionIds: string[]): Promise<Map<string, NotVerifiedUnit[]>> {
  const out = new Map<string, NotVerifiedUnit[]>()
  type CheckRow = {
    intervention_id: string
    equipment_units: { family: string; last_check_date: string | null; status: string } | null
  }
  for (let i = 0; i < interventionIds.length; i += 100) {
    const ids = interventionIds.slice(i, i + 100)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('equipment_checks')
        .select('intervention_id, equipment_units(family, last_check_date, status)')
        .eq('verdict', 'non_verifie')
        .in('intervention_id', ids)
        .order('id', { ascending: true })
        .range(from, from + 999)
      if (error) throw error
      const rows = (data ?? []) as unknown as CheckRow[]
      for (const r of rows) {
        const u = r.equipment_units
        if (!u || u.status === 'removed') continue
        const list = out.get(r.intervention_id) ?? []
        list.push({ family: u.family, lastCheckDate: u.last_check_date })
        out.set(r.intervention_id, list)
      }
      if (rows.length < 1000) break
    }
  }
  return out
}

/**
 * Calcule les échéances réglementaires à partir de l'historique
 * des interventions finalisées. Pour chaque couple (client, équipement),
 * on prend l'intervention la plus récente et on calcule la prochaine
 * date de contrôle attendue selon la fréquence de l'équipement.
 *
 * Équipements marqués « non vérifiés » lors de cette intervention : leur
 * échéance n'avance pas. Elle part de leur dernier vrai contrôle, ou de la
 * date de la visite s'ils n'ont jamais été contrôlés (contrôle à reprendre).
 */
export async function computeRegulatoryAlerts(): Promise<RegulatoryAlert[]> {
  // Tente avec equipment_types (migration 015). Fallback si absent.
  let { data, error } = await supabase
    .from('interventions')
    .select('id, reference, client_name, site_name, equipment_type, equipment_types, scheduled_date, status, created_at')
    .eq('status', 'terminee')

  if (error && /equipment_types/i.test(error.message)) {
    const fallback = await supabase
      .from('interventions')
      .select('id, reference, client_name, site_name, equipment_type, scheduled_date, status, created_at')
      .eq('status', 'terminee')
    data = (fallback.data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      equipment_types: null,
    })) as typeof data
    error = fallback.error
  }

  if (error) throw error

  type Row = {
    id: string
    reference: string
    client_name: string
    site_name: string | null
    equipment_type: string | null
    equipment_types: string[] | null
    scheduled_date: string | null
    created_at: string
  }
  const rows = (data ?? []) as Row[]

  // Tri client-side descendant (scheduled_date si dispo, sinon created_at)
  rows.sort((a, b) => {
    const dateA = a.scheduled_date ?? a.created_at
    const dateB = b.scheduled_date ?? b.created_at
    return dateB.localeCompare(dateA)
  })

  // Explose chaque intervention en une entrée par type d'équipement,
  // puis regroupe par (client, équipement) en gardant la plus récente.
  type Flat = Row & { equipmentCode: string }
  const flats: Flat[] = []
  for (const r of rows) {
    const types =
      r.equipment_types && r.equipment_types.length > 0
        ? r.equipment_types
        : r.equipment_type
          ? [r.equipment_type]
          : []
    for (const t of types) {
      flats.push({ ...r, equipmentCode: t })
    }
  }

  // Groupe par (client, site, équipement)
  const groups = new Map<string, Flat>()
  for (const r of flats) {
    const key = `${r.client_name}::${r.site_name ?? ''}::${r.equipmentCode}`
    if (!groups.has(key)) groups.set(key, r)
  }

  const notVerified = await listNotVerifiedUnits(
    Array.from(new Set(Array.from(groups.values(), (r) => r.id))),
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const DAY = 24 * 60 * 60 * 1000

  const alerts: RegulatoryAlert[] = []
  for (const [key, r] of groups.entries()) {
    const baseDateStr = r.scheduled_date ?? r.created_at
    if (!baseDateStr) continue

    const freqDays =
      INSPECTION_FREQUENCIES_DAYS[r.equipmentCode as EquipmentType] ?? 365
    const lastDate = new Date(baseDateStr)
    lastDate.setHours(0, 0, 0, 0)
    let nextDate = new Date(lastDate.getTime() + freqDays * DAY)

    // Non vérifiés de ce type : l'échéance la plus proche l'emporte
    const families = new Set<string>(familiesForTypes([r.equipmentCode]))
    const unchecked = (notVerified.get(r.id) ?? []).filter((u) => families.has(u.family))
    for (const u of unchecked) {
      // Jamais contrôlé : dû dès la visite (aujourd'hui si elle a été faite en avance)
      let due = lastDate < today ? lastDate : today
      if (u.lastCheckDate) {
        const last = new Date(u.lastCheckDate)
        last.setHours(0, 0, 0, 0)
        due = new Date(last.getTime() + freqDays * DAY)
      }
      if (due < nextDate) nextDate = due
    }

    const daysUntilDue = Math.floor(
      (nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    )

    alerts.push({
      key,
      clientName: r.client_name,
      siteName: r.site_name,
      equipmentType: r.equipmentCode,
      lastInterventionId: r.id,
      lastInterventionReference: r.reference,
      lastInterventionDate: isoDateOnly(lastDate),
      nextDueDate: isoDateOnly(nextDate),
      daysUntilDue,
      frequencyDays: freqDays,
      uncheckedCount: unchecked.length,
    })
  }

  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}
