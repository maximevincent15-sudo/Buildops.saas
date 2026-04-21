import { supabase } from '../../shared/lib/supabase'
import type { Client, CreateClientInput } from './schemas'

export async function createClient(
  input: CreateClientInput,
  organizationId: string,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name: input.name,
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Client
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Client[]
}

export async function updateClient(
  id: string,
  input: CreateClientInput,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update({
      name: input.name,
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Client
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
  if (error) throw error
}
