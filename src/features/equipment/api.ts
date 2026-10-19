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
  EquipmentCheck,
  UpsertEquipmentCheckInput,
} from './schemas'
import { VERDICT_TO_UNIT_STATUS } from './schemas'

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

// La base renvoie au plus 1 000 lignes par requête : un parc de plusieurs
// milliers d'équipements se lit par pages (ordre stable grâce à l'id).
const UNITS_PAGE = 1000
// Requêtes lancées en même temps, pour ne pas saturer la connexion du téléphone
const PARALLEL_REQUESTS = 6

/** Exécute les tâches par vagues de PARALLEL_REQUESTS, en gardant l'ordre */
async function inWaves<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < tasks.length; i += PARALLEL_REQUESTS) {
    out.push(...(await Promise.all(tasks.slice(i, i + PARALLEL_REQUESTS).map((t) => t()))))
  }
  return out
}

export async function listEquipmentUnits(
  filters: EquipmentUnitFilters = {},
): Promise<EquipmentUnit[]> {
  async function page(from: number, withCount = false) {
    let q = supabase
      .from('equipment_units')
      .select('*', withCount ? { count: 'exact' } : undefined)
      .order('family', { ascending: true })
      .order('serial_number', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + UNITS_PAGE - 1)
    if (!filters.includeRemoved) q = q.neq('status', 'removed')
    if (filters.siteId) q = q.eq('site_id', filters.siteId)
    if (filters.clientId) q = q.eq('client_id', filters.clientId)
    if (filters.family) q = q.eq('family', filters.family)
    if (filters.zoneId) q = q.eq('zone_id', filters.zoneId)
    if (filters.status) q = q.eq('status', filters.status)
    const { data, error, count } = await q
    if (error) throw error
    return { rows: (data ?? []) as EquipmentUnit[], count: count ?? null }
  }

  // 1re page avec le total, puis les suivantes en parallèle
  const first = await page(0, true)
  const all = [...first.rows]
  if (first.rows.length < UNITS_PAGE) return all
  let next = UNITS_PAGE
  if (first.count !== null && first.count > UNITS_PAGE) {
    const starts: number[] = []
    for (let from = UNITS_PAGE; from < first.count; from += UNITS_PAGE) starts.push(from)
    const pages = await inWaves(starts.map((from) => () => page(from)))
    for (const p of pages) all.push(...p.rows)
    const last = pages[pages.length - 1]
    if (!last || last.rows.length < UNITS_PAGE) return all
    next = starts[starts.length - 1]! + UNITS_PAGE
  }
  // Total inconnu (ou parc qui a grossi entre-temps) : on continue page par page
  for (let from = next; ; from += UNITS_PAGE) {
    const p = await page(from)
    all.push(...p.rows)
    if (p.rows.length < UNITS_PAGE) return all
  }
}

// Identifiants par requête : l'URL reste courte (≈ 4 Ko)
const IDS_CHUNK = 100

/**
 * Équipements précis, par identifiant (anomalies, registre d'un rapport…),
 * sans charger tout le parc. L'ordre n'est pas garanti.
 */
export async function listEquipmentUnitsByIds(ids: Array<string | null | undefined>): Promise<EquipmentUnit[]> {
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)))
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += IDS_CHUNK) chunks.push(unique.slice(i, i + IDS_CHUNK))
  const pages = await inWaves(chunks.map((chunk) => async () => {
    const { data, error } = await supabase
      .from('equipment_units')
      .select('*')
      .in('id', chunk)
      .neq('status', 'removed')
    if (error) throw error
    return (data ?? []) as EquipmentUnit[]
  }))
  return pages.flat()
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

// ─── Equipment checks (contrôles unitaires) ──────────────

export async function listChecksByIntervention(
  interventionId: string,
): Promise<EquipmentCheck[]> {
  const { data, error } = await supabase
    .from('equipment_checks')
    .select('*')
    .eq('intervention_id', interventionId)
    .order('checked_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as EquipmentCheck[]
}

export async function getCheck(
  interventionId: string,
  equipmentUnitId: string,
): Promise<EquipmentCheck | null> {
  const { data, error } = await supabase
    .from('equipment_checks')
    .select('*')
    .eq('intervention_id', interventionId)
    .eq('equipment_unit_id', equipmentUnitId)
    .maybeSingle()
  if (error) throw error
  return (data as EquipmentCheck | null) ?? null
}

/**
 * Insère ou met à jour un contrôle unitaire.
 * Si `updateUnitStatus` est true (défaut), synchronise aussi le statut de
 * l'unité (equipment_units.status) en fonction du verdict.
 */
export async function upsertCheck(
  input: UpsertEquipmentCheckInput,
  organizationId: string,
  options: { updateUnitStatus?: boolean; technicianName?: string | null; technicianId?: string | null } = {},
): Promise<EquipmentCheck> {
  const row = {
    organization_id: organizationId,
    intervention_id: input.intervention_id,
    equipment_unit_id: input.equipment_unit_id,
    family_template_id: input.family_template_id ?? null,
    checklist: input.checklist ?? {},
    observation: input.observation ?? null,
    verdict: input.verdict ?? 'non_verifie',
    photos: input.photos ?? [],
    technician_id: input.technician_id ?? options.technicianId ?? null,
    technician_name: input.technician_name ?? options.technicianName ?? null,
    checked_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('equipment_checks')
    .upsert(row, { onConflict: 'intervention_id,equipment_unit_id' })
    .select()
    .single()
  if (error) throw error

  const check = data as EquipmentCheck

  // Synchro statut d'unité
  if (options.updateUnitStatus !== false && check.verdict !== 'non_verifie') {
    const newStatus = VERDICT_TO_UNIT_STATUS[check.verdict]
    if (newStatus) {
      const patch: Record<string, unknown> = { status: newStatus, last_check_date: new Date().toISOString().slice(0, 10) }
      await supabase
        .from('equipment_units')
        .update(patch)
        .eq('id', input.equipment_unit_id)
    }
  }

  return check
}

export async function deleteCheck(id: string): Promise<void> {
  const { error } = await supabase.from('equipment_checks').delete().eq('id', id)
  if (error) throw error
}

/**
 * Équipements de l'organisation dont le QR code correspond à l'une des
 * valeurs (comparaison exacte, en essayant aussi les variantes de casse).
 * Sert à repérer un QR déjà connu sur un autre site avant d'en créer un.
 */
export async function findUnitsByQrCodes(values: string[]): Promise<Array<Pick<EquipmentUnit, 'id' | 'site_id' | 'client_id' | 'serial_number' | 'family' | 'qr_code'>>> {
  const variants = Array.from(new Set(values.flatMap((v) => [v.trim(), v.trim().toUpperCase(), v.trim().toLowerCase()]).filter(Boolean)))
  if (variants.length === 0) return []
  const { data, error } = await supabase
    .from('equipment_units')
    .select('id, site_id, client_id, serial_number, family, qr_code')
    .in('qr_code', variants.slice(0, 40))
    .neq('status', 'removed')
    .limit(5)
  if (error) throw error
  return (data ?? []) as Array<Pick<EquipmentUnit, 'id' | 'site_id' | 'client_id' | 'serial_number' | 'family' | 'qr_code'>>
}
