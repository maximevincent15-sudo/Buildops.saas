import { supabase } from '../../../shared/lib/supabase'
import type { ReportClientInfo } from './clientInfo'

const groupDigits = (digits: string) =>
  digits.length === 14
    ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
    : digits.length === 9
      ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
      : digits

type ClientRow = {
  name: string | null
  address: string | null
  contact_phone: string | null
  contact_email: string | null
  siret: string | null
  siren: string | null
}

/** null si le rapport n'a pas de fiche client ou si elle est illisible : le PDF garde alors le nom seul */
export async function loadReportClientInfo(clientId: string | null | undefined): Promise<ReportClientInfo | null> {
  if (!clientId) return null
  const { data, error } = await supabase
    .from('clients')
    .select('name, address, contact_phone, contact_email, siret, siren')
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as ClientRow
  const siret = (row.siret ?? '').replace(/\s/g, '')
  const siren = (row.siren ?? '').replace(/\s/g, '')
  return {
    name: row.name?.trim() ?? '',
    address: row.address?.trim() || null,
    phone: row.contact_phone?.trim() || null,
    email: row.contact_email?.trim() || null,
    companyId: siret ? `SIRET ${groupDigits(siret)}` : siren ? `SIREN ${groupDigits(siren)}` : null,
  }
}
