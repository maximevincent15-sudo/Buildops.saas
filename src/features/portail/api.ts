import { supabase } from '../../shared/lib/supabase'
import type { EquipmentType } from '../../shared/constants/interventions'

export type ClientPortalToken = {
  id: string
  organization_id: string
  client_id: string
  token: string
  email_sent_to: string | null
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

// ─── Côté patron : gestion des tokens ────────────────────────────────

function generateToken(): string {
  // 40 caractères url-safe (sans / + =)
  const arr = new Uint8Array(20)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function listClientTokens(clientId: string): Promise<ClientPortalToken[]> {
  const { data, error } = await supabase
    .from('client_portal_tokens')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ClientPortalToken[]
}

export async function createClientToken(
  organizationId: string,
  clientId: string,
  emailSentTo?: string,
  expiresInDays = 90,
): Promise<ClientPortalToken> {
  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('client_portal_tokens')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      token,
      email_sent_to: emailSentTo ?? null,
      expires_at: expiresAt.toISOString(),
      created_by: userData.user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as ClientPortalToken
}

export async function revokeClientToken(id: string): Promise<void> {
  const { error } = await supabase
    .from('client_portal_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteClientToken(id: string): Promise<void> {
  const { error } = await supabase
    .from('client_portal_tokens')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export function buildPortalUrl(token: string): string {
  const base = window.location.origin
  return `${base}/client/${token}`
}

// ─── Côté client (portail) : RPC anonymes ────────────────────────────

export type PortalContext = {
  client_id: string
  organization_id: string
  client_name: string
  organization_name: string
  expires_at: string
}

export async function validatePortalToken(
  token: string,
): Promise<PortalContext | { error: string }> {
  const { data, error } = await supabase.rpc('client_portal_validate', { in_token: token })
  if (error) throw error
  if (data?.error) return { error: data.error as string }
  return {
    client_id: data.client_id as string,
    organization_id: data.organization_id as string,
    client_name: data.client_name as string,
    organization_name: data.organization_name as string,
    expires_at: data.expires_at as string,
  }
}

export type PortalReport = {
  id: string
  reference: string
  site_name: string | null
  equipment_type: string | null
  equipment_types: string[] | null
  completed_at: string | null
  pdf_url: string | null
  scheduled_date: string | null
  technician_name: string | null
  checklist: Array<{ id: string; value: 'ok' | 'nok' | 'na' | null }>
}

export async function getPortalReports(token: string): Promise<PortalReport[]> {
  const { data, error } = await supabase.rpc('client_portal_reports', { in_token: token })
  if (error) throw error
  return (data ?? []) as PortalReport[]
}

export type PortalInvoice = {
  id: string
  reference: string
  issue_date: string
  due_date: string | null
  status: string
  total_ht: number
  total_vat: number
  total_ttc: number
  amount_paid: number
  paid_at: string | null
  pdf_url: string | null
  site_name: string | null
}

export async function getPortalInvoices(token: string): Promise<PortalInvoice[]> {
  const { data, error } = await supabase.rpc('client_portal_invoices', { in_token: token })
  if (error) throw error
  return (data ?? []) as PortalInvoice[]
}

export type PortalUpcoming = {
  id: string
  reference: string
  site_name: string | null
  address: string | null
  equipment_types: string[] | null
  scheduled_date: string | null
  technician_name: string | null
  status: string
}

export async function getPortalUpcoming(token: string): Promise<PortalUpcoming[]> {
  const { data, error } = await supabase.rpc('client_portal_upcoming', { in_token: token })
  if (error) throw error
  return (data ?? []) as PortalUpcoming[]
}

export async function requestPortalIntervention(
  token: string,
  equipment: EquipmentType,
  message: string,
  siteName?: string,
  address?: string,
): Promise<{ success: true; intervention_id: string } | { error: string }> {
  const { data, error } = await supabase.rpc('client_portal_request_intervention', {
    in_token: token,
    in_equipment: equipment,
    in_message: message,
    in_site_name: siteName ?? null,
    in_address: address ?? null,
  })
  if (error) throw error
  if (data?.error) return { error: data.error as string }
  return { success: true, intervention_id: data.intervention_id as string }
}
