import { supabase } from '../../shared/lib/supabase'

export type Certification = {
  id: string
  organization_id: string
  technician_id: string
  name: string
  issuing_body: string | null
  issued_at: string | null
  expires_at: string | null
  notes: string | null
  created_at: string
}

export type CreateCertificationInput = {
  name: string
  issuing_body?: string
  issued_at?: string
  expires_at?: string
  notes?: string
}

export async function listCertificationsForTechnician(
  technicianId: string,
): Promise<Certification[]> {
  const { data, error } = await supabase
    .from('certifications')
    .select('*')
    .eq('technician_id', technicianId)
    .order('expires_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Certification[]
}

export async function listAllCertifications(): Promise<Certification[]> {
  const { data, error } = await supabase
    .from('certifications')
    .select('*')
    .order('expires_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Certification[]
}

export async function createCertification(
  organizationId: string,
  technicianId: string,
  input: CreateCertificationInput,
): Promise<Certification> {
  const { data, error } = await supabase
    .from('certifications')
    .insert({
      organization_id: organizationId,
      technician_id: technicianId,
      name: input.name,
      issuing_body: input.issuing_body || null,
      issued_at: input.issued_at || null,
      expires_at: input.expires_at || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Certification
}

export async function deleteCertification(id: string): Promise<void> {
  const { error } = await supabase.from('certifications').delete().eq('id', id)
  if (error) throw error
}

export type CertificationAlert = {
  key: string
  technicianId: string
  technicianName: string
  certificationId: string
  certificationName: string
  issuingBody: string | null
  expiresAt: string
  daysUntilExpiry: number
}

type CertRowWithTech = Certification & {
  technician: {
    id: string
    first_name: string
    last_name: string
    active: boolean
  } | null
}

export async function computeCertificationAlerts(): Promise<CertificationAlert[]> {
  const { data, error } = await supabase
    .from('certifications')
    .select('*, technician:technicians(id, first_name, last_name, active)')
    .not('expires_at', 'is', null)
  if (error) throw error

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows = (data ?? []) as unknown as CertRowWithTech[]
  const alerts: CertificationAlert[] = []
  for (const c of rows) {
    const tech = c.technician
    if (!tech || !tech.active) continue
    if (!c.expires_at) continue
    const exp = new Date(c.expires_at)
    exp.setHours(0, 0, 0, 0)
    const days = Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    alerts.push({
      key: c.id,
      technicianId: tech.id,
      technicianName: `${tech.first_name} ${tech.last_name}`,
      certificationId: c.id,
      certificationName: c.name,
      issuingBody: c.issuing_body,
      expiresAt: c.expires_at,
      daysUntilExpiry: days,
    })
  }

  return alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
}
