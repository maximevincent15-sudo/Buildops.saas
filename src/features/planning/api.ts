import { supabase } from '../../shared/lib/supabase'
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
