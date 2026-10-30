import { supabase } from '../../shared/lib/supabase'
import { parseCompanyNumber } from './companyLookup'
import type { Client, CreateClientInput } from './schemas'

/** SIREN/SIRET saisi → colonnes siren + siret (SIRET ⇒ SIREN = 9 premiers chiffres). */
function companyColumns(raw: string | undefined): { siren: string | null; siret: string | null } {
  const p = parseCompanyNumber(raw)
  if (!p.ok || !p.number) return { siren: null, siret: null }
  return { siren: p.number.siren, siret: p.number.siret }
}

/** Index unique (organisation, n° client) : message lisible au lieu de l'erreur Postgres */
function clientError(error: { code?: string; message: string }): Error {
  if (error.code === '23505' && error.message.includes('client_number')) {
    return new Error('Ce n° client est déjà utilisé par un autre client.')
  }
  return new Error(error.message)
}

export async function createClient(
  input: CreateClientInput,
  organizationId: string,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name: input.name,
      client_number: input.client_number?.trim() || null,
      ...companyColumns(input.company_number),
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      address: input.address || null,
      notes: input.notes || null,
      extra_emails: input.extra_emails ?? [],
    })
    .select()
    .single()
  if (error) throw clientError(error)
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
      // Absent (ex. import sans colonne « N° client ») : on garde le n° existant
      ...(input.client_number !== undefined ? { client_number: input.client_number.trim() || null } : {}),
      ...companyColumns(input.company_number),
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      address: input.address || null,
      notes: input.notes || null,
      ...(input.extra_emails ? { extra_emails: input.extra_emails } : {}),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw clientError(error)
  return data as Client
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Client | null) ?? null
}

/** N° client à imprimer sur un document (null si le client n'en a pas ou est introuvable) */
export async function getClientNumber(clientId: string | null | undefined): Promise<string | null> {
  if (!clientId) return null
  const { data, error } = await supabase
    .from('clients')
    .select('client_number')
    .eq('id', clientId)
    .maybeSingle()
  if (error) return null
  return (data as { client_number: string | null } | null)?.client_number?.trim() || null
}

/**
 * Prochain n° client : suit la numérotation déjà utilisée (préfixe et nombre de
 * chiffres du dernier n° saisi, ex. « 0458 » → « 0459 », « CLI-12 » → « CLI-13 »),
 * sinon C0001, C0002…
 */
export async function suggestNextClientNumber(organizationId: string): Promise<string> {
  const { data, error } = await supabase
    .from('clients')
    .select('client_number, created_at')
    .eq('organization_id', organizationId)
    .not('client_number', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  const numbered = ((data ?? []) as { client_number: string }[])
    .map((r) => r.client_number.trim().match(/^(.*?)(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
  if (numbered.length === 0) return 'C0001'
  // Préfixe du dernier client numéroté, puis le plus grand numéro de cette série
  const prefix = numbered[0][1]
  const width = numbered[0][2].length
  const max = Math.max(...numbered.filter((m) => m[1] === prefix).map((m) => Number(m[2])))
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}
