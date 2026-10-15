import { createCatalogItem, listCatalogItems, updateCatalogItem } from '../../catalogue/api'
import { CATALOG_CATEGORIES } from '../../catalogue/schemas'
import type { CatalogCategory, CatalogItem, CatalogItemInput } from '../../catalogue/schemas'
import { normalizeSearch } from '../../../shared/lib/search'
import type { ImportDefinition, RowAnalysis } from '../types'

const VAT_RATES = [0, 5.5, 10, 20]

/** « 12,50 € » → 12.5 ; null si vide ou illisible */
function parsePrice(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseFloat(value.replace(/[€\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** « 20 % », « 0,2 », « 5.5 » → taux accepté, sinon null */
function parseVat(value: string | null): number | null {
  if (!value) return 20
  let n = Number.parseFloat(value.replace(/[%\s]/g, '').replace(',', '.'))
  if (n > 0 && n < 1) n = Math.round(n * 1000) / 10
  return VAT_RATES.includes(n) ? n : null
}

/** Catégorie tolérante : « Main d'oeuvre », « fournitures », « Déplacement »… */
function parseCategory(value: string | null): CatalogCategory {
  const v = normalizeSearch(value ?? '')
  if (!v) return 'fourniture'
  if (v.startsWith('main') || v.includes('oeuvre') || v.includes('œuvre')) return 'main_oeuvre'
  if (v.startsWith('deplac') || v.startsWith('trajet')) return 'deplacement'
  if (v.startsWith('prest') || v.startsWith('verif') || v.startsWith('service')) return 'prestation'
  if (v.startsWith('fourn') || v.startsWith('mat') || v.startsWith('article')) return 'fourniture'
  return (CATALOG_CATEGORIES as string[]).includes(v) ? (v as CatalogCategory) : 'autre'
}

function toInput(row: Record<string, string | null>): CatalogItemInput {
  return {
    reference: row.reference ?? null,
    label: (row.label ?? '').trim(),
    category: parseCategory(row.category),
    unit: (row.unit ?? '').trim() || 'u',
    unit_price_ht: parsePrice(row.unit_price_ht) ?? 0,
    purchase_price_ht: parsePrice(row.purchase_price_ht),
    vat_rate: parseVat(row.vat_rate) ?? 20,
    notes: row.notes ?? null,
  }
}

/**
 * Import du catalogue d'articles (liste de prix). Dédup par référence si
 * elle est fournie, sinon par désignation (sans accents ni majuscules).
 */
export const catalogImportDefinition: ImportDefinition = {
  entityLabel: 'article',
  entityLabelPlural: 'articles',
  templateFilename: 'catalogue-firovia.xlsx',
  description:
    'Importe ta liste de prix depuis Excel ou CSV : désignation et prix de vente HT sont obligatoires. ' +
    'Catégories acceptées : prestation, fourniture, main-d\'œuvre, déplacement, autre. TVA par défaut : 20 %.',
  fields: [
    { key: 'label', label: 'Désignation', required: true, aliases: ['Libellé', 'Article', 'Description', 'Produit'], example: 'Extincteur CO2 2 kg' },
    { key: 'unit_price_ht', label: 'Prix de vente HT', required: true, aliases: ['Prix HT', 'PU HT', 'Prix unitaire', 'Tarif'], example: '75' },
    { key: 'reference', label: 'Référence', aliases: ['Réf', 'Ref', 'Code', 'Code article'], example: 'EXT-CO2-2' },
    { key: 'category', label: 'Catégorie', aliases: ['Famille', 'Type'], example: 'fourniture' },
    { key: 'unit', label: 'Unité', aliases: ['U', 'Unite'], example: 'u' },
    { key: 'vat_rate', label: 'TVA (%)', aliases: ['TVA', 'Taux TVA'], example: '20' },
    { key: 'purchase_price_ht', label: "Prix d'achat HT", aliases: ['Prix achat', 'PA HT', 'Coût'], example: '42' },
    { key: 'notes', label: 'Notes', example: 'Fournisseur Sicli' },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const label = (row.label ?? '').trim()
    if (!label) return { index: 0, values: row, status: 'invalid', messages: ['Désignation obligatoire'] }
    if (parsePrice(row.unit_price_ht) === null) {
      return { index: 0, values: row, status: 'invalid', messages: [`Prix de vente "${row.unit_price_ht ?? ''}" invalide`] }
    }
    const messages: string[] = []
    if (row.vat_rate && parseVat(row.vat_rate) === null) messages.push(`TVA "${row.vat_rate}" inconnue : 20 % appliqué`)
    if (row.purchase_price_ht && parsePrice(row.purchase_price_ht) === null) messages.push("Prix d'achat illisible : ignoré")

    const cache = context.cache as { byRef?: Map<string, CatalogItem>; byLabel?: Map<string, CatalogItem> }
    if (!cache.byRef || !cache.byLabel) {
      const existing = await listCatalogItems()
      cache.byRef = new Map(existing.filter((i) => i.reference).map((i) => [normalizeSearch(i.reference!), i]))
      cache.byLabel = new Map(existing.map((i) => [normalizeSearch(i.label), i]))
    }
    const found = (row.reference && cache.byRef.get(normalizeSearch(row.reference))) || cache.byLabel.get(normalizeSearch(label))
    if (found) return { index: 0, values: row, status: 'duplicate', messages, existingId: found.id }
    return { index: 0, values: row, status: 'valid', messages }
  },

  async importRow(row, analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    const input = toInput(row)
    if (analysis.status === 'duplicate' && analysis.duplicateAction === 'update' && analysis.existingId) {
      await updateCatalogItem(analysis.existingId, input)
      return 'updated'
    }
    if (analysis.status === 'valid') {
      await createCatalogItem(input, context.organizationId)
      return 'created'
    }
    return 'skipped'
  },
}
