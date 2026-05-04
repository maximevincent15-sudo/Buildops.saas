import { Ban, CheckCircle2, Download, Edit3, FileText, Mail, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { VAT_RATES, computeQuoteTotals, formatAmount } from '../../devis/constants'
import type { QuoteLineInput } from '../../devis/schemas'
import { getInvoicingSettings } from '../../parametres/api'
import { ClientAutocomplete } from '../../planning/components/ClientAutocomplete'
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  getInvoice,
  markInvoiceSent,
  recordPayment,
  resetInvoicePayment,
  setInvoicePdfUrl,
  updateInvoice,
} from '../api'
import {
  INVOICE_STATUS_LABEL,
  defaultDueDate,
  effectiveStatus,
} from '../constants'
import type { InvoiceStatus } from '../constants'
import type { InvoiceWithLines, UpsertInvoiceInput } from '../schemas'
import { generateAndUploadInvoicePdf } from '../pdf/generateInvoicePdf'
import { InvoicePdf } from '../pdf/InvoicePdf'
import { sendDocumentEmail } from '../../email/api'

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: (invoiceId: string) => void
  invoiceId?: string | null
  seed?: Partial<UpsertInvoiceInput>
}

const EMPTY_LINE: QuoteLineInput = {
  position: 0,
  description: '',
  quantity: 1,
  unit_price_ht: 0,
  vat_rate: 20,
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function InvoiceModal({ open, onClose, onSaved, invoiceId, seed }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const isEdit = !!invoiceId

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Form
  const [reference, setReference] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [issueDate, setIssueDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState(defaultDueDate(todayIso()))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<QuoteLineInput[]>([{ ...EMPTY_LINE }])

  // Workflow
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [paidAt, setPaidAt] = useState<string | null>(null)
  const [amountPaid, setAmountPaid] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [paymentRef, setPaymentRef] = useState<string | null>(null)
  const [totalTtc, setTotalTtc] = useState(0)

  // Hydratation
  useEffect(() => {
    if (!open) return
    setError(null)
    setFlash(null)
    if (isEdit && invoiceId) {
      setLoading(true)
      void getInvoice(invoiceId)
        .then((inv) => {
          if (!inv) {
            setError('Facture introuvable')
            return
          }
          setReference(inv.reference)
          setClientName(inv.client_name)
          setClientId(inv.client_id ?? '')
          setClientContact(inv.client_contact_name ?? '')
          setClientEmail(inv.client_email ?? '')
          setClientAddress(inv.client_address ?? '')
          setSiteName(inv.site_name ?? '')
          setSiteAddress(inv.site_address ?? '')
          setIssueDate(inv.issue_date)
          setDueDate(inv.due_date ?? defaultDueDate(inv.issue_date))
          setNotes(inv.notes ?? '')
          setLines(
            inv.lines.length > 0
              ? inv.lines.map((l) => ({
                  id: l.id,
                  position: l.position,
                  description: l.description,
                  quantity: Number(l.quantity),
                  unit_price_ht: Number(l.unit_price_ht),
                  vat_rate: Number(l.vat_rate),
                }))
              : [{ ...EMPTY_LINE }],
          )
          setStatus(inv.status)
          setPdfUrl(inv.pdf_url ?? null)
          setSentAt(inv.sent_at ?? null)
          setPaidAt(inv.paid_at ?? null)
          setAmountPaid(Number(inv.amount_paid ?? 0))
          setPaymentMethod(inv.payment_method ?? null)
          setPaymentRef(inv.payment_reference ?? null)
          setTotalTtc(Number(inv.total_ttc ?? 0))
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
        .finally(() => setLoading(false))
    } else {
      // Mode création
      setReference('')
      setClientName(seed?.client_name ?? '')
      setClientId(seed?.client_id ?? '')
      setClientContact(seed?.client_contact_name ?? '')
      setClientEmail(seed?.client_email ?? '')
      setClientAddress(seed?.client_address ?? '')
      setSiteName(seed?.site_name ?? '')
      setSiteAddress(seed?.site_address ?? '')
      const initIssue = seed?.issue_date ?? todayIso()
      setIssueDate(initIssue)
      setDueDate(seed?.due_date ?? defaultDueDate(initIssue))
      setNotes(seed?.notes ?? '')
      setLines(seed?.lines && seed.lines.length > 0 ? seed.lines : [{ ...EMPTY_LINE }])
      setStatus('draft')
      setPdfUrl(null)
      setSentAt(null)
      setPaidAt(null)
      setAmountPaid(0)
      setPaymentMethod(null)
      setPaymentRef(null)
      setTotalTtc(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId])

  function updateLine(index: number, patch: Partial<QuoteLineInput>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE, position: prev.length }])
  }

  function removeLine(index: number) {
    setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  const totals = computeQuoteTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unit_price_ht: l.unit_price_ht,
      vat_rate: l.vat_rate,
    })),
  )

  // Statut effectif (pour gérer le 'overdue' calculé en runtime)
  const displayStatus = effectiveStatus(status, dueDate || null, amountPaid, totalTtc)
  const remaining = Math.max(0, totalTtc - amountPaid)

  async function handleSubmit() {
    if (!profile?.organization_id) {
      setError('Profil non chargé.')
      return
    }
    if (!clientName.trim()) {
      setError('Le nom du client est requis.')
      return
    }
    const cleanLines = lines.filter((l) => l.description.trim())
    if (cleanLines.length === 0) {
      setError('Au moins une ligne avec description requise.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const input: UpsertInvoiceInput = {
        client_id: clientId || undefined,
        client_name: clientName.trim(),
        client_contact_name: clientContact || undefined,
        client_email: clientEmail || undefined,
        client_address: clientAddress || undefined,
        site_name: siteName || undefined,
        site_address: siteAddress || undefined,
        issue_date: issueDate,
        due_date: dueDate || undefined,
        notes: notes || undefined,
        lines: cleanLines.map((l, i) => ({ ...l, position: i })),
      }
      let savedId: string
      if (isEdit && invoiceId) {
        await updateInvoice(invoiceId, input)
        savedId = invoiceId
      } else {
        const created = await createInvoice(input, profile.organization_id)
        savedId = created.id
      }
      onSaved?.(savedId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!invoiceId) return
    if (!window.confirm('Supprimer cette facture définitivement ?\n\n⚠️ En fiscalité française, supprimer une facture émise crée un trou dans la numérotation. Préfère "Annuler" pour conserver la trace.')) return
    setDeleting(true)
    try {
      await deleteInvoice(invoiceId)
      onSaved?.('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDeleting(false)
    }
  }

  async function handleGeneratePdf() {
    if (!invoiceId || !profile?.organization_id) return
    setGeneratingPdf(true)
    setError(null)
    setFlash(null)
    try {
      const fresh = await getInvoice(invoiceId)
      if (!fresh) throw new Error('Facture introuvable')
      const settings = await getInvoicingSettings(profile.organization_id)
      const orgName = profile.organizations?.name ?? 'Maintenance'
      const element = (
        <InvoicePdf invoice={fresh as InvoiceWithLines} organizationName={orgName} settings={settings} />
      )
      const url = await generateAndUploadInvoicePdf(
        element,
        profile.organization_id,
        invoiceId,
        fresh.reference,
      )
      await setInvoicePdfUrl(invoiceId, url)
      setPdfUrl(url)
      setFlash('PDF généré.')
      setTimeout(() => setFlash(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur PDF')
    } finally {
      setGeneratingPdf(false)
    }
  }

  async function handleMarkSent() {
    if (!invoiceId) return
    const recipient = clientEmail.trim() || window.prompt('Email du client à enregistrer :') || ''
    if (!recipient) {
      setError('Email du client requis.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setError('Email invalide.')
      return
    }
    try {
      await markInvoiceSent(invoiceId, recipient)
      setStatus('sent')
      setSentAt(new Date().toISOString())

      const subject = `Facture ${reference}`.trim()
      const orgName = profile?.organizations?.name ?? 'Maintenance'
      const greet = clientContact ? `Bonjour ${clientContact.trim()},` : 'Bonjour,'
      const dueLine = dueDate
        ? `\n\nÉchéance de paiement : ${new Date(dueDate).toLocaleDateString('fr-FR')}.`
        : ''
      const totalsLine = `Montant à régler : ${formatAmount(totals.total_ttc)} TTC.${dueLine}`
      const pdfLine = pdfUrl
        ? `\n\n📄 La facture est jointe à ce mail (ou téléchargeable ici : ${pdfUrl})`
        : `\n\n(Le PDF est disponible sur demande.)`
      const body =
        `${greet}\n\nVeuillez trouver ci-après la facture pour la prestation réalisée.\n\n${totalsLine}${pdfLine}\n\nN'hésite pas à me contacter pour toute question.\n\nCordialement,\n${orgName}`

      // Tente Resend, fallback mailto:
      const result = await sendDocumentEmail({
        kind: 'invoice',
        documentId: invoiceId,
        recipientEmail: recipient,
        subject,
        body,
        pdfUrl,
      })

      if (result.mode === 'resend') {
        setFlash('Facture envoyée automatiquement avec PDF en pièce jointe ✓')
      } else {
        setFlash('Facture marquée comme envoyée.')
      }
      setTimeout(() => setFlash(null), 3000)
      onSaved?.(invoiceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleRecordPayment() {
    if (!invoiceId) return
    const remainingNow = totalTtc - amountPaid
    const amountStr = window.prompt(
      `Montant du règlement reçu (€) ?\n\nReste à payer : ${formatAmount(remainingNow)}`,
      remainingNow.toFixed(2),
    )
    if (amountStr === null) return
    const amount = parseFloat(amountStr.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Montant invalide.')
      return
    }
    const method = window.prompt(
      'Mode de règlement ?\n(virement, chèque, CB, espèces, prélèvement, autre)',
      'virement',
    ) ?? ''
    const ref = window.prompt('Référence (n° chèque, libellé virement, optionnel) :', '') ?? ''
    try {
      await recordPayment(invoiceId, amount, method, ref || null)
      const newPaid = Math.min(totalTtc, amountPaid + amount)
      setAmountPaid(newPaid)
      setPaymentMethod(method || null)
      setPaymentRef(ref || null)
      if (newPaid >= totalTtc - 0.01) {
        setStatus('paid')
        setPaidAt(new Date().toISOString())
        setFlash(`Règlement enregistré ✅ Facture soldée.`)
      } else {
        setStatus('partially_paid')
        setFlash(`Règlement enregistré. Reste : ${formatAmount(totalTtc - newPaid)}.`)
      }
      setTimeout(() => setFlash(null), 4000)
      onSaved?.(invoiceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleResetPayment() {
    if (!invoiceId) return
    if (!window.confirm('Annuler les règlements et remettre la facture en "Envoyée" ?')) return
    try {
      await resetInvoicePayment(invoiceId, sentAt ? 'sent' : 'draft')
      setStatus(sentAt ? 'sent' : 'draft')
      setAmountPaid(0)
      setPaidAt(null)
      setPaymentMethod(null)
      setPaymentRef(null)
      onSaved?.(invoiceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleCancel() {
    if (!invoiceId) return
    const reason = window.prompt('Raison de l\'annulation (visible en interne) ?', '')
    if (reason === null) return
    try {
      await cancelInvoice(invoiceId, reason)
      setStatus('cancelled')
      setFlash('Facture annulée.')
      setTimeout(() => setFlash(null), 2500)
      onSaved?.(invoiceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !submitting && !deleting) onClose()
  }

  if (!open) return null

  const anyLoading = submitting || deleting || loading

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 920 }}>
        <div className="modal-head">
          <span className="modal-title">
            {isEdit ? `Facture ${reference || ''}`.trim() : 'Nouvelle facture'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {loading ? (
          <p className="text-ink-2 text-sm">Chargement…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Client */}
            <div className="card-section">
              <div className="card-section-title">Client</div>
              <div className="mrow">
                <div className="fg">
                  <label>Nom du client</label>
                  <ClientAutocomplete
                    value={clientName}
                    onChange={(name, c) => {
                      setClientName(name)
                      setClientId(c?.id ?? '')
                      if (c) {
                        if (c.contact_name && !clientContact) setClientContact(c.contact_name)
                        if (c.contact_email && !clientEmail) setClientEmail(c.contact_email)
                        if (c.address && !clientAddress) setClientAddress(c.address)
                      }
                    }}
                    placeholder="Tape le nom du client"
                  />
                </div>
                <div className="fg">
                  <label>Contact</label>
                  <input
                    type="text"
                    placeholder="M. Dupont"
                    value={clientContact}
                    onChange={(e) => setClientContact(e.target.value)}
                  />
                </div>
              </div>
              <div className="mrow">
                <div className="fg">
                  <label>Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label>Adresse de facturation</label>
                  <input
                    type="text"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Site */}
            <div className="card-section">
              <div className="card-section-title">Lieu d'intervention <span className="text-ink-3 text-xs font-light">(si différent)</span></div>
              <div className="mrow">
                <div className="fg">
                  <label>Site</label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label>Adresse du site</label>
                  <input
                    type="text"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="mrow">
              <div className="fg">
                <label>Date d'émission</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    setIssueDate(e.target.value)
                    // Recalcule l'échéance si elle était laissée à default
                    if (e.target.value) setDueDate(defaultDueDate(e.target.value))
                  }}
                />
              </div>
              <div className="fg">
                <label>Échéance de paiement</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Lignes */}
            <div className="card-section">
              <div className="card-section-title">Lignes de la facture</div>
              <div className="quote-lines">
                <div className="quote-line-header">
                  <div className="ql-desc">Description</div>
                  <div className="ql-qty">Qté</div>
                  <div className="ql-pu">PU HT</div>
                  <div className="ql-vat">TVA</div>
                  <div className="ql-tot">Total HT</div>
                  <div className="ql-act"></div>
                </div>
                {lines.map((line, i) => {
                  const lineHt = line.quantity * line.unit_price_ht
                  return (
                    <div className="quote-line" key={i}>
                      <div className="ql-desc">
                        <input
                          type="text"
                          placeholder="Description de la prestation"
                          value={line.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                        />
                      </div>
                      <div className="ql-qty">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="ql-pu">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_price_ht}
                          onChange={(e) => updateLine(i, { unit_price_ht: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="ql-vat">
                        <select
                          value={line.vat_rate}
                          onChange={(e) => updateLine(i, { vat_rate: parseFloat(e.target.value) })}
                        >
                          {VAT_RATES.map((r) => (
                            <option key={r} value={r}>{r}%</option>
                          ))}
                        </select>
                      </div>
                      <div className="ql-tot">{formatAmount(lineHt)}</div>
                      <div className="ql-act">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            className="ql-remove"
                            onClick={() => removeLine(i)}
                            aria-label="Supprimer cette ligne"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                <button type="button" className="quote-add-line" onClick={addLine}>
                  <Plus size={13} strokeWidth={2} /> Ajouter une ligne
                </button>
              </div>
            </div>

            {/* Totaux */}
            <div className="quote-totals">
              <div className="quote-total-row">
                <span>Total HT</span>
                <strong>{formatAmount(totals.total_ht)}</strong>
              </div>
              {Object.entries(totals.vat_by_rate).map(([rate, vat]) => (
                <div key={rate} className="quote-total-row vat">
                  <span>TVA {rate}%</span>
                  <span>{formatAmount(vat)}</span>
                </div>
              ))}
              <div className="quote-total-row grand">
                <span>Total TTC</span>
                <strong>{formatAmount(totals.total_ttc)}</strong>
              </div>
            </div>

            {/* Notes */}
            <div className="fg">
              <label>Notes / observations <span className="text-ink-3 text-xs font-light">(visibles sur le PDF)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="report-textarea"
                style={{ minHeight: 80 }}
              />
            </div>

            {error && <span className="ferr on">{error}</span>}
            {flash && <p className="text-grn text-sm" style={{ margin: 0 }}>✅ {flash}</p>}

            {/* WORKFLOW PAIEMENT */}
            {isEdit && (
              <div className="quote-workflow">
                <div className="quote-workflow-status">
                  Statut :{' '}
                  <strong className={`status-${displayStatus}`}>
                    {INVOICE_STATUS_LABEL[displayStatus]}
                  </strong>
                  {sentAt && status !== 'cancelled' && (
                    <> · envoyée le {new Date(sentAt).toLocaleDateString('fr-FR')}</>
                  )}
                  {amountPaid > 0 && status !== 'cancelled' && (
                    <>
                      <br />
                      Réglé : <strong>{formatAmount(amountPaid)}</strong>
                      {totalTtc > 0 && amountPaid < totalTtc && (
                        <> · reste à payer : <strong className="text-red">{formatAmount(remaining)}</strong></>
                      )}
                      {paymentMethod && <> · {paymentMethod}{paymentRef ? ` (${paymentRef})` : ''}</>}
                      {paidAt && <> · soldée le {new Date(paidAt).toLocaleDateString('fr-FR')}</>}
                    </>
                  )}
                </div>
                {status !== 'cancelled' && (
                  <div className="quote-workflow-actions">
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => void handleGeneratePdf()}
                      disabled={generatingPdf}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <FileText size={13} strokeWidth={2} />
                      {generatingPdf ? 'Génération…' : pdfUrl ? 'Régénérer PDF' : 'Générer PDF'}
                    </button>
                    {pdfUrl && (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Download size={13} /> PDF
                      </a>
                    )}
                    {status === 'draft' && pdfUrl && (
                      <button
                        type="button"
                        className="btn-sm acc"
                        onClick={() => void handleMarkSent()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Mail size={13} strokeWidth={2} /> Envoyer au client
                      </button>
                    )}
                    {(status === 'sent' || status === 'partially_paid' || displayStatus === 'overdue') && (
                      <button
                        type="button"
                        className="btn-sm done"
                        onClick={() => void handleRecordPayment()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <CheckCircle2 size={13} strokeWidth={2} />
                        {amountPaid > 0 ? 'Enregistrer un règlement' : 'Marquer comme payée'}
                      </button>
                    )}
                    {(status === 'partially_paid' || status === 'paid') && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleResetPayment()}
                        title="Annuler les règlements"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Undo2 size={13} strokeWidth={2} /> Annuler règlement
                      </button>
                    )}
                    {status !== 'paid' && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleCancel()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Ban size={13} strokeWidth={2} /> Annuler la facture
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="modal-foot">
              {isEdit && (
                <button
                  type="button"
                  className="mf del"
                  onClick={() => void handleDelete()}
                  disabled={anyLoading}
                  style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Suppression définitive — préfère 'Annuler la facture' pour conserver la trace fiscale"
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </button>
              )}
              <button type="button" className="mf out" onClick={onClose} disabled={anyLoading}>
                Annuler
              </button>
              <button
                type="button"
                className="mf prim"
                onClick={() => void handleSubmit()}
                disabled={anyLoading || (isEdit && (status === 'paid' || status === 'cancelled'))}
                title={
                  status === 'paid'
                    ? 'Facture soldée : ses lignes ne sont plus modifiables'
                    : status === 'cancelled'
                      ? 'Facture annulée : ses lignes ne sont plus modifiables'
                      : ''
                }
              >
                {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer la facture'}
              </button>
            </div>

            {(status === 'paid' || status === 'cancelled') && (
              <p className="text-ink-3 text-xs font-light" style={{ margin: 0, textAlign: 'right' }}>
                <Edit3 size={10} style={{ display: 'inline-block', verticalAlign: '-1px' }} /> Pour modifier cette facture, annule d'abord son règlement ou son annulation.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
