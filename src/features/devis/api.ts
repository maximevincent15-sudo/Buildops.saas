import { supabase } from '../../shared/lib/supabase'
import { computeQuoteTotals } from './constants'
import type { Quote, QuoteLine, QuoteWithLines, UpsertQuoteInput } from './schemas'

export async function listQuotes(): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Quote[]
}

export async function getQuote(id: string): Promise<QuoteWithLines | null> {
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (qErr) throw qErr
  if (!quote) return null

  const { data: lines, error: lErr } = await supabase
    .from('quote_lines')
    .select('*')
    .eq('quote_id', id)
    .order('position', { ascending: true })
  if (lErr) throw lErr

  return {
    ...(quote as Quote),
    lines: (lines ?? []) as QuoteLine[],
  }
}

export async function createQuote(
  input: UpsertQuoteInput,
  organizationId: string,
): Promise<QuoteWithLines> {
  const totals = computeQuoteTotals(
    input.lines.map((l) => ({
      quantity: l.quantity,
      unit_price_ht: l.unit_price_ht,
      vat_rate: l.vat_rate,
    })),
  )

  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .insert({
      organization_id: organizationId,
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_contact_name: input.client_contact_name || null,
      client_address: input.client_address || null,
      client_email: input.client_email || null,
      intervention_id: input.intervention_id || null,
      site_name: input.site_name || null,
      site_address: input.site_address || null,
      issue_date: input.issue_date,
      validity_date: input.validity_date || null,
      notes: input.notes || null,
      total_ht: totals.total_ht,
      total_vat: totals.total_vat,
      total_ttc: totals.total_ttc,
      status: 'draft',
    })
    .select()
    .single()
  if (qErr) throw qErr

  const linesPayload = input.lines.map((l, i) => ({
    quote_id: (quote as Quote).id,
    position: l.position ?? i,
    description: l.description,
    quantity: l.quantity,
    unit_price_ht: l.unit_price_ht,
    vat_rate: l.vat_rate,
  }))
  const { error: lErr } = await supabase.from('quote_lines').insert(linesPayload)
  if (lErr) throw lErr

  const full = await getQuote((quote as Quote).id)
  if (!full) throw new Error('Devis introuvable après création')
  return full
}

export async function updateQuote(
  id: string,
  input: UpsertQuoteInput,
): Promise<QuoteWithLines> {
  const totals = computeQuoteTotals(
    input.lines.map((l) => ({
      quantity: l.quantity,
      unit_price_ht: l.unit_price_ht,
      vat_rate: l.vat_rate,
    })),
  )

  const { error: qErr } = await supabase
    .from('quotes')
    .update({
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_contact_name: input.client_contact_name || null,
      client_address: input.client_address || null,
      client_email: input.client_email || null,
      intervention_id: input.intervention_id || null,
      site_name: input.site_name || null,
      site_address: input.site_address || null,
      issue_date: input.issue_date,
      validity_date: input.validity_date || null,
      notes: input.notes || null,
      total_ht: totals.total_ht,
      total_vat: totals.total_vat,
      total_ttc: totals.total_ttc,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (qErr) throw qErr

  // Stratégie simple : delete + insert all lines (les UUID sont régénérés)
  const { error: delErr } = await supabase
    .from('quote_lines')
    .delete()
    .eq('quote_id', id)
  if (delErr) throw delErr

  const linesPayload = input.lines.map((l, i) => ({
    quote_id: id,
    position: l.position ?? i,
    description: l.description,
    quantity: l.quantity,
    unit_price_ht: l.unit_price_ht,
    vat_rate: l.vat_rate,
  }))
  const { error: lErr } = await supabase.from('quote_lines').insert(linesPayload)
  if (lErr) throw lErr

  const full = await getQuote(id)
  if (!full) throw new Error('Devis introuvable après update')
  return full
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) throw error
}

// ─── Workflow ─────────────────────────────────────────────────────────

export async function markQuoteSent(id: string, recipientEmail: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_to_email: recipientEmail,
    })
    .eq('id', id)
  if (error) throw error
}

export async function markQuoteAccepted(id: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      refused_at: null,
      refused_reason: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function markQuoteRefused(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'refused',
      refused_at: new Date().toISOString(),
      refused_reason: reason,
      accepted_at: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setQuoteStatusDraft(id: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'draft',
      sent_at: null,
      accepted_at: null,
      refused_at: null,
      refused_reason: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setQuotePdfUrl(id: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({ pdf_url: pdfUrl })
    .eq('id', id)
  if (error) throw error
}
