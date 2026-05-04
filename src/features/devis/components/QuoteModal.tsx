import { ArrowRight, CheckCircle2, Download, FileText, Mail, Plus, Trash2, Undo2, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { getInvoicingSettings } from '../../parametres/api'
import { ClientAutocomplete } from '../../planning/components/ClientAutocomplete'
import {
  createQuote,
  deleteQuote,
  getQuote,
  markQuoteAccepted,
  markQuoteRefused,
  markQuoteSent,
  setQuotePdfUrl,
  setQuoteStatusDraft,
  updateQuote,
} from '../api'
import { VAT_RATES, computeQuoteTotals, formatAmount } from '../constants'
import type { QuoteStatus } from '../constants'
import type { QuoteLineInput, QuoteWithLines, UpsertQuoteInput } from '../schemas'
import { generateAndUploadQuotePdf } from '../pdf/generateQuotePdf'
import { QuotePdf } from '../pdf/QuotePdf'
import { createInvoiceFromQuote } from '../../factures/api'
import { sendDocumentEmail } from '../../email/api'
import { useNavigate } from 'react-router-dom'

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: (quoteId: string) => void
  /** Mode édition : id du devis à charger. Sinon mode création. */
  quoteId?: string | null
  /** Pré-remplissage en mode création (ex: depuis un rapport non-conforme) */
  seed?: Partial<UpsertQuoteInput>
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

function defaultValidityDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function QuoteModal({ open, onClose, onSaved, quoteId, seed }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const isEdit = !!quoteId
  const [convertingToInvoice, setConvertingToInvoice] = useState(false)

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [currentStatus, setCurrentStatus] = useState<QuoteStatus>('draft')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null)
  const [refusedAt, setRefusedAt] = useState<string | null>(null)
  const [refusedReason, setRefusedReason] = useState<string | null>(null)
  const [reference, setReference] = useState<string>('')

  const [clientName, setClientName] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [issueDate, setIssueDate] = useState(todayIso())
  const [validityDate, setValidityDate] = useState(defaultValidityDate())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<QuoteLineInput[]>([{ ...EMPTY_LINE }])

  // Charge si édition
  useEffect(() => {
    if (!open) return
    setError(null)
    if (isEdit && quoteId) {
      setLoading(true)
      void getQuote(quoteId)
        .then((q) => {
          if (!q) {
            setError('Devis introuvable.')
            return
          }
          setClientName(q.client_name)
          setClientId(q.client_id ?? '')
          setClientContact(q.client_contact_name ?? '')
          setClientEmail(q.client_email ?? '')
          setClientAddress(q.client_address ?? '')
          setSiteName(q.site_name ?? '')
          setSiteAddress(q.site_address ?? '')
          setIssueDate(q.issue_date)
          setValidityDate(q.validity_date ?? '')
          setNotes(q.notes ?? '')
          setLines(
            q.lines.length > 0
              ? q.lines.map((l) => ({
                  id: l.id,
                  position: l.position,
                  description: l.description,
                  quantity: Number(l.quantity),
                  unit_price_ht: Number(l.unit_price_ht),
                  vat_rate: Number(l.vat_rate),
                }))
              : [{ ...EMPTY_LINE }],
          )
          setReference(q.reference)
          setCurrentStatus(q.status as QuoteStatus)
          setPdfUrl(q.pdf_url ?? null)
          setSentAt(q.sent_at ?? null)
          setAcceptedAt(q.accepted_at ?? null)
          setRefusedAt(q.refused_at ?? null)
          setRefusedReason(q.refused_reason ?? null)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
        .finally(() => setLoading(false))
    } else {
      // Création : applique le seed si présent
      setClientName(seed?.client_name ?? '')
      setClientId(seed?.client_id ?? '')
      setClientContact(seed?.client_contact_name ?? '')
      setClientEmail(seed?.client_email ?? '')
      setClientAddress(seed?.client_address ?? '')
      setSiteName(seed?.site_name ?? '')
      setSiteAddress(seed?.site_address ?? '')
      setIssueDate(seed?.issue_date ?? todayIso())
      setValidityDate(seed?.validity_date ?? defaultValidityDate())
      setNotes(seed?.notes ?? '')
      setLines(
        seed?.lines && seed.lines.length > 0
          ? seed.lines
          : [{ ...EMPTY_LINE }],
      )
      setReference('')
      setCurrentStatus('draft')
      setPdfUrl(null)
      setSentAt(null)
      setAcceptedAt(null)
      setRefusedAt(null)
      setRefusedReason(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId])

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

  async function handleSubmit() {
    if (!profile?.organization_id) {
      setError('Profil non chargé.')
      return
    }
    if (!clientName.trim()) {
      setError('Le nom du client est requis.')
      return
    }
    if (lines.length === 0 || lines.every((l) => !l.description.trim())) {
      setError('Au moins une ligne avec description requise.')
      return
    }
    // Filtre les lignes vides éventuelles
    const cleanLines = lines.filter((l) => l.description.trim())
    if (cleanLines.length === 0) {
      setError('Au moins une ligne avec description requise.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const input: UpsertQuoteInput = {
        client_id: clientId || undefined,
        client_name: clientName.trim(),
        client_contact_name: clientContact || undefined,
        client_email: clientEmail || undefined,
        client_address: clientAddress || undefined,
        site_name: siteName || undefined,
        site_address: siteAddress || undefined,
        issue_date: issueDate,
        validity_date: validityDate || undefined,
        notes: notes || undefined,
        lines: cleanLines.map((l, i) => ({ ...l, position: i })),
      }
      let savedId: string
      if (isEdit && quoteId) {
        await updateQuote(quoteId, input)
        savedId = quoteId
      } else {
        const created = await createQuote(input, profile.organization_id)
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
    if (!quoteId) return
    if (!window.confirm('Supprimer ce devis définitivement ?')) return
    setDeleting(true)
    try {
      await deleteQuote(quoteId)
      onSaved?.('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDeleting(false)
    }
  }

  async function handleGeneratePdf() {
    if (!quoteId || !profile?.organization_id) return
    setGeneratingPdf(true)
    setError(null)
    setFlash(null)
    try {
      // Recharge la version la plus à jour du devis
      const fresh = await getQuote(quoteId)
      if (!fresh) throw new Error('Devis introuvable')
      const settings = await getInvoicingSettings(profile.organization_id)
      const orgName = profile.organizations?.name ?? 'Maintenance'
      const element = (
        <QuotePdf quote={fresh as QuoteWithLines} organizationName={orgName} settings={settings} />
      )
      const url = await generateAndUploadQuotePdf(
        element,
        profile.organization_id,
        quoteId,
        fresh.reference,
      )
      await setQuotePdfUrl(quoteId, url)
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
    if (!quoteId) return
    const recipient = clientEmail.trim() || window.prompt('Email du client à enregistrer :') || ''
    if (!recipient) {
      setError('Email du client requis pour marquer comme envoyé.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setError('Email invalide.')
      return
    }
    try {
      await markQuoteSent(quoteId, recipient)
      setCurrentStatus('sent')
      setSentAt(new Date().toISOString())

      // Construit le contenu de l'email
      const subject = `Devis ${reference}`.trim()
      const orgName = profile?.organizations?.name ?? 'Maintenance'
      const greet = clientContact ? `Bonjour ${clientContact.trim()},` : 'Bonjour,'
      const totalsLine = `Montant : ${formatAmount(totals.total_ttc)} TTC.`
      const pdfLine = pdfUrl
        ? `\n\n📄 Le devis est joint à ce mail (ou téléchargeable ici : ${pdfUrl})`
        : `\n\n(Le PDF est disponible sur demande.)`
      const body =
        `${greet}\n\nVeuillez trouver ci-après le devis pour la prestation envisagée.\n\n${totalsLine}${pdfLine}\n\nJe reste à ta disposition pour toute question.\n\nCordialement,\n${orgName}`

      // Tente Resend, fallback mailto:
      const result = await sendDocumentEmail({
        kind: 'quote',
        documentId: quoteId,
        recipientEmail: recipient,
        subject,
        body,
        pdfUrl,
      })

      if (result.mode === 'resend') {
        setFlash('Devis envoyé automatiquement avec PDF en pièce jointe ✓')
      } else {
        setFlash('Devis marqué comme envoyé.')
      }
      setTimeout(() => setFlash(null), 3000)
      onSaved?.(quoteId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleAccept() {
    if (!quoteId) return
    try {
      await markQuoteAccepted(quoteId)
      setCurrentStatus('accepted')
      setAcceptedAt(new Date().toISOString())
      setFlash('Devis marqué comme accepté ✅')
      setTimeout(() => setFlash(null), 2500)
      onSaved?.(quoteId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleRefuse() {
    if (!quoteId) return
    const reason = window.prompt('Raison du refus (optionnelle) :') ?? ''
    try {
      await markQuoteRefused(quoteId, reason.trim())
      setCurrentStatus('refused')
      setRefusedAt(new Date().toISOString())
      setRefusedReason(reason.trim() || null)
      setFlash('Devis marqué comme refusé.')
      setTimeout(() => setFlash(null), 2500)
      onSaved?.(quoteId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleResetDraft() {
    if (!quoteId) return
    if (!window.confirm('Remettre ce devis en brouillon ?')) return
    try {
      await setQuoteStatusDraft(quoteId)
      setCurrentStatus('draft')
      setSentAt(null)
      setAcceptedAt(null)
      setRefusedAt(null)
      setRefusedReason(null)
      onSaved?.(quoteId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleConvertToInvoice() {
    if (!quoteId || !profile?.organization_id) return
    if (!window.confirm(
      'Créer une facture à partir de ce devis ?\n\n' +
      '• Les lignes seront copiées automatiquement\n' +
      '• La facture sera créée en brouillon avec une échéance à 30 jours\n' +
      '• Tu pourras la modifier avant envoi'
    )) return
    setConvertingToInvoice(true)
    setError(null)
    try {
      const invoice = await createInvoiceFromQuote(quoteId, profile.organization_id)
      onClose()
      // Redirige vers la page Factures et ouvre la nouvelle facture
      navigate(`/factures?open=${invoice.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la transformation')
    } finally {
      setConvertingToInvoice(false)
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
            {isEdit ? `Devis ${reference || ''}`.trim() : 'Nouveau devis'}
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
                      // Pré-remplit les infos du client si dispo
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
                    placeholder="contact@client.fr"
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
                    placeholder="Bâtiment A"
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
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="fg">
                <label>Validité jusqu'au</label>
                <input
                  type="date"
                  value={validityDate}
                  onChange={(e) => setValidityDate(e.target.value)}
                />
              </div>
            </div>

            {/* Lignes */}
            <div className="card-section">
              <div className="card-section-title">Lignes du devis</div>
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
                          placeholder="Ex: Remplacement manomètre extincteur 6kg ABC"
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
                <button
                  type="button"
                  className="quote-add-line"
                  onClick={addLine}
                >
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
                placeholder="Précisions sur la prestation, conditions particulières…"
              />
            </div>

            {error && <span className="ferr on">{error}</span>}
            {flash && <p className="text-grn text-sm" style={{ margin: 0 }}>✅ {flash}</p>}

            {/* WORKFLOW : visible uniquement en édition */}
            {isEdit && (
              <div className="quote-workflow">
                <div className="quote-workflow-status">
                  Statut actuel :{' '}
                  <strong>
                    {currentStatus === 'draft' && 'Brouillon'}
                    {currentStatus === 'sent' && `Envoyé${sentAt ? ' (' + new Date(sentAt).toLocaleDateString('fr-FR') + ')' : ''}`}
                    {currentStatus === 'accepted' && `Accepté${acceptedAt ? ' (' + new Date(acceptedAt).toLocaleDateString('fr-FR') + ')' : ''}`}
                    {currentStatus === 'refused' && `Refusé${refusedAt ? ' (' + new Date(refusedAt).toLocaleDateString('fr-FR') + ')' : ''}`}
                  </strong>
                  {refusedReason && currentStatus === 'refused' && (
                    <span className="text-ink-3"> · {refusedReason}</span>
                  )}
                </div>
                <div className="quote-workflow-actions">
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => void handleGeneratePdf()}
                    disabled={generatingPdf || submitting}
                    title="Régénérer le PDF avec les valeurs actuelles"
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
                      title="Télécharger le PDF"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Download size={13} /> PDF
                    </a>
                  )}
                  {currentStatus === 'draft' && pdfUrl && (
                    <button
                      type="button"
                      className="btn-sm acc"
                      onClick={() => void handleMarkSent()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Mail size={13} strokeWidth={2} /> Envoyer au client
                    </button>
                  )}
                  {currentStatus === 'sent' && (
                    <>
                      <button
                        type="button"
                        className="btn-sm done"
                        onClick={() => void handleAccept()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <CheckCircle2 size={13} strokeWidth={2} /> Marquer accepté
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleRefuse()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <XCircle size={13} strokeWidth={2} /> Refusé
                      </button>
                    </>
                  )}
                  {currentStatus === 'accepted' && (
                    <button
                      type="button"
                      className="btn-sm acc"
                      onClick={() => void handleConvertToInvoice()}
                      disabled={convertingToInvoice}
                      title="Créer une facture pré-remplie depuis ce devis"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <ArrowRight size={13} strokeWidth={2} />
                      {convertingToInvoice ? 'Création…' : 'Transformer en facture'}
                    </button>
                  )}
                  {(currentStatus === 'sent' || currentStatus === 'accepted' || currentStatus === 'refused') && (
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => void handleResetDraft()}
                      title="Remettre en brouillon"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Undo2 size={13} strokeWidth={2} /> Brouillon
                    </button>
                  )}
                </div>
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
                disabled={anyLoading}
              >
                {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le devis'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
