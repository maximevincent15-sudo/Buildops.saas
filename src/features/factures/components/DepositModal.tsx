import { Coins } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { formatAmount } from '../../devis/constants'
import { createDepositInvoice, listQuoteDeposits } from '../api'
import type { QuoteDeposit } from '../api'
import { displayReference } from '../constants'

type Props = {
  quoteId: string
  quoteReference: string
  /** Total TTC du devis */
  quoteTotalTtc: number
  organizationId: string
  onClose: () => void
  /** Brouillon d'acompte créé : à ouvrir dans Factures */
  onCreated: (invoiceId: string) => void
}

const PRESETS = [30, 40, 50]

/**
 * Facture d'acompte sur un devis accepté : un pourcentage ou un montant TTC.
 * Elle est déduite automatiquement de la facture finale (« Transformer en
 * facture »).
 */
export function DepositModal({ quoteId, quoteReference, quoteTotalTtc, organizationId, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [percent, setPercent] = useState('30')
  const [amount, setAmount] = useState('')
  const [deposits, setDeposits] = useState<QuoteDeposit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void listQuoteDeposits(quoteId).then((list) => { if (alive) setDeposits(list) }).catch(() => { /* liste indicative */ })
    return () => { alive = false }
  }, [quoteId])

  // Acomptes déjà demandés (hors annulés), avoirs déduits
  const already = deposits
    .filter((d) => d.status !== 'cancelled')
    .reduce((s, d) => s + Number(d.total_ttc) - Number(d.credited_ttc ?? 0), 0)
  const left = Math.max(0, quoteTotalTtc - already)
  const pct = parseFloat(percent.replace(',', '.'))
  const amt = parseFloat(amount.replace(',', '.'))
  const ttc = mode === 'percent' ? (Number.isFinite(pct) ? Math.round(quoteTotalTtc * pct) / 100 : 0) : (Number.isFinite(amt) ? amt : 0)
  const tooMuch = ttc > left + 0.01

  async function create() {
    if (!(ttc > 0)) {
      setError('Indiquez un pourcentage ou un montant supérieur à zéro.')
      return
    }
    if (tooMuch) {
      setError(`L'acompte dépasse ce qui reste du devis (${formatAmount(left)} TTC).`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const invoice = await createDepositInvoice(
        quoteId,
        organizationId,
        mode === 'percent' ? { percent: pct } : { amountTtc: amt },
      )
      onCreated(invoice.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible.')
      setBusy(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !busy) onClose()
  }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Coins size={16} strokeWidth={2} /> Facture d'acompte
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={busy}>×</button>
        </div>

        <p className="text-ink-2 text-sm" style={{ margin: '0 0 .9rem', lineHeight: 1.5 }}>
          Devis <strong>{quoteReference}</strong> : {formatAmount(quoteTotalTtc)} TTC. L'acompte sera déduit
          automatiquement de la facture finale (« Transformer en facture »).
        </p>

        {deposits.length > 0 && (
          <div className="text-sm" style={{ background: 'var(--bg2, #F1F3F6)', borderRadius: 8, padding: '8px 12px', marginBottom: '.9rem', lineHeight: 1.6 }}>
            Déjà demandé :{' '}
            {deposits.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <strong>{displayReference(d)}</strong> ({formatAmount(Number(d.total_ttc))}
                {d.status === 'cancelled' ? ', annulé' : d.deducted_in ? `, déduit de ${d.deducted_in}` : d.status === 'draft' ? ', brouillon' : ''})
              </span>
            ))}
            {' '}· reste : <strong>{formatAmount(left)}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.8rem' }}>
          <button type="button" className={`filter-pill${mode === 'percent' ? ' on' : ''}`} onClick={() => setMode('percent')} disabled={busy}>Pourcentage</button>
          <button type="button" className={`filter-pill${mode === 'amount' ? ' on' : ''}`} onClick={() => setMode('amount')} disabled={busy}>Montant</button>
        </div>

        {mode === 'percent' ? (
          <div className="fg">
            <label>Pourcentage du devis</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" inputMode="decimal" min="1" max="100" step="1" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ width: 110 }} />
              <span className="text-ink-2">%</span>
              {PRESETS.map((p) => (
                <button key={p} type="button" className="btn-sm" onClick={() => setPercent(String(p))} disabled={busy}>{p} %</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="fg">
            <label>Montant de l'acompte (€ TTC)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} placeholder="Ex : 500" onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}

        <p className={`text-sm ${tooMuch ? 'text-red' : 'text-ink-2'}`} style={{ margin: '.6rem 0 0' }}>
          {ttc > 0
            ? tooMuch
              ? `L'acompte dépasse ce qui reste du devis (${formatAmount(left)} TTC).`
              : <>Facture d'acompte de <strong>{formatAmount(ttc)} TTC</strong>, payable à réception, répartie par taux de TVA comme le devis.</>
            : ' '}
        </p>

        {error && <span className="ferr on" style={{ display: 'block', marginTop: 8 }}>{error}</span>}

        <div className="modal-foot" style={{ marginTop: '1rem' }}>
          <button type="button" className="mf out" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className="mf prim" onClick={() => void create()} disabled={busy || !(ttc > 0) || tooMuch}>
            {busy ? 'Création…' : 'Créer la facture d\'acompte'}
          </button>
        </div>
      </div>
    </div>
  )
}
