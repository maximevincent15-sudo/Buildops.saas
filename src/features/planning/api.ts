import { supabase } from '../../shared/lib/supabase'
import type { CreateInterventionInput, Intervention } from './schemas'

export async function createIntervention(
  input: CreateInterventionInput,
  organizationId: string,
): Promise<Intervention> {
  const { data, error } = await supabase
    .from('interventions')
    .insert({
      organization_id: organizationId,
      client_name: input.client_name,
      site_name: input.site_name || null,
      address: input.address || null,
      equipment_type: input.equipment_type,
      technician_name: input.technician_name || null,
      scheduled_date: input.scheduled_date || null,
      priority: input.priority,
      notes: input.notes || null,
      status: input.scheduled_date ? 'planifiee' : 'a_planifier',
    })
    .select()
    .single()
  if (error) throw error
  return data as Intervention
}

export async function listInterventions(): Promise<Intervention[]> {
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Intervention[]
}

export async function listRecentInterventions(limit = 5): Promise<Intervention[]> {
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Intervention[]
}

export async function updateIntervention(
  id: string,
  input: CreateInterventionInput,
): Promise<Intervention> {
  const { data, error } = await supabase
    .from('interventions')
    .update({
      client_name: input.client_name,
      site_name: input.site_name || null,
      address: input.address || null,
      equipment_type: input.equipment_type,
      technician_name: input.technician_name || null,
      scheduled_date: input.scheduled_date || null,
      priority: input.priority,
      notes: input.notes || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Intervention
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
  return data as Intervention
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
  return (data ?? []) as Intervention[]
}
