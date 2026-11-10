import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { formatAmount } from '../../devis/constants'
import { PAYMENT_METHODS } from '../constants'

export type PaymentInput = { amount: number; method: string; reference: string; paidOn: string }

type Props = {
  reference: string
  /** Reste à payer (avoirs et règlements déjà déduits) */
  remaining: number
  onClose: () => void
  onSave: (payment: PaymentInput) => Promise<void>
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Règlement reçu : montant (le reste dû par défaut), date, mode et référence */
export function PaymentModal({ reference, remaining, onClose, onSave }: Props) {
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [paidOn, setPaidOn] = useState(todayIso())
  const [method, setMethod] = useState('virement')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = parseFloat(amount.replace(',', '.'))
  const valid = Number.isFinite(value) && value > 0
  const tooMuch = valid && value > remaining + 0.005
  const settles = valid && value >= remaining - 0.005

  async function save() {
    if (!valid) {
      setError('Indiquez un montant supérieur à zéro.')
      return
    }
    if (!paidOn || paidOn > todayIso()) {
      setError('La date du règlement ne peut pas être dans le futur.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({ amount: Math.min(value, remaining), method, reference: ref.trim(), paidOn })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
      setBusy(false)
    }
  }

  return (
    <div className="overlay open">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} strokeWidth={2} /> Règlement reçu
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={busy}>×</button>
        </div>

        <p className="text-ink-2 text-sm" style={{ margin: '0 0 1rem' }}>
          Facture <strong>{reference}</strong> · reste à payer : <strong>{formatAmount(remaining)}</strong>
        </p>

        <div className="mrow">
          <div className="fg">
            <label>Montant reçu (€)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="fg">
            <label>Date du règlement</label>
            <input type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        </div>
        <div className="mrow">
          <div className="fg">
            <label>Mode</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Référence <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
            <input
              type="text"
              placeholder={method === 'cheque' ? 'N° de chèque' : 'Libellé du virement…'}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          </div>
        </div>

        <p className={`text-sm ${tooMuch ? 'text-red' : 'text-ink-3'}`} style={{ margin: '.2rem 0 0' }}>
          {!valid
            ? ' '
            : tooMuch
              ? `Le montant dépasse le reste à payer : seuls ${formatAmount(remaining)} seront enregistrés.`
              : settles
                ? 'La facture sera soldée.'
                : `Il restera ${formatAmount(remaining - value)} à payer.`}
        </p>

        {error && <span className="ferr on" style={{ display: 'block', marginTop: 8 }}>{error}</span>}

        <div className="modal-foot" style={{ marginTop: '1rem' }}>
          <button type="button" className="mf out" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className="mf prim" onClick={() => void save()} disabled={busy || !valid}>
            {busy ? 'Enregistrement…' : 'Enregistrer le règlement'}
          </button>
        </div>
      </div>
    </div>
  )
}
