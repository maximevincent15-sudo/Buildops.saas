import { supabase } from '../../shared/lib/supabase'
import type { CreateTechnicianInput, Technician } from './schemas'

/**
 * Traduit le refus du trigger enforce_technician_limit (limite de la
 * formule atteinte) en message compréhensible ; sinon renvoie l'erreur telle quelle.
 */
function toTechnicianError(error: { message?: string }): Error {
  const m = /technician_limit_reached:(\d+)/.exec(error.message ?? '')
  if (m) {
    return new Error(
      `Votre formule est limitée à ${m[1]} techniciens actifs. Passez à la formule supérieure depuis la page Abonnement, ou désactivez un technicien.`,
    )
  }
  return error instanceof Error ? error : new Error(error.message ?? 'Erreur inconnue')
}

export async function createTechnician(
  input: CreateTechnicianInput,
  organizationId: string,
): Promise<Technician> {
  const { data, error } = await supabase
    .from('technicians')
    .insert({
      organization_id: organizationId,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email || null,
      phone: input.phone || null,
      role: input.role || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) throw toTechnicianError(error)
  return data as Technician
}

export async function listTechnicians(): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('technicians')
    .select('*')
    .order('active', { ascending: false })
    .order('last_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Technician[]
}

export async function updateTechnician(
  id: string,
  input: CreateTechnicianInput,
): Promise<Technician> {
  const { data, error } = await supabase
    .from('technicians')
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email || null,
      phone: input.phone || null,
      role: input.role || null,
      notes: input.notes || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Technician
}

export async function setTechnicianActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('technicians')
    .update({ active })
    .eq('id', id)
  if (error) throw toTechnicianError(error)
}

export async function deleteTechnician(id: string): Promise<void> {
  const { error } = await supabase.from('technicians').delete().eq('id', id)
  if (error) throw error
}
