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
  logo_url: string | null
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
    logo_url: input.logo_url?.trim() || null,
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
