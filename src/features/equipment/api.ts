import { supabase } from '../../shared/lib/supabase'
import type {
  Site,
  CreateSiteInput,
  Zone,
  CreateZoneInput,
  EquipmentUnit,
  CreateEquipmentUnitInput,
  FamilyTemplate,
  EquipmentFamily,
} from './schemas'

// ─── Sites ───────────────────────────────────────────────

export async function listSites(clientId?: string): Promise<Site[]> {
  let q = supabase.from('sites').select('*').order('name', { ascending: true })
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Site[]
}

export async function getSite(id: string): Promise<Site | null> {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Site | null) ?? null
}

export async function createSite(
  input: CreateSiteInput,
  organizationId: string,
): Promise<Site> {
  const { data, error } = await supabase
    .from('sites')
    .insert({
      organization_id: organizationId,
      client_id: input.client_id,
      name: input.name,
      address: input.address || null,
      postal_code: input.postal_code || null,
      city: input.city || null,
      contact_name: input.contact_name || null,
      contact_phone: input.contact_phone || null,
      access_notes: input.access_notes || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Site
}

export async function updateSite(
  id: string,
  input: Partial<CreateSiteInput>,
): Promise<Site> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.address !== undefined) patch.address = input.address || null
  if (input.postal_code !== undefined) patch.postal_code = input.postal_code || null
  if (input.city !== undefined) patch.city = input.city || null
  if (input.contact_name !== undefined) patch.contact_name = input.contact_name || null
  if (input.contact_phone !== undefined) patch.contact_phone = input.contact_phone || null
  if (input.access_notes !== undefined) patch.access_notes = input.access_notes || null
  if (input.notes !== undefined) patch.notes = input.notes || null
  const { data, error } = await supabase
    .from('sites')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Site
}

export async function deleteSite(id: string): Promise<void> {
  const { error } = await supabase.from('sites').delete().eq('id', id)
  if (error) throw error
}

// ─── Zones ───────────────────────────────────────────────

export async function listZones(siteId: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .eq('site_id', siteId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Zone[]
}

export async function createZone(
  input: CreateZoneInput,
  organizationId: string,
): Promise<Zone> {
  const { data, error } = await supabase
    .from('zones')
    .insert({
      organization_id: organizationId,
      site_id: input.site_id,
      name: input.name,
      parent_zone: input.parent_zone || null,
      display_order: input.display_order ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data as Zone
}

export async function updateZone(
  id: string,
  input: Partial<CreateZoneInput>,
): Promise<Zone> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.parent_zone !== undefined) patch.parent_zone = input.parent_zone || null
  if (input.display_order !== undefined) patch.display_order = input.display_order
  const { data, error } = await supabase
    .from('zones')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Zone
}

export async function deleteZone(id: string): Promise<void> {
  const { error } = await supabase.from('zones').delete().eq('id', id)
  if (error) throw error
}

// ─── Equipment units ─────────────────────────────────────

export type EquipmentUnitFilters = {
  siteId?: string
  clientId?: string
  family?: EquipmentFamily
  zoneId?: string
  status?: string
  includeRemoved?: boolean
}

export async function listEquipmentUnits(
  filters: EquipmentUnitFilters = {},
): Promise<EquipmentUnit[]> {
  let q = supabase
    .from('equipment_units')
    .select('*')
    .order('family', { ascending: true })
    .order('serial_number', { ascending: true })
  if (!filters.includeRemoved) q = q.neq('status', 'removed')
  if (filters.siteId) q = q.eq('site_id', filters.siteId)
  if (filters.clientId) q = q.eq('client_id', filters.clientId)
  if (filters.family) q = q.eq('family', filters.family)
  if (filters.zoneId) q = q.eq('zone_id', filters.zoneId)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as EquipmentUnit[]
}

export async function getEquipmentUnit(id: string): Promise<EquipmentUnit | null> {
  const { data, error } = await supabase
    .from('equipment_units')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EquipmentUnit | null) ?? null
}

function unitToRow(
  input: CreateEquipmentUnitInput,
  organizationId: string,
): Record<string, unknown> {
  return {
    organization_id: organizationId,
    client_id: input.client_id,
    site_id: input.site_id,
    zone_id: input.zone_id || null,
    family: input.family,
    subtype: input.subtype || null,
    serial_number: input.serial_number,
    implantation: input.implantation || null,
    brand: input.brand || null,
    model: input.model || null,
    install_year: input.install_year ?? null,
    next_replacement_year: input.next_replacement_year ?? null,
    qr_code: input.qr_code || null,
    status: input.status ?? 'active',
    last_check_date: input.last_check_date || null,
    next_check_date: input.next_check_date || null,
    notes: input.notes || null,
  }
}

export async function createEquipmentUnit(
  input: CreateEquipmentUnitInput,
  organizationId: string,
): Promise<EquipmentUnit> {
  const { data, error } = await supabase
    .from('equipment_units')
    .insert(unitToRow(input, organizationId))
    .select()
    .single()
  if (error) throw error
  return data as EquipmentUnit
}

export async function batchCreateEquipmentUnits(
  inputs: CreateEquipmentUnitInput[],
  organizationId: string,
): Promise<EquipmentUnit[]> {
  if (inputs.length === 0) return []
  const rows = inputs.map((i) => unitToRow(i, organizationId))
  const { data, error } = await supabase.from('equipment_units').insert(rows).select()
  if (error) throw error
  return (data ?? []) as EquipmentUnit[]
}

export async function updateEquipmentUnit(
  id: string,
  input: Partial<CreateEquipmentUnitInput>,
): Promise<EquipmentUnit> {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    patch[k] = v === '' ? null : v
  }
  const { data, error } = await supabase
    .from('equipment_units')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as EquipmentUnit
}

export async function deleteEquipmentUnit(id: string): Promise<void> {
  const { error } = await supabase.from('equipment_units').delete().eq('id', id)
  if (error) throw error
}

// ─── Family templates ────────────────────────────────────

export async function listFamilyTemplates(): Promise<FamilyTemplate[]> {
  const { data, error } = await supabase
    .from('family_templates')
    .select('*')
    .eq('active', true)
    .order('family', { ascending: true })
  if (error) throw error
  return (data ?? []) as FamilyTemplate[]
}

export async function getFamilyTemplate(
  family: EquipmentFamily,
): Promise<FamilyTemplate | null> {
  const { data, error } = await supabase
    .from('family_templates')
    .select('*')
    .eq('family', family)
    .eq('active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as FamilyTemplate | null) ?? null
}
