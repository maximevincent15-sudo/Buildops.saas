import { supabase } from '../../shared/lib/supabase'

/** Met à jour le nom de l'organisation (apparaît partout : sidebar, devis, factures…) */
export async function updateOrganizationName(
  organizationId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nom d\'entreprise requis')
  const { error } = await supabase
    .from('organizations')
    .update({ name: trimmed })
    .eq('id', organizationId)
  if (error) throw error
}

export type VatMention = 'none' | 'debits' | 'franchise'

/** Texte imprimé en bas des factures (et des devis pour la franchise) selon le régime choisi */
export const VAT_MENTION_TEXT: Record<VatMention, string | null> = {
  none: null,
  debits: "Option pour le paiement de la taxe d'après les débits.",
  franchise: 'TVA non applicable, art. 293 B du CGI.',
}

export type InvoicingSettings = {
  organization_id: string
  legal_form: string | null
  siret: string | null
  ape_code: string | null
  vat_number: string | null
  capital: string | null
  legal_address: string | null
  legal_city: string | null
  legal_postal_code: string | null
  legal_phone: string | null
  legal_email: string | null
  iban: string | null
  bic: string | null
  bank_name: string | null
  payment_terms: string | null
  late_penalty_text: string | null
  no_discount_text: string | null
  /** Mention TVA en bas des factures (migration 20261030150000) */
  vat_mention: VatMention
  logo_url: string | null
  /** Préfixes de numérotation (Migration 020) */
  quote_prefix: string | null
  invoice_prefix: string | null
  updated_at: string
}

export type UpsertInvoicingInput = Omit<InvoicingSettings, 'organization_id' | 'updated_at'>

export async function getInvoicingSettings(organizationId: string): Promise<InvoicingSettings | null> {
  const { data, error } = await supabase
    .from('organization_invoicing_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  return (data as InvoicingSettings | null) ?? null
}

export async function upsertInvoicingSettings(
  organizationId: string,
  input: UpsertInvoicingInput,
): Promise<InvoicingSettings> {
  const payload = {
    organization_id: organizationId,
    legal_form: input.legal_form?.trim() || null,
    siret: input.siret?.trim() || null,
    ape_code: input.ape_code?.trim() || null,
    vat_number: input.vat_number?.trim() || null,
    capital: input.capital?.trim() || null,
    legal_address: input.legal_address?.trim() || null,
    legal_city: input.legal_city?.trim() || null,
    legal_postal_code: input.legal_postal_code?.trim() || null,
    legal_phone: input.legal_phone?.trim() || null,
    legal_email: input.legal_email?.trim() || null,
    iban: input.iban?.trim() || null,
    bic: input.bic?.trim() || null,
    bank_name: input.bank_name?.trim() || null,
    payment_terms: input.payment_terms?.trim() || null,
    late_penalty_text: input.late_penalty_text?.trim() || null,
    no_discount_text: input.no_discount_text?.trim() || null,
    vat_mention: input.vat_mention ?? 'none',
    logo_url: input.logo_url?.trim() || null,
    quote_prefix: input.quote_prefix?.trim().toUpperCase() || null,
    invoice_prefix: input.invoice_prefix?.trim().toUpperCase() || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('organization_invoicing_settings')
    .upsert(payload, { onConflict: 'organization_id' })
    .select()
    .single()
  if (error) throw error
  return data as InvoicingSettings
}

// ─── Prochain numéro de devis / de facture ───────────────

export type NextNumbers = {
  year: number
  nextQuote: number
  nextInvoice: number
  /** Des factures existent déjà cette année : leur numérotation ne peut plus changer */
  invoicesThisYear: boolean
}

export async function getNextNumbers(organizationId: string): Promise<NextNumbers> {
  const year = new Date().getFullYear()
  const [counters, invoices] = await Promise.all([
    supabase
      .from('organization_year_counters')
      .select('quotes_counter, invoices_counter')
      .eq('organization_id', organizationId)
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('issue_date', `${year}-01-01`)
      .lt('issue_date', `${year + 1}-01-01`),
  ])
  if (counters.error) throw counters.error
  if (invoices.error) throw invoices.error
  return {
    year,
    nextQuote: Number(counters.data?.quotes_counter ?? 0) + 1,
    nextInvoice: Number(counters.data?.invoices_counter ?? 0) + 1,
    invoicesThisYear: (invoices.count ?? 0) > 0,
  }
}

const NEXT_NUMBER_ERRORS: Record<string, string> = {
  not_admin: 'Seul un administrateur peut changer la numérotation.',
  bad_number: 'Indique un numéro entre 1 et 999 999.',
  would_reuse: 'Ce numéro de devis est déjà utilisé : choisis un numéro plus grand.',
  invoices_already_issued: 'Des factures ont déjà été créées cette année : leur numérotation doit rester continue et ne peut plus être changée.',
}

/** Fixe le prochain numéro de l'année en cours (reprise de la numérotation d'un ancien logiciel) */
export async function setNextDocumentNumber(kind: 'quote' | 'invoice', next: number): Promise<void> {
  const { data, error } = await supabase.rpc('set_next_document_number', { p_kind: kind, p_next: next })
  if (error) throw error
  const code = (data as { error?: string } | null)?.error
  if (code) throw new Error(NEXT_NUMBER_ERRORS[code] ?? 'Numéro refusé.')
}
