import { supabase } from '../../../shared/lib/supabase'
import type { Intervention } from '../../planning/schemas'

export type ReportExtras = {
  /** Date de la vérification précédente du site, pour les mêmes types d'équipements */
  previousVisitDate: string | null
  /** Adresse du client (destinataire du compte rendu) */
  clientAddress: string | null
  /** Habilitations du vérificateur valables le jour de la visite */
  technicianQualifications: string[]
}

function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Ce que le compte rendu classique affiche en plus du rapport standard */
export async function loadReportExtras(intervention: Intervention): Promise<ReportExtras> {
  let previous = supabase
    .from('interventions')
    .select('scheduled_date')
    .eq('status', 'terminee')
    .neq('id', intervention.id)
    .not('scheduled_date', 'is', null)
    .order('scheduled_date', { ascending: false })
    .limit(1)
  if (intervention.scheduled_date) previous = previous.lt('scheduled_date', intervention.scheduled_date)
  if (intervention.equipment_types.length > 0) previous = previous.overlaps('equipment_types', intervention.equipment_types)
  previous = intervention.site_id
    ? previous.eq('site_id', intervention.site_id)
    : previous.eq('client_name', intervention.client_name).eq('site_name', intervention.site_name ?? '')

  const visitDay = (intervention.scheduled_date ?? new Date().toISOString()).slice(0, 10)
  const [prevRes, clientRes, certRes] = await Promise.all([
    previous,
    intervention.client_id
      ? supabase.from('clients').select('address').eq('id', intervention.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    intervention.technician_id
      ? supabase.from('certifications').select('name, issuing_body, expires_at').eq('technician_id', intervention.technician_id).order('name')
      : Promise.resolve({ data: [] }),
  ])
  type Cert = { name: string; issuing_body: string | null; expires_at: string | null }
  const qualifications = ((certRes.data ?? []) as Cert[])
    .filter((c) => !c.expires_at || c.expires_at.slice(0, 10) >= visitDay)
    .map((c) => [c.name, c.issuing_body ? `(${c.issuing_body})` : null, c.expires_at ? `valable jusqu'au ${frDate(c.expires_at)}` : null].filter(Boolean).join(' '))
  return {
    previousVisitDate: ((prevRes.data ?? [])[0] as { scheduled_date: string } | undefined)?.scheduled_date ?? null,
    clientAddress: (clientRes.data as { address: string | null } | null)?.address?.trim() || null,
    technicianQualifications: qualifications,
  }
}
