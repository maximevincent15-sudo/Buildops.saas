import { supabase } from '../../shared/lib/supabase'
import { createIntervention } from '../planning/api'
import type { EquipmentType } from '../../shared/constants/interventions'
import type { EquipmentFamily } from '../equipment/schemas'
import { FAMILY_TO_EQUIPMENT_TYPE } from './schemas'
import type { Contract, ContractInput, ContractLine, ContractWithDetails } from './schemas'

type ContractRow = Contract & {
  contract_sites: Array<{ site_id: string }> | null
  contract_lines: Array<ContractLine & { id: string }> | null
}

const SELECT = '*, contract_sites ( site_id ), contract_lines ( * )'

function normalize(row: ContractRow): ContractWithDetails {
  const { contract_sites, contract_lines, ...contract } = row
  return {
    ...contract,
    revision_rate: contract.revision_rate == null ? null : Number(contract.revision_rate),
    site_ids: (contract_sites ?? []).map((s) => s.site_id),
    lines: (contract_lines ?? [])
      .map((l) => ({
        id: l.id,
        position: l.position,
        site_id: l.site_id,
        catalog_item_id: l.catalog_item_id,
        equipment_family: l.equipment_family,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price_ht: Number(l.unit_price_ht),
        vat_rate: Number(l.vat_rate),
        frequency: l.frequency,
      }))
      .sort((a, b) => a.position - b.position),
  }
}

export async function listContracts(): Promise<ContractWithDetails[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ContractRow[]).map(normalize)
}

export async function listContractsForClient(clientId: string): Promise<ContractWithDetails[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ContractRow[]).map(normalize)
}

export async function getContract(id: string): Promise<ContractWithDetails> {
  const { data, error } = await supabase.from('contracts').select(SELECT).eq('id', id).single()
  if (error) throw error
  return normalize(data as ContractRow)
}

/**
 * Crée ou met à jour un contrat avec ses sites et ses lignes (remplacés en
 * bloc). Renvoie le contrat relu en base (référence CTR-… attribuée).
 */
export async function saveContract(input: ContractInput, organizationId: string, id?: string): Promise<ContractWithDetails> {
  const row = {
    client_id: input.client_id,
    client_name: input.client_name.trim(),
    title: input.title?.trim() || null,
    status: input.status,
    start_date: input.start_date,
    initial_months: input.initial_months,
    tacit_renewal: input.tacit_renewal,
    notice_months: input.notice_months,
    billing_mode: input.billing_mode,
    billing_frequency: input.billing_frequency,
    revision_rate: input.revision_rate,
    notes: input.notes?.trim() || null,
  }

  let contractId = id
  if (contractId) {
    const { error } = await supabase.from('contracts').update(row).eq('id', contractId)
    if (error) throw error
    const [delSites, delLines] = await Promise.all([
      supabase.from('contract_sites').delete().eq('contract_id', contractId),
      supabase.from('contract_lines').delete().eq('contract_id', contractId),
    ])
    if (delSites.error) throw delSites.error
    if (delLines.error) throw delLines.error
  } else {
    const { data, error } = await supabase
      .from('contracts')
      .insert({ organization_id: organizationId, ...row })
      .select('id')
      .single()
    if (error) throw error
    contractId = (data as { id: string }).id
  }

  if (input.site_ids.length > 0) {
    const { error } = await supabase.from('contract_sites').insert(
      input.site_ids.map((siteId) => ({ contract_id: contractId, site_id: siteId, organization_id: organizationId })),
    )
    if (error) throw error
  }
  const lines = input.lines.filter((l) => l.description.trim())
  if (lines.length > 0) {
    const { error } = await supabase.from('contract_lines').insert(
      lines.map((l, i) => ({
        contract_id: contractId,
        organization_id: organizationId,
        position: i,
        site_id: l.site_id,
        catalog_item_id: l.catalog_item_id,
        equipment_family: l.equipment_family,
        description: l.description.trim(),
        quantity: l.quantity,
        unit_price_ht: Math.round(l.unit_price_ht * 100) / 100,
        vat_rate: l.vat_rate,
        frequency: l.frequency,
      })),
    )
    if (error) throw error
  }
  return getContract(contractId!)
}

export async function deleteContract(id: string): Promise<void> {
  const { error } = await supabase.from('contracts').delete().eq('id', id)
  if (error) throw error
}

/** Équipements en service d'une famille sur des sites (pour « Compter depuis le parc ») */
export async function countEquipmentOnSites(siteIds: string[], family: EquipmentFamily): Promise<number> {
  if (siteIds.length === 0) return 0
  const { count, error } = await supabase
    .from('equipment_units')
    .select('id', { count: 'exact', head: true })
    .in('site_id', siteIds)
    .eq('family', family)
    .in('status', ['active', 'to_watch', 'to_replace'])
  if (error) throw error
  return count ?? 0
}

type SiteRow = {
  id: string
  name: string
  client_id: string
  address: string | null
  postal_code: string | null
  city: string | null
}

/**
 * Planifie les visites du contrat : pour chaque site couvert, rattache la
 * prochaine visite préventive déjà prévue, sinon crée une visite « À
 * planifier ». Les visites suivantes s'enchaîneront ensuite automatiquement
 * à la clôture des rapports, tant que le contrat reste actif.
 */
export async function planContractVisits(contract: ContractWithDetails, organizationId: string): Promise<{ linked: number; created: number }> {
  if (contract.site_ids.length === 0) return { linked: 0, created: 0 }

  const [{ data: sites, error: sitesErr }, { data: upcoming, error: upErr }, { data: units, error: unitsErr }] = await Promise.all([
    supabase.from('sites').select('id, name, client_id, address, postal_code, city').in('id', contract.site_ids),
    supabase
      .from('interventions')
      .select('id, site_id, contract_id, scheduled_date')
      .in('site_id', contract.site_ids)
      .in('status', ['a_planifier', 'planifiee'])
      .in('intervention_type', ['preventive', 'verification_contrat']),
    supabase
      .from('equipment_units')
      .select('site_id, family')
      .in('site_id', contract.site_ids)
      .in('status', ['active', 'to_watch', 'to_replace']),
  ])
  if (sitesErr) throw sitesErr
  if (upErr) throw upErr
  if (unitsErr) throw unitsErr

  let linked = 0
  let created = 0
  for (const site of (sites ?? []) as SiteRow[]) {
    const candidates = ((upcoming ?? []) as Array<{ id: string; site_id: string; contract_id: string | null; scheduled_date: string | null }>)
      .filter((i) => i.site_id === site.id && (i.contract_id === null || i.contract_id === contract.id))
    if (candidates.some((i) => i.contract_id === contract.id)) continue

    if (candidates.length > 0) {
      // La plus proche dans le temps (les visites sans date en dernier)
      const next = candidates.sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999'))[0]!
      const { error } = await supabase
        .from('interventions')
        .update({ contract_id: contract.id, recurrence_active: true })
        .eq('id', next.id)
      if (error) throw error
      linked++
      continue
    }

    // Types d'équipements : familles des lignes du contrat, sinon parc du site
    const families = new Set<EquipmentFamily>()
    for (const l of contract.lines) {
      if (l.equipment_family && (l.site_id === null || l.site_id === site.id)) families.add(l.equipment_family)
    }
    if (families.size === 0) {
      for (const u of (units ?? []) as Array<{ site_id: string; family: EquipmentFamily }>) {
        if (u.site_id === site.id) families.add(u.family)
      }
    }
    const equipmentTypes = Array.from(new Set(
      Array.from(families).map((f) => FAMILY_TO_EQUIPMENT_TYPE[f]).filter((t): t is EquipmentType => !!t),
    ))

    const visit = await createIntervention({
      client_name: contract.client_name,
      client_id: contract.client_id ?? site.client_id,
      site_name: site.name,
      site_id: site.id,
      address: [site.address, [site.postal_code, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      chantier_address: site.address ?? '',
      chantier_postal_code: site.postal_code ?? '',
      chantier_city: site.city ?? '',
      equipment_types: equipmentTypes.length > 0 ? equipmentTypes : ['extincteurs'],
      intervention_type: 'verification_contrat',
      priority: 'reglementaire',
      recurrence_active: true,
      notes: `Visite du contrat ${contract.reference}`,
    } as Parameters<typeof createIntervention>[0], organizationId)
    const { error } = await supabase.from('interventions').update({ contract_id: contract.id }).eq('id', visit.id)
    if (error) throw error
    created++
  }
  return { linked, created }
}

/** Visites à venir du contrat (non commencées) */
export async function listUpcomingContractVisits(contractId: string): Promise<Array<{ id: string; reference: string; scheduled_date: string | null; site_name: string | null }>> {
  const { data, error } = await supabase
    .from('interventions')
    .select('id, reference, scheduled_date, site_name')
    .eq('contract_id', contractId)
    .in('status', ['a_planifier', 'planifiee'])
    .order('scheduled_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Array<{ id: string; reference: string; scheduled_date: string | null; site_name: string | null }>
}

/**
 * Résiliation : plus aucune visite ne sera créée. Les visites à venir
 * peuvent être supprimées (choix de l'utilisateur) ; sinon elles restent au
 * planning mais ne s'enchaîneront plus.
 */
export async function terminateContract(id: string, terminatedOn: string, reason: string | null, deleteUpcoming: boolean): Promise<void> {
  const { error } = await supabase
    .from('contracts')
    .update({ status: 'terminated', terminated_on: terminatedOn, termination_reason: reason?.trim() || null })
    .eq('id', id)
  if (error) throw error

  const { error: recErr } = await supabase
    .from('interventions')
    .update({ recurrence_active: false })
    .eq('contract_id', id)
    .in('status', ['a_planifier', 'planifiee', 'en_cours'])
  if (recErr) throw recErr

  if (deleteUpcoming) {
    const { error: delErr } = await supabase
      .from('interventions')
      .delete()
      .eq('contract_id', id)
      .in('status', ['a_planifier', 'planifiee'])
    if (delErr) throw delErr
  }
}
