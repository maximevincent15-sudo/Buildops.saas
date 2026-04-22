import { supabase } from '../../shared/lib/supabase'
import type { Report, UpsertReportInput } from './schemas'

export async function getReportByIntervention(interventionId: string): Promise<Report | null> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('intervention_id', interventionId)
    .maybeSingle()
  if (error) throw error
  return data as Report | null
}

async function insertReport(
  interventionId: string,
  organizationId: string,
  input: UpsertReportInput,
  completedAt: string | null,
): Promise<Report> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      intervention_id: interventionId,
      organization_id: organizationId,
      equipment_type: input.equipment_type ?? null,
      checklist: input.checklist,
      observations: input.observations || null,
      signed_by_name: input.signed_by_name || null,
      signature_data_url: input.signature_data_url ?? null,
      photos: input.photos ?? [],
      completed_at: completedAt,
    })
    .select()
    .single()
  if (error) throw error
  return data as Report
}

async function updateExistingReport(
  reportId: string,
  input: UpsertReportInput,
  completedAt: string | null | undefined,
): Promise<Report> {
  const payload: Record<string, unknown> = {
    checklist: input.checklist,
    equipment_type: input.equipment_type ?? null,
    observations: input.observations || null,
    signed_by_name: input.signed_by_name || null,
    signature_data_url: input.signature_data_url ?? null,
    photos: input.photos ?? [],
    updated_at: new Date().toISOString(),
  }
  if (completedAt !== undefined) {
    payload.completed_at = completedAt
  }
  const { data, error } = await supabase
    .from('reports')
    .update(payload)
    .eq('id', reportId)
    .select()
    .single()
  if (error) throw error
  return data as Report
}

export async function saveDraftReport(
  interventionId: string,
  organizationId: string,
  input: UpsertReportInput,
): Promise<Report> {
  const existing = await getReportByIntervention(interventionId)
  if (existing) return updateExistingReport(existing.id, input, undefined)
  return insertReport(interventionId, organizationId, input, null)
}

export async function finalizeReport(
  interventionId: string,
  organizationId: string,
  input: UpsertReportInput,
): Promise<Report> {
  const completedAt = new Date().toISOString()
  const existing = await getReportByIntervention(interventionId)
  if (existing) return updateExistingReport(existing.id, input, completedAt)
  return insertReport(interventionId, organizationId, input, completedAt)
}

export async function setReportPdfUrl(reportId: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .update({ pdf_url: pdfUrl })
    .eq('id', reportId)
  if (error) throw error
}

export async function markReportSent(
  reportId: string,
  recipientEmail: string,
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .update({
      sent_to_email: recipientEmail,
      sent_at: new Date().toISOString(),
    })
    .eq('id', reportId)
  // Si les colonnes n'existent pas encore (migration 016 pas passée), on ne bloque
  // pas l'envoi — l'utilisateur peut quand même envoyer son mail, on loguera juste.
  if (error) {
    if (/sent_to_email|sent_at/i.test(error.message)) {
      console.warn('Migration 016 non appliquée — impossible de tracer l\'envoi.')
      return
    }
    throw error
  }
}

export type ReportWithIntervention = Report & {
  intervention: {
    id: string
    reference: string
    client_name: string
    equipment_type: string | null
    equipment_types: string[] | null
    scheduled_date: string | null
    technician_name: string | null
    status: string
  } | null
}

export async function listReports(): Promise<ReportWithIntervention[]> {
  // On tente d'abord avec equipment_types (migration 015 passée)
  let { data, error } = await supabase
    .from('reports')
    .select(`
      *,
      intervention:interventions (
        id, reference, client_name, equipment_type, equipment_types,
        scheduled_date, technician_name, status
      )
    `)
    .order('created_at', { ascending: false })

  // Fallback si la migration 015 n'est pas encore passée (colonne absente)
  if (error && /equipment_types/i.test(error.message)) {
    const fallback = await supabase
      .from('reports')
      .select(`
        *,
        intervention:interventions (
          id, reference, client_name, equipment_type,
          scheduled_date, technician_name, status
        )
      `)
      .order('created_at', { ascending: false })
    data = fallback.data
    error = fallback.error
  }

  if (error) throw error
  return (data ?? []) as unknown as ReportWithIntervention[]
}
