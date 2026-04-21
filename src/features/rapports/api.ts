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
      checklist: input.checklist,
      observations: input.observations || null,
      signed_by_name: input.signed_by_name || null,
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
    observations: input.observations || null,
    signed_by_name: input.signed_by_name || null,
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
