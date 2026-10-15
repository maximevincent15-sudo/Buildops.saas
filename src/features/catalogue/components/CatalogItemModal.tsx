import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { VAT_RATES, formatAmount } from '../../devis/constants'
import { createCatalogItem, deleteCatalogItem, updateCatalogItem } from '../api'
import { CATALOG_CATEGORIES, CATALOG_CATEGORY_LABELS, CATALOG_UNITS, marginRate } from '../schemas'
import type { CatalogCategory, CatalogItem, CatalogItemInput } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onChanged: () => void
  item: CatalogItem | null
}

type FormState = {
  reference: string
  label: string
  category: CatalogCategory
  unit: string
  unit_price_ht: string
  purchase_price_ht: string
  vat_rate: number
  notes: string
  active: boolean
}

function toForm(item: CatalogItem | null): FormState {
  return {
    reference: item?.reference ?? '',
    label: item?.label ?? '',
    category: item?.category ?? 'fourniture',
    unit: item?.unit ?? 'u',
    unit_price_ht: item ? String(item.unit_price_ht) : '',
    purchase_price_ht: item?.purchase_price_ht != null ? String(item.purchase_price_ht) : '',
    vat_rate: item?.vat_rate ?? 20,
    notes: item?.notes ?? '',
    active: item?.active ?? true,
  }
}

/** Accepte « 12,50 » comme « 12.50 » ; null si vide ou invalide */
function parseAmount(text: string): number | null {
  const n = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function CatalogItemModal({ open, onClose, onChanged, item }: Props) {
  const organizationId = useAuthStore((s) => s.profile?.organization_id)
  const [form, setForm] = useState<FormState>(() => toForm(item))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = item !== null

  if (!open) return null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const price = parseAmount(form.unit_price_ht)
  const purchase = parseAmount(form.purchase_price_ht)
  const margin = price !== null ? marginRate({ unit_price_ht: price, purchase_price_ht: purchase }) : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.label.trim()) { setError('La désignation est obligatoire.'); return }
    if (price === null) { setError('Prix de vente HT invalide.'); return }
    if (form.purchase_price_ht.trim() && purchase === null) { setError("Prix d'achat HT invalide."); return }
    const input: CatalogItemInput = {
      reference: form.reference,
      label: form.label,
      category: form.category,
      unit: form.unit,
      unit_price_ht: price,
      purchase_price_ht: purchase,
      vat_rate: form.vat_rate,
      notes: form.notes,
      active: form.active,
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) await updateCatalogItem(item.id, input)
      else if (organizationId) await createCatalogItem(input, organizationId)
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!item || !window.confirm(`Supprimer « ${item.label} » du catalogue ?\n\nLes devis et factures déjà créés ne sont pas modifiés.`)) return
    setSaving(true)
    try {
      await deleteCatalogItem(item.id)
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !saving) onClose()
  }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">{isEdit ? `Article : ${item.label}` : 'Nouvel article'}</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="fg">
            <label>Désignation (telle qu'elle apparaîtra sur le devis)</label>
            <input
              type="text"
              placeholder="Ex : Extincteur CO2 2 kg"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              autoFocus
            />
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Catégorie</label>
              <select value={form.category} onChange={(e) => set('category', e.target.value as CatalogCategory)}>
                {CATALOG_CATEGORIES.map((c) => <option key={c} value={c}>{CATALOG_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Référence (optionnel)</label>
              <input type="text" placeholder="Ex : EXT-CO2-2" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Prix de vente HT (€)</label>
              <input type="text" inputMode="decimal" placeholder="Ex : 75" value={form.unit_price_ht} onChange={(e) => set('unit_price_ht', e.target.value)} />
            </div>
            <div className="fg">
              <label>Unité</label>
              <select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                {Array.from(new Set([...CATALOG_UNITS, form.unit])).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>TVA</label>
              <select value={form.vat_rate} onChange={(e) => set('vat_rate', Number(e.target.value))}>
                {VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
              </select>
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Prix d'achat HT (optionnel, pour la marge)</label>
              <input type="text" inputMode="decimal" placeholder="Ex : 42" value={form.purchase_price_ht} onChange={(e) => set('purchase_price_ht', e.target.value)} />
            </div>
            <div className="fg">
              <label>Marge</label>
              <div className="text-sm" style={{ padding: '.55rem 0', color: margin !== null && margin < 0 ? 'var(--red)' : 'var(--ink2)' }}>
                {margin === null
                  ? '—'
                  : `${margin.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % (${formatAmount((price ?? 0) - (purchase ?? 0))} par ${form.unit})`}
              </div>
            </div>
          </div>

          <div className="fg">
            <label>Notes internes (optionnel)</label>
            <input type="text" placeholder="Ex : fournisseur, délai…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {isEdit && (
            <label className="text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Article proposé dans les devis et factures
            </label>
          )}

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            {isEdit && (
              <button
                type="button"
                className="mf del"
                onClick={() => void handleDelete()}
                disabled={saving}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={14} strokeWidth={1.8} /> Supprimer
              </button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="mf prim" disabled={saving}>
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : "Ajouter l'article"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
