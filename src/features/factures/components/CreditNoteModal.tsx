import { FileMinus2, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { VAT_RATES, computeQuoteTotals, formatAmount } from '../../devis/constants'
import type { QuoteLineInput } from '../../devis/schemas'
import { LineDescriptionField } from '../../devis/components/LineDescriptionField'
import { recipientsForClientId } from '../../clients/recipients'
import { sendDocumentEmail } from '../../email/api'
import { createCreditNote, deleteInvoice, issueInvoice, markInvoiceSent } from '../api'
import { netTotalTtc } from '../constants'
import { buildInvoicePdf, invoiceEmail } from '../documentPdf'
import type { InvoiceWithLines } from '../schemas'

export type CreditNoteIssued = {
  id: string
  reference: string
  /** Mail : parti avec Resend, messagerie ouverte, ou pas envoyé */
  sent: 'resend' | 'mailto' | null
  recipient: string | null
  /** Avoir émis, mais le PDF ou le mail n'a pas abouti */
  warning: string | null
}

type Props = {
  invoice: InvoiceWithLines
  onClose: () => void
  onIssued: (result: CreditNoteIssued) => void
}

const round2 = (n: number) => Math.round(n * 100) / 100

function copyLines(invoice: InvoiceWithLines): QuoteLineInput[] {
  return invoice.lines.map((l, i) => ({
    position: i,
    description: l.description,
    format: l.format ?? null,
    quantity: Number(l.quantity),
    unit_price_ht: Number(l.unit_price_ht),
    vat_rate: Number(l.vat_rate),
  }))
}

/**
 * Reste de la facture après un premier avoir : une ligne par taux de TVA,
 * au prorata, plafonnée au reste créditable.
 */
function balanceLines(invoice: InvoiceWithLines): QuoteLineInput[] {
  const totals = computeQuoteTotals(invoice.lines.map((l) => ({ quantity: Number(l.quantity), unit_price_ht: Number(l.unit_price_ht), vat_rate: Number(l.vat_rate) })))
  const remaining = netTotalTtc(invoice)
  const ratio = totals.total_ttc > 0 ? remaining / totals.total_ttc : 0
  const rates = Object.keys(totals.ht_by_rate).filter((r) => (totals.ht_by_rate[r] ?? 0) !== 0)
  const lines = rates.map((rate, i) => ({
    position: i,
    description: `Solde de la facture ${invoice.reference}${rates.length > 1 ? ` (TVA ${rate.replace('.', ',')} %)` : ''}`,
    quantity: 1,
    unit_price_ht: round2((totals.ht_by_rate[rate] ?? 0) * ratio),
    vat_rate: Number(rate),
  }))
  // Arrondis : ne jamais dépasser le reste
  const last = lines[lines.length - 1]
  if (last && computeQuoteTotals(lines).total_ttc > remaining + 0.01) last.unit_price_ht = round2(last.unit_price_ht - 0.01)
  return lines
}

/**
 * Avoir sur une facture émise : total (toute la facture, ou son solde après
 * un premier avoir) ou partiel (lignes et montants à corriger). Il est créé,
 * numéroté (AV-…) et émis d'un coup, puis son PDF est envoyé au client.
 */
export function CreditNoteModal({ invoice, onClose, onIssued }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const alreadyCredited = Number(invoice.credited_ttc ?? 0)
  const creditable = netTotalTtc(invoice)
  const [mode, setMode] = useState<'total' | 'partial'>('total')
  const [lines, setLines] = useState<QuoteLineInput[]>(() => (alreadyCredited > 0 ? balanceLines(invoice) : copyLines(invoice)))
  const [reason, setReason] = useState('')
  const [recipients, setRecipients] = useState<string[]>([])
  const [sendMail, setSendMail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void recipientsForClientId(invoice.client_id, 'invoices', invoice.client_email ?? '')
      .then((list) => { if (alive) setRecipients(list) })
      .catch(() => { /* pas de destinataire : envoi manuel */ })
    return () => { alive = false }
  }, [invoice.client_id, invoice.client_email])

  const totals = useMemo(() => computeQuoteTotals(lines.map((l) => ({ quantity: l.quantity, unit_price_ht: l.unit_price_ht, vat_rate: l.vat_rate }))), [lines])
  const tooMuch = totals.total_ttc > creditable + 0.01
  const editable = mode === 'partial'

  function chooseMode(next: 'total' | 'partial') {
    setMode(next)
    setError(null)
    if (next === 'total') setLines(alreadyCredited > 0 ? balanceLines(invoice) : copyLines(invoice))
  }

  function updateLine(index: number, patch: Partial<QuoteLineInput>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  async function handleIssue() {
    if (!profile?.organization_id) return
    const clean = lines.filter((l) => l.description.trim() && l.quantity * l.unit_price_ht !== 0)
    if (clean.length === 0 || totals.total_ttc <= 0) {
      setError('L\'avoir doit avoir au moins une ligne avec un montant.')
      return
    }
    if (tooMuch) {
      setError(`L'avoir dépasse le reste de la facture (${formatAmount(creditable)} TTC).`)
      return
    }
    setBusy(true)
    setError(null)

    // 1. Création en brouillon puis émission (numéro AV-… attribué par la base)
    let noteId: string | null = null
    let reference = ''
    try {
      const draft = await createCreditNote(invoice, clean.map((l, i) => ({ ...l, position: i })), reason)
      noteId = draft.id
      reference = (await issueInvoice(draft.id)).reference
    } catch (e) {
      if (noteId) await deleteInvoice(noteId).catch(() => { /* brouillon resté : supprimable depuis la liste */ })
      setError(e instanceof Error ? e.message : 'Émission de l\'avoir impossible.')
      setBusy(false)
      return
    }

    // 2. PDF au numéro définitif, puis envoi au client
    const orgName = profile.organizations?.name ?? 'Maintenance'
    const recipient = recipients.join(', ')
    let sent: CreditNoteIssued['sent'] = null
    let warning: string | null = null
    try {
      const { doc, url, credited } = await buildInvoicePdf(noteId, profile.organization_id, orgName)
      if (sendMail && recipient) {
        const { subject, body } = invoiceEmail(doc, orgName, url, credited)
        const result = await sendDocumentEmail({ kind: 'invoice', documentId: noteId, recipientEmail: recipient, subject, body, pdfUrl: url })
        if (result.mode !== 'error') {
          await markInvoiceSent(noteId, recipient)
          sent = result.mode
        }
      }
    } catch {
      warning = 'L\'avoir est émis, mais son PDF ou son envoi n\'a pas abouti : ouvrez-le dans la liste des factures pour réessayer.'
    }
    onIssued({ id: noteId, reference, sent, recipient: sent ? recipient : null, warning })
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !busy) onClose()
  }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileMinus2 size={16} strokeWidth={2} /> Avoir sur la facture {invoice.reference}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={busy}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="text-ink-2 text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
            Un avoir annule tout ou partie d'une facture émise. Il reçoit son propre numéro (AV-…) à l'émission
            et ne se modifie plus ensuite. Facture : <strong>{formatAmount(Number(invoice.total_ttc))} TTC</strong>
            {alreadyCredited > 0 && <> · déjà crédité : <strong>{formatAmount(alreadyCredited)}</strong> · reste : <strong>{formatAmount(creditable)}</strong></>}
          </p>

          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className={`filter-pill${mode === 'total' ? ' on' : ''}`} onClick={() => chooseMode('total')} disabled={busy}>
              {alreadyCredited > 0 ? `Solde de la facture (${formatAmount(creditable)})` : `Avoir total (${formatAmount(creditable)})`}
            </button>
            <button type="button" className={`filter-pill${mode === 'partial' ? ' on' : ''}`} onClick={() => chooseMode('partial')} disabled={busy}>
              Avoir partiel
            </button>
          </div>
          <p className="text-ink-3 text-xs font-light" style={{ margin: '-.4rem 0 0', lineHeight: 1.5 }}>
            {mode === 'total'
              ? 'La facture sera annulée par cet avoir. Pour la refaire corrigée, utilisez ensuite « Dupliquer » sur la facture.'
              : 'Gardez seulement ce qu\'il faut rembourser ou déduire : baissez une quantité, un prix, retirez des lignes, ou ajoutez une ligne (geste commercial…). Le reste dû de la facture baisse d\'autant.'}
          </p>

          <div className="quote-lines">
            <div className="quote-line-header">
              <div className="ql-desc">Description</div>
              <div className="ql-qty">Qté</div>
              <div className="ql-pu">PU HT</div>
              <div className="ql-vat">TVA</div>
              <div className="ql-tot">Total HT</div>
              <div className="ql-act"></div>
            </div>
            {lines.map((line, i) => (
              <div className="quote-line" key={i}>
                <div className="ql-desc">
                  {editable ? (
                    <LineDescriptionField
                      placeholder="Description"
                      value={line.description}
                      format={line.format}
                      onChange={(description) => updateLine(i, { description })}
                      onFocusPart={() => { /* pas de barre de mise en forme ici */ }}
                    />
                  ) : (
                    <span style={{ whiteSpace: 'pre-line', fontSize: 13 }}>{line.description}</span>
                  )}
                </div>
                <div className="ql-qty">
                  {editable
                    ? <input type="number" step="0.01" min="0" value={line.quantity} onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })} />
                    : <span>{line.quantity}</span>}
                </div>
                <div className="ql-pu">
                  {editable
                    ? <input type="number" step="0.01" min="0" value={line.unit_price_ht} onChange={(e) => updateLine(i, { unit_price_ht: parseFloat(e.target.value) || 0 })} />
                    : <span>{formatAmount(line.unit_price_ht)}</span>}
                </div>
                <div className="ql-vat">
                  {editable ? (
                    <select value={line.vat_rate} onChange={(e) => updateLine(i, { vat_rate: parseFloat(e.target.value) })}>
                      {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  ) : <span>{line.vat_rate}%</span>}
                </div>
                <div className="ql-tot">{formatAmount(line.quantity * line.unit_price_ht)}</div>
                <div className="ql-act">
                  {editable && lines.length > 1 && (
                    <button type="button" className="ql-remove" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} aria-label="Retirer cette ligne">
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {editable && (
              <button
                type="button"
                className="quote-add-line"
                onClick={() => setLines((prev) => [...prev, { position: prev.length, description: '', quantity: 1, unit_price_ht: 0, vat_rate: prev[0]?.vat_rate ?? 20 }])}
              >
                <Plus size={13} strokeWidth={2} /> Ajouter une ligne
              </button>
            )}
          </div>

          <div className="quote-totals">
            <div className="quote-total-row"><span>Total HT de l'avoir</span><strong>{formatAmount(totals.total_ht)}</strong></div>
            {Object.entries(totals.vat_by_rate).map(([rate, vat]) => (
              <div key={rate} className="quote-total-row vat"><span>TVA {rate}%</span><span>{formatAmount(vat)}</span></div>
            ))}
            <div className="quote-total-row grand"><span>Total TTC de l'avoir</span><strong>{formatAmount(totals.total_ttc)}</strong></div>
          </div>
          {tooMuch && <span className="ferr on">L'avoir dépasse le reste de la facture ({formatAmount(creditable)} TTC).</span>}

          <div className="fg">
            <label>Motif <span className="text-ink-3 text-xs font-light">(imprimé sur l'avoir)</span></label>
            <textarea
              className="report-textarea"
              style={{ minHeight: 64 }}
              placeholder="Ex : erreur de quantité, prestation non réalisée, geste commercial…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: recipients.length ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={sendMail && recipients.length > 0} disabled={recipients.length === 0 || busy} onChange={(e) => setSendMail(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              {recipients.length > 0
                ? <>Envoyer l'avoir au client par mail ({recipients.join(', ')})</>
                : 'Pas d\'email sur la fiche client : téléchargez le PDF de l\'avoir pour l\'envoyer vous-même.'}
            </span>
          </label>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose} disabled={busy}>Annuler</button>
            <button type="button" className="mf prim" onClick={() => void handleIssue()} disabled={busy || tooMuch || totals.total_ttc <= 0}>
              {busy ? 'Émission…' : `Émettre l'avoir de ${formatAmount(totals.total_ttc)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
