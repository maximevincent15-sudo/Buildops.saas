import { ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { listTechnicians } from '../../technicians/api'
import { technicianFullName } from '../../technicians/schemas'
import type { Technician } from '../../technicians/schemas'
import {
  createExpense,
  deleteExpenseReceipt,
  uploadExpenseReceipt,
} from '../api'
import type { StoredReceipt } from '../api'
import {
  DEFAULT_VAT_FOR_CATEGORY,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICON,
  EXPENSE_CATEGORY_LABEL,
  VAT_RATES,
  computeHt,
  computeVat,
  formatAmount,
} from '../constants'
import type { ExpenseCategory } from '../constants'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const MAX_SIZE_MB = 10

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ExpenseModal({ open, onClose, onCreated }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [techId, setTechId] = useState('')
  const [spentOn, setSpentOn] = useState(todayIso())
  const [category, setCategory] = useState<ExpenseCategory>('meal')
  const [amountStr, setAmountStr] = useState('')
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_FOR_CATEGORY.meal)
  const [description, setDescription] = useState('')
  const [receipt, setReceipt] = useState<StoredReceipt | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    void listTechnicians().then((list) => {
      if (!alive) return
      const active = list.filter((t) => t.active)
      setTechnicians(active)
      if (active.length > 0 && !techId) setTechId(active[0]!.id)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) {
      // Reset quand on ferme
      setSpentOn(todayIso())
      setCategory('meal')
      setAmountStr('')
      setVatRate(DEFAULT_VAT_FOR_CATEGORY.meal)
      setDescription('')
      setReceipt(null)
      setError(null)
      setTechId('')
    }
  }, [open])

  function handleCategoryChange(next: ExpenseCategory) {
    setCategory(next)
    // Auto-remplit la TVA par défaut (seulement si l'utilisateur n'a pas encore
    // modifié manuellement — en pratique on la ré-applique à chaque changement
    // pour coller au cas le plus fréquent).
    setVatRate(DEFAULT_VAT_FOR_CATEGORY[next])
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.organization_id) return
    setError(null)

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Le fichier dépasse ${MAX_SIZE_MB} MB.`)
      return
    }

    setUploading(true)
    try {
      // Si une photo existe déjà on la supprime
      if (receipt) {
        try { await deleteExpenseReceipt(receipt.path) } catch { /* ignore */ }
      }
      const stored = await uploadExpenseReceipt(file, profile.organization_id)
      setReceipt(stored)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload.")
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleRemoveReceipt() {
    if (!receipt) return
    try {
      await deleteExpenseReceipt(receipt.path)
      setReceipt(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.organization_id) {
      setError('Profil non chargé.')
      return
    }
    const tech = technicians.find((t) => t.id === techId)
    if (!tech) {
      setError('Choisis un technicien.')
      return
    }
    const amount = parseFloat(amountStr.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Montant TTC invalide.')
      return
    }
    if (category === 'other' && !description.trim()) {
      setError('Décris la nature du frais (catégorie "Autre").')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createExpense(
        {
          technician_id: tech.id,
          spent_on: spentOn,
          category,
          amount_ttc: amount,
          vat_rate: vatRate,
          description: description.trim() || undefined,
          receipt_url: receipt?.url,
          receipt_path: receipt?.path,
        },
        profile.organization_id,
        technicianFullName(tech),
      )
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !submitting && !uploading) onClose()
  }

  if (!open) return null

  const amountNum = parseFloat(amountStr.replace(',', '.'))
  const hasValidAmount = Number.isFinite(amountNum) && amountNum > 0
  const ht = hasValidAmount ? computeHt(amountNum, vatRate) : 0
  const tva = hasValidAmount ? computeVat(amountNum, vatRate) : 0

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">Nouvelle note de frais</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="mrow">
            <div className="fg">
              <label>Technicien</label>
              <select value={techId} onChange={(e) => setTechId(e.target.value)}>
                <option value="">— Choisir —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{technicianFullName(t)}</option>
                ))}
              </select>
              {technicians.length === 0 && (
                <span className="text-ink-3 text-xs font-light">
                  Aucun technicien actif. Crée-en un d'abord.
                </span>
              )}
            </div>
            <div className="fg">
              <label>Date de la dépense</label>
              <input
                type="date"
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
                max={todayIso()}
              />
            </div>
          </div>

          <div className="fg">
            <label>Catégorie</label>
            <div className="exp-cat-pills">
              {EXPENSE_CATEGORIES.map((c) => {
                const Icon = EXPENSE_CATEGORY_ICON[c]
                return (
                  <button
                    type="button"
                    key={c}
                    className={`filter-pill${category === c ? ' on' : ''}`}
                    onClick={() => handleCategoryChange(c)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Icon size={13} strokeWidth={2} />
                    {EXPENSE_CATEGORY_LABEL[c]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Montant TTC (€)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 18.50"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
            <div className="fg">
              <label>TVA</label>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                {VAT_RATES.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`filter-pill${vatRate === r ? ' on' : ''}`}
                    onClick={() => setVatRate(r)}
                  >
                    {r === 0 ? 'Sans TVA' : `${r} %`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hasValidAmount && vatRate > 0 && (
            <p className="text-ink-3 text-xs font-light" style={{ margin: '-.5rem 0 0' }}>
              HT : <strong>{formatAmount(ht)}</strong> · TVA : <strong>{formatAmount(tva)}</strong> · TTC : <strong>{formatAmount(amountNum)}</strong>
            </p>
          )}

          <div className="fg">
            <label>
              Description {category === 'other'
                ? <span className="text-red text-xs" style={{ fontWeight: 500 }}>(requis pour "Autre")</span>
                : <span className="text-ink-3 text-xs font-light">(optionnel)</span>}
            </label>
            <input
              type="text"
              placeholder={
                category === 'other'
                  ? 'Décris la nature du frais (obligatoire)'
                  : 'Ex: Déjeuner chantier Valoris, commande Rexel…'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={120}
              autoFocus={category === 'other'}
            />
          </div>

          <div className="fg">
            <label>
              Justificatif <span className="text-ink-3 text-xs font-light">(photo du ticket, facture ou reçu CB — PDF accepté)</span>
            </label>
            {receipt ? (
              <div className="receipt-preview">
                <a href={receipt.url} target="_blank" rel="noreferrer" className="receipt-thumb">
                  {/\.pdf$/i.test(receipt.path) ? (
                    <span className="receipt-pdf">PDF</span>
                  ) : (
                    <img src={receipt.url} alt="Justificatif" />
                  )}
                </a>
                <button
                  type="button"
                  className="receipt-remove"
                  onClick={() => void handleRemoveReceipt()}
                  aria-label="Retirer le justificatif"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="photo-add"
                style={{ width: 'fit-content' }}
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                <ImagePlus size={16} strokeWidth={1.8} />
                <span>{uploading ? 'Envoi…' : 'Ajouter une photo du ticket'}</span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => void handleFileChange(e)}
            />
          </div>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose} disabled={submitting || uploading}>
              Annuler
            </button>
            <button type="submit" className="mf prim" disabled={submitting || uploading || technicians.length === 0}>
              {submitting ? 'Envoi…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
