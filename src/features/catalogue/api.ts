import { supabase } from '../../shared/lib/supabase'
import type { CatalogItem, CatalogItemInput } from './schemas'

function toRow(input: CatalogItemInput) {
  return {
    reference: input.reference?.trim() || null,
    label: input.label.trim(),
    category: input.category,
    unit: input.unit.trim() || 'u',
    unit_price_ht: Math.max(0, Math.round(input.unit_price_ht * 100) / 100),
    purchase_price_ht: input.purchase_price_ht == null ? null : Math.max(0, Math.round(input.purchase_price_ht * 100) / 100),
    vat_rate: input.vat_rate,
    notes: input.notes?.trim() || null,
    ...(input.active === undefined ? {} : { active: input.active }),
  }
}

function normalize(row: CatalogItem): CatalogItem {
  return {
    ...row,
    unit_price_ht: Number(row.unit_price_ht),
    purchase_price_ht: row.purchase_price_ht == null ? null : Number(row.purchase_price_ht),
    vat_rate: Number(row.vat_rate),
  }
}

/** Catalogue de l'organisation (RLS), trié par désignation. */
export async function listCatalogItems(options: { activeOnly?: boolean } = {}): Promise<CatalogItem[]> {
  let q = supabase.from('catalog_items').select('*').order('label', { ascending: true })
  if (options.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as CatalogItem[]).map(normalize)
}

export async function createCatalogItem(input: CatalogItemInput, organizationId: string): Promise<CatalogItem> {
  const { data, error } = await supabase
    .from('catalog_items')
    .insert({ organization_id: organizationId, ...toRow(input) })
    .select()
    .single()
  if (error) throw error
  return normalize(data as CatalogItem)
}

export async function createCatalogItems(inputs: CatalogItemInput[], organizationId: string): Promise<number> {
  if (inputs.length === 0) return 0
  const { error, count } = await supabase
    .from('catalog_items')
    .insert(inputs.map((i) => ({ organization_id: organizationId, ...toRow(i) })), { count: 'exact' })
  if (error) throw error
  return count ?? inputs.length
}

export async function updateCatalogItem(id: string, input: CatalogItemInput): Promise<CatalogItem> {
  const { data, error } = await supabase
    .from('catalog_items')
    .update(toRow(input))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return normalize(data as CatalogItem)
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { error } = await supabase.from('catalog_items').delete().eq('id', id)
  if (error) throw error
}
