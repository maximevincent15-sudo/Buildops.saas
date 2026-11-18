import { supabase } from '../../shared/lib/supabase'
import { removeStoredFile } from '../../shared/lib/privateFiles'
import type { Quote } from './schemas'

/** Procès-verbal de réception (migration 20261118120000) */
export type ReceptionReport = {
  id: string
  organization_id: string
  quote_id: string | null
  reference: string
  issue_date: string
  issue_city: string | null
  quote_reference: string | null
  order_reference: string | null
  client_name: string
  client_contact_name: string | null
  client_address: string | null
  site_name: string | null
  site_address: string | null
  dossier_number: string | null
  description: string | null
  standards: string[]
  other_standards: string | null
  standards_note: string | null
  delivery_date: string | null
  signatory_name: string | null
  pdf_url: string | null
  sent_at: string | null
  created_at: string
  created_by: string | null
  updated_at: string
}

/** Ce qui est saisi dans la fenêtre du PV */
export type ReceptionReportInput = {
  issue_date: string
  issue_city: string | null
  client_name: string
  client_contact_name: string | null
  site_address: string | null
  dossier_number: string | null
  description: string | null
  standards: string[]
  other_standards: string | null
  standards_note: string | null
  delivery_date: string | null
  signatory_name: string | null
}

/** PV d'un devis, du plus ancien au plus récent */
export async function listReceptionReports(quoteId: string): Promise<ReceptionReport[]> {
  const { data, error } = await supabase
    .from('reception_reports')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ReceptionReport[]
}

/** Dernier PV de l'entreprise : ses référentiels servent de point de départ au suivant */
export async function lastReceptionReport(): Promise<ReceptionReport | null> {
  const { data, error } = await supabase
    .from('reception_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as ReceptionReport | null) ?? null
}

/** Crée le PV (numéro attribué par la base) */
export async function createReceptionReport(quote: Quote, input: ReceptionReportInput, organizationId: string): Promise<ReceptionReport> {
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('reception_reports')
    .insert({
      organization_id: organizationId,
      quote_id: quote.id,
      issue_date: input.issue_date,
      issue_city: input.issue_city,
      quote_reference: quote.reference,
      order_reference: quote.order_reference ?? null,
      client_name: input.client_name,
      client_contact_name: input.client_contact_name,
      client_address: quote.client_address,
      site_name: quote.site_name,
      site_address: input.site_address,
      dossier_number: input.dossier_number,
      description: input.description,
      standards: input.standards,
      other_standards: input.other_standards,
      standards_note: input.standards_note,
      delivery_date: input.delivery_date,
      signatory_name: input.signatory_name,
      created_by: auth.user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  const created = data as ReceptionReport
  // Sans réseau, la création serait mise en attente sans numéro : pas de PV sans numéro
  if (!created.reference) {
    await supabase.from('reception_reports').delete().eq('id', created.id)
    throw new Error('Réseau trop faible : le PV n\'a pas pu être créé. Réessayez avec du réseau.')
  }
  return created
}

export async function setReceptionReportPdfUrl(id: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase.from('reception_reports').update({ pdf_url: pdfUrl }).eq('id', id)
  if (error) throw error
}

export async function markReceptionReportSent(id: string): Promise<string> {
  const now = new Date().toISOString()
  const { error } = await supabase.from('reception_reports').update({ sent_at: now }).eq('id', id)
  if (error) throw error
  return now
}

/** Supprime un PV et son PDF (le numéro n'est pas réattribué) */
export async function deleteReceptionReport(report: ReceptionReport): Promise<void> {
  const { error } = await supabase.from('reception_reports').delete().eq('id', report.id)
  if (error) throw error
  if (report.pdf_url) {
    // Retiré aussi du dossier, où il avait été rangé
    await supabase
      .from('dossier_documents')
      .delete()
      .eq('organization_id', report.organization_id)
      .eq('file_url', report.pdf_url.split('?')[0]!)
    await removeStoredFile(report.pdf_url).catch(() => {})
  }
}

/** Liste « Référentiels » imprimée : les normes proposées, puis celles ajoutées par l'entreprise */
export function splitOtherStandards(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
