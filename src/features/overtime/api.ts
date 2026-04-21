import { supabase } from '../../shared/lib/supabase'
import type { CreateOvertimeInput, Overtime } from './schemas'

export async function createOvertime(
  input: CreateOvertimeInput,
  organizationId: string,
  technicianName: string,
): Promise<Overtime> {
  const { data, error } = await supabase
    .from('overtime_hours')
    .insert({
      organization_id: organizationId,
      technician_id: input.technician_id,
      technician_name: technicianName,
      worked_on: input.worked_on,
      hours: input.hours,
      type: input.type,
      description: input.description || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Overtime
}

export async function listOvertime(): Promise<Overtime[]> {
  const { data, error } = await supabase
    .from('overtime_hours')
    .select('*')
    .order('worked_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Overtime[]
}

export async function approveOvertime(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('overtime_hours')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userData.user?.id ?? null,
      rejection_reason: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function rejectOvertime(id: string, reason: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('overtime_hours')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userData.user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function resetOvertimeToPending(id: string): Promise<void> {
  const { error } = await supabase
    .from('overtime_hours')
    .update({
      status: 'pending',
      rejection_reason: null,
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteOvertime(id: string): Promise<void> {
  const { error } = await supabase.from('overtime_hours').delete().eq('id', id)
  if (error) throw error
}
