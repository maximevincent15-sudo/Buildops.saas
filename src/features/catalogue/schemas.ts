// Types miroir de la table public.catalog_items
// (migration 20261014150000_catalog_items.sql).

export type CatalogCategory = 'fourniture' | 'prestation' | 'main_oeuvre' | 'deplacement' | 'autre'

export const CATALOG_CATEGORIES: CatalogCategory[] = ['prestation', 'fourniture', 'main_oeuvre', 'deplacement', 'autre']

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  prestation: 'Prestation (vérification, recharge…)',
  fourniture: 'Fourniture (matériel)',
  main_oeuvre: "Main-d'œuvre",
  deplacement: 'Déplacement',
  autre: 'Autre',
}

/** Libellé court pour les badges et les listes */
export const CATALOG_CATEGORY_SHORT: Record<CatalogCategory, string> = {
  prestation: 'Prestation',
  fourniture: 'Fourniture',
  main_oeuvre: "Main-d'œuvre",
  deplacement: 'Déplacement',
  autre: 'Autre',
}

export const CATALOG_UNITS = ['u', 'h', 'forfait', 'ml', 'm²', 'kg', 'lot'] as const

export type CatalogItem = {
  id: string
  organization_id: string
  reference: string | null
  label: string
  category: CatalogCategory
  unit: string
  unit_price_ht: number
  purchase_price_ht: number | null
  vat_rate: number
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export type CatalogItemInput = {
  reference?: string | null
  label: string
  category: CatalogCategory
  unit: string
  unit_price_ht: number
  purchase_price_ht?: number | null
  vat_rate: number
  notes?: string | null
  active?: boolean
}

/** Marge brute en % du prix de vente (null si le prix d'achat est inconnu) */
export function marginRate(item: Pick<CatalogItem, 'unit_price_ht' | 'purchase_price_ht'>): number | null {
  if (item.purchase_price_ht == null || item.unit_price_ht <= 0) return null
  return ((item.unit_price_ht - item.purchase_price_ht) / item.unit_price_ht) * 100
}
