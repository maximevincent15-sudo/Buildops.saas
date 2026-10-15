import { createElement } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { getInvoicingSettings } from '../../parametres/api'
import { todayIso } from '../schemas'
import type { ContractWithDetails } from '../schemas'
import { ContractPdf } from './ContractPdf'
import type { ContractPdfClient, ContractPdfSite } from './ContractPdf'

/** Génère le PDF du contrat (tel qu'enregistré) et le télécharge */
export async function downloadContractPdf(contract: ContractWithDetails, organizationId: string, organizationName: string): Promise<void> {
  const [{ pdf }, settings, clientRes, sitesRes] = await Promise.all([
    import('@react-pdf/renderer'),
    getInvoicingSettings(organizationId).catch(() => null),
    contract.client_id
      ? supabase.from('clients').select('name, contact_name, address, contact_email, siren').eq('id', contract.client_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    contract.site_ids.length
      ? supabase.from('sites').select('id, name, address, postal_code, city').in('id', contract.site_ids)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (clientRes.error) throw clientRes.error
  if (sitesRes.error) throw sitesRes.error

  const doc = createElement(ContractPdf, {
    contract,
    organizationName,
    settings,
    client: (clientRes.data ?? null) as ContractPdfClient | null,
    sites: ((sitesRes.data ?? []) as ContractPdfSite[]).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    issuedOn: todayIso(),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf() attend un élément <Document>
  const blob = await pdf(doc as any).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Contrat-${contract.reference}-${contract.client_name.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim().replace(/\s+/g, '-')}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
