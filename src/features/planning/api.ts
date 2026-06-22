import { supabase } from '../../shared/lib/supabase'
import { INSPECTION_FREQUENCIES_DAYS } from '../alertes/frequencies'
import type { EquipmentType } from '../../shared/constants/interventions'
import { normalizeIntervention } from './schemas'
import type { CreateInterventionInput, Intervention } from './schemas'

function toDbPayload(input: CreateInterventionInput) {
  // equipment_type (legacy) = premier du tableau pour compat arrière
  const firstEquipment = input.equipment_types[0] ?? null
  return {
    client_name: input.client_name,
    client_id: input.client_id || null,
    site_name: input.site_name || null,
    address: input.address || null,
    equipment_type: firstEquipment,
    equipment_types: input.equipment_types,
    technician_name: input.technician_name || null,
    technician_id: input.technician_id || null,
    scheduled_date: input.scheduled_date || null,
    priority: input.priority,
    notes: input.notes || null,
  }
}

export async function createIntervention(
  input: CreateInterventionInput,
  organizationId: string,
): Promise<Intervention> {
  const { data, error } = await supabase
    .from('interventions')
    .insert({
      organization_id: organizationId,
      ...toDbPayload(input),
      status: input.scheduled_date ? 'planifiee' : 'a_planifier',
    })
    .select()
    .single()
  if (error) throw error
  return normalizeIntervention(data as Intervention)
}

export async function listInterventions(): Promise<Intervention[]> {
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Intervention[]).map(normalizeIntervention)
}

export async function listRecentInterventions(limit = 5): Promise<Intervention[]> {
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Intervention[]).map(normalizeIntervention)
}

export async function updateIntervention(
  id: string,
  input: CreateInterventionInput,
): Promise<Intervention> {
  // Récupère l'état actuel pour transition de statut automatique selon la date
  const { data: current, error: fetchErr } = await supabase
    .from('interventions')
    .select('status, scheduled_date')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr

  const payload = toDbPayload(input) as Record<string, unknown>

  // Transition automatique du statut selon présence/absence de date prévue :
  //  - "a_planifier" + ajout d'une date → "planifiee"
  //  - "planifiee" + retrait de la date → "a_planifier"
  //  - "en_cours" ou "terminee" → on ne touche jamais (workflow métier)
  const hadDate = !!(current as { scheduled_date: string | null }).scheduled_date
  const hasDate = !!input.scheduled_date
  const currentStatus = (current as { status: string }).status

  if (!hadDate && hasDate && currentStatus === 'a_planifier') {
    payload.status = 'planifiee'
  } else if (hadDate && !hasDate && currentStatus === 'planifiee') {
    payload.status = 'a_planifier'
  }

  const { data, error } = await supabase
    .from('interventions')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return normalizeIntervention(data as Intervention)
}

export async function deleteIntervention(id: string): Promise<void> {
  const { error } = await supabase
    .from('interventions')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function setInterventionStatus(id: string, status: string): Promise<Intervention> {
  const { data, error } = await supabase
    .from('interventions')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return normalizeIntervention(data as Intervention)
}

export async function countInterventionsThisMonth(): Promise<number> {
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('interventions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', firstOfMonth.toISOString())
  if (error) throw error
  return count ?? 0
}

export type InterventionStats = {
  thisMonth: number
  aPlanifier: number
  enCours: number
  termineeThisMonth: number
}

export async function getInterventionStats(): Promise<InterventionStats> {
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)
  const monthStart = firstOfMonth.toISOString()

  const [month, planifier, enCours, terminee] = await Promise.all([
    supabase.from('interventions').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('interventions').select('id', { count: 'exact', head: true }).eq('status', 'a_planifier'),
    supabase.from('interventions').select('id', { count: 'exact', head: true }).eq('status', 'en_cours'),
    supabase.from('interventions').select('id', { count: 'exact', head: true }).eq('status', 'terminee').gte('created_at', monthStart),
  ])

  return {
    thisMonth: month.count ?? 0,
    aPlanifier: planifier.count ?? 0,
    enCours: enCours.count ?? 0,
    termineeThisMonth: terminee.count ?? 0,
  }
}

export async function listInterventionsByStatus(status: string, limit = 4): Promise<Intervention[]> {
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Intervention[]).map(normalizeIntervention)
}

// ───────────────────────────────────────────────────────────────
// MAINTENANCE PRÉVENTIVE AUTOMATIQUE
// ───────────────────────────────────────────────────────────────

/**
 * Calcule la date de la prochaine visite préventive à partir d'une intervention
 * existante. Utilise la fréquence MINIMUM parmi les équipements présents
 * (ex: RIA 183j prime sur extincteurs 365j si les deux sont présents).
 *
 * Retourne `null` si aucun équipement valide n'est trouvé (cas dégradé,
 * on ne crée pas de visite auto).
 */
function computeNextScheduledDate(
  equipmentTypes: string[],
  fromDate: Date = new Date(),
): string | null {
  const freqs = equipmentTypes
    .map((t) => INSPECTION_FREQUENCIES_DAYS[t as EquipmentType])
    .filter((f): f is number => typeof f === 'number')
  if (freqs.length === 0) return null

  const minDays = Math.min(...freqs)
  const next = new Date(fromDate)
  next.setDate(next.getDate() + minDays)
  // Format YYYY-MM-DD pour la colonne `scheduled_date` (type date)
  return next.toISOString().slice(0, 10)
}

/**
 * Crée automatiquement la prochaine intervention récurrente après la clôture
 * d'un rapport, en se basant sur l'intervention parent.
 *
 * Logique :
 * - Copie les infos client/site/équipement du parent
 * - scheduled_date = (scheduled_date parent OU aujourd'hui) + frequency_days
 * - status = 'planifiee' (l'utilisateur peut modifier la date après)
 * - technician_id = null (à réassigner)
 * - parent_intervention_id = parent.id (traçabilité)
 * - auto_generated = true (badge UI)
 *
 * Idempotence : si une intervention enfant existe déjà pour ce parent,
 * on ne recrée pas (évite les doublons en cas de re-finalization du rapport).
 *
 * Retourne la nouvelle intervention créée, ou `null` si :
 * - Le parent est introuvable
 * - Aucun équipement valide
 * - Une intervention enfant existe déjà
 *
 * Note : ne throw jamais — la maintenance préventive est un BONUS, pas un
 * blocage. Si elle échoue, la clôture du rapport doit quand même réussir.
 */
export async function createNextScheduledIntervention(
  parentInterventionId: string,
): Promise<Intervention | null> {
  // 1) Récupère l'intervention parent
  const { data: parent, error: fetchErr } = await supabase
    .from('interventions')
    .select('*')
    .eq('id', parentInterventionId)
    .single()
  if (fetchErr || !parent) {
    console.warn('[auto-recurrence] parent introuvable', parentInterventionId, fetchErr)
    return null
  }
  const parentInter = normalizeIntervention(parent as Intervention)

  // 2) Idempotence : si un enfant existe déjà, on ne recrée pas
  const { data: existing } = await supabase
    .from('interventions')
    .select('id')
    .eq('parent_intervention_id', parentInterventionId)
    .limit(1)
  if (existing && existing.length > 0) {
    return null
  }

  // 3) Calcule la date de la prochaine visite
  const baseDate = parentInter.scheduled_date
    ? new Date(parentInter.scheduled_date)
    : new Date()
  const nextDate = computeNextScheduledDate(parentInter.equipment_types, baseDate)
  if (!nextDate) {
    console.warn('[auto-recurrence] pas de fréquence connue pour les équipements', parentInter.equipment_types)
    return null
  }

  // 4) Crée la nouvelle intervention
  const firstEquipment = parentInter.equipment_types[0] ?? null
  const { data: created, error: createErr } = await supabase
    .from('interventions')
    .insert({
      organization_id: parentInter.organization_id,
      client_name: parentInter.client_name,
      client_id: parentInter.client_id,
      site_name: parentInter.site_name,
      address: parentInter.address,
      equipment_type: firstEquipment,
      equipment_types: parentInter.equipment_types,
      technician_name: null, // À réassigner
      technician_id: null,
      scheduled_date: nextDate,
      priority: 'reglementaire', // Visite annuelle = réglementaire par défaut
      notes: `Visite récurrente automatique (suite de ${parentInter.reference}).`,
      status: 'planifiee',
      parent_intervention_id: parentInter.id,
      auto_generated: true,
    })
    .select()
    .single()

  if (createErr) {
    console.warn('[auto-recurrence] échec de la création', createErr)
    return null
  }

  return normalizeIntervention(created as Intervention)
}
