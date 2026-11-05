import { CheckCircle2, Copy, Download, FileMinus2, FileText, Info, Lock, Mail, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { AddressAutocomplete } from '../../../shared/ui/AddressAutocomplete'
import { cleanLineFormat } from '../../../shared/lib/lineFormat'
import type { LinePart } from '../../../shared/lib/lineFormat'
import { VAT_RATES, computeQuoteTotals, formatAmount } from '../../devis/constants'
import type { QuoteLineInput } from '../../devis/schemas'
import { loadDocumentContext } from '../../clients/documentContext'
import { listClientDossierNumbers } from '../../equipment/api'
import { CatalogPicker } from '../../catalogue/components/CatalogPicker'
import { LineDescriptionField } from '../../devis/components/LineDescriptionField'
import { LineFormatToolbar } from '../../devis/components/LineFormatToolbar'
import type { CatalogItem } from '../../catalogue/schemas'
import { formatCompanyNumber, parseCompanyNumber } from '../../clients/companyLookup'
import { ClientAutocomplete } from '../../planning/components/ClientAutocomplete'
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listCreditNotes,
  markInvoiceSent,
  recordPayment,
  resetInvoicePayment,
  updateInvoice,
} from '../api'
import {
  defaultDueDate,
  displayReference,
  docEffectiveStatus,
  docStatusLabel,
  hasFinalNumber,
} from '../constants'
import type { InvoiceKind, InvoiceStatus } from '../constants'
import type { Invoice, InvoiceWithLines, UpsertInvoiceInput } from '../schemas'
import { buildInvoicePdf, creditedInvoiceInfo, invoiceEmail } from '../documentPdf'
import type { CreditedInvoiceInfo } from '../documentPdf'
import { CreditNoteModal } from './CreditNoteModal'
import type { CreditNoteIssued } from './CreditNoteModal'
import { sendDocumentEmail } from '../../email/api'
import { isValidEmail, recipientsForClientId, splitEmails } from '../../clients/recipients'
import { FileLink } from '../../../shared/ui/FileLink'

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: (invoiceId: string) => void
  invoiceId?: string | null
  seed?: Partial<UpsertInvoiceInput>
  /** Bouton « Dupliquer » : le parent rouvre la modale en création avec ce pré-remplissage */
  onDuplicate?: (seed: Partial<UpsertInvoiceInput>, fromReference: string) => void
  /** Message affiché en haut en mode création (ex : copie d'une facture) */
  notice?: string
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

/** Jours entre deux dates AAAA-MM-JJ */
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000)
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceModal({ open, onClose, onSaved, invoiceId, seed, onDuplicate, notice }: Props) {
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
  const [clientSiren, setClientSiren] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  // N° de dossier du chantier (repris du devis ou du site) et suggestions du client
  const [dossierNumber, setDossierNumber] = useState('')
  const [dossierOptions, setDossierOptions] = useState<string[]>([])
  // Devis et visite d'origine : conservés à l'enregistrement
  const [quoteId, setQuoteId] = useState('')
  const [interventionId, setInterventionId] = useState('')
  const [issueDate, setIssueDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState(defaultDueDate(todayIso()))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<QuoteLineInput[]>([{ ...EMPTY_LINE }])
  // Zone de texte où se trouve le curseur, mise en forme par la barre
  const [formatTarget, setFormatTarget] = useState<{ index: number; part: LinePart } | null>(null)

  // Workflow
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [paidAt, setPaidAt] = useState<string | null>(null)
  const [amountPaid, setAmountPaid] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [paymentRef, setPaymentRef] = useState<string | null>(null)
  const [totalTtc, setTotalTtc] = useState(0)
  const [sending, setSending] = useState(false)
  // Avoirs : nature du document, montants crédités, avoirs de la facture
  const [kind, setKind] = useState<InvoiceKind>('invoice')
  const [creditedTtc, setCreditedTtc] = useState(0)
  const [cancelledReason, setCancelledReason] = useState<string | null>(null)
  const [creditedInfo, setCreditedInfo] = useState<CreditedInvoiceInfo | null>(null)
  const [creditNotes, setCreditNotes] = useState<Invoice[]>([])
  const [creditSource, setCreditSource] = useState<InvoiceWithLines | null>(null)

  /** Remplit la fenêtre avec une facture lue en base (au chargement et après envoi ou avoir) */
  function applyInvoice(inv: InvoiceWithLines) {
    setReference(inv.reference)
    setClientName(inv.client_name)
    setClientId(inv.client_id ?? '')
    setClientContact(inv.client_contact_name ?? '')
    setClientEmail(inv.client_email ?? '')
    setClientAddress(inv.client_address ?? '')
    setClientSiren(inv.client_siren ?? '')
    setSiteName(inv.site_name ?? '')
    setSiteAddress(inv.site_address ?? '')
    setDossierNumber(inv.dossier_number ?? '')
    setQuoteId(inv.quote_id ?? '')
    setInterventionId(inv.intervention_id ?? '')
    if (inv.status === 'draft') {
      // Brouillon : la facture prendra la date de son envoi, l'échéance garde le même délai
      const today = todayIso()
      setIssueDate(today)
      setDueDate(inv.due_date ? addDays(today, Math.max(0, daysBetween(inv.issue_date, inv.due_date))) : defaultDueDate(today))
    } else {
      setIssueDate(inv.issue_date)
      setDueDate(inv.due_date ?? '')
    }
    setNotes(inv.notes ?? '')
    setLines(
      inv.lines.length > 0
        ? inv.lines.map((l) => ({
            id: l.id,
            position: l.position,
            description: l.description,
            format: l.format ?? null,
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
    setKind(inv.kind ?? 'invoice')
    setCreditedTtc(Number(inv.credited_ttc ?? 0))
    setCancelledReason(inv.cancelled_reason ?? null)
    void creditedInvoiceInfo(inv).then(setCreditedInfo).catch(() => setCreditedInfo(null))
    if ((inv.kind ?? 'invoice') === 'invoice' && inv.status !== 'draft') {
      void listCreditNotes(inv.id).then(setCreditNotes).catch(() => setCreditNotes([]))
    } else {
      setCreditNotes([])
    }
  }

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
          applyInvoice(inv)
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
      setClientSiren(seed?.client_siren ?? '')
      setSiteName(seed?.site_name ?? '')
      setSiteAddress(seed?.site_address ?? '')
      setDossierNumber(seed?.dossier_number ?? '')
      setQuoteId(seed?.quote_id ?? '')
      setInterventionId(seed?.intervention_id ?? '')
      // Complète avec la fiche client et le N° de dossier (devis d'origine ou site de la visite)
      void loadDocumentContext({ clientId: seed?.client_id, interventionId: seed?.intervention_id, quoteId: seed?.quote_id }).then(({ client, dossierNumber: dossier }) => {
        if (client) {
          setClientContact((v) => v || client.contact_name || '')
          setClientEmail((v) => v || client.contact_email || '')
          setClientAddress((v) => v || client.address || '')
          setClientSiren((v) => v || client.siren || '')
        }
        if (dossier) setDossierNumber((v) => v || dossier)
      })
      // La facture prendra la date de son envoi : on garde seulement le délai de paiement proposé
      const today = todayIso()
      setIssueDate(today)
      setDueDate(seed?.due_date && seed.issue_date ? addDays(today, Math.max(0, daysBetween(seed.issue_date, seed.due_date))) : defaultDueDate(today))
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
      setKind('invoice')
      setCreditedTtc(0)
      setCancelledReason(null)
      setCreditedInfo(null)
      setCreditNotes([])
    }
    setCreditSource(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId])

  // Suggestions de N° de dossier : ceux des sites du client
  useEffect(() => {
    let alive = true
    void listClientDossierNumbers(clientId).then((list) => { if (alive) setDossierOptions(list) })
    return () => { alive = false }
  }, [clientId])

  function updateLine(index: number, patch: Partial<QuoteLineInput>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE, position: prev.length }])
  }

  /** Article du catalogue : remplace la dernière ligne si elle est vide, sinon ajoute une ligne */
  function addCatalogItem(item: CatalogItem) {
    setLines((prev) => {
      const line: QuoteLineInput = { ...EMPTY_LINE, description: item.label, unit_price_ht: item.unit_price_ht, vat_rate: item.vat_rate }
      const last = prev[prev.length - 1]
      const lastIsEmpty = !!last && !last.description.trim() && !last.unit_price_ht
      const next = lastIsEmpty ? [...prev.slice(0, -1), line] : [...prev, line]
      return next.map((l, i) => ({ ...l, position: i }))
    })
  }

  function removeLine(index: number) {
    setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
    setFormatTarget(null)
  }

  const totals = computeQuoteTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unit_price_ht: l.unit_price_ht,
      vat_rate: l.vat_rate,
    })),
  )

  const isCredit = kind === 'credit_note'
  const docState = { reference, kind, status, total_ttc: totalTtc, credited_ttc: creditedTtc, amount_paid: amountPaid, due_date: dueDate || null, sent_at: sentAt }
  // Statut effectif (pour gérer le 'overdue' calculé en runtime, avoirs déduits)
  const displayStatus = docEffectiveStatus(docState)
  const netTtc = Math.max(0, totalTtc - creditedTtc)
  const remaining = Math.max(0, netTtc - amountPaid)
  // Facture émise (plus en brouillon) ou avoir : contenu figé, comme en base (trigger invoices_protect_issued)
  const locked = isEdit && (status !== 'draft' || isCredit)
  const shownReference = displayReference({ reference, kind })
  const canCredit = isEdit && !isCredit && ['sent', 'partially_paid', 'paid'].includes(status) && netTtc > 0.005

  /** Copie de la facture (ex. pour refaire une facture annulée) : date du jour, nouveau numéro à la création */
  function handleDuplicate() {
    if (!onDuplicate) return
    onDuplicate({
      client_id: clientId || undefined,
      client_name: clientName,
      client_contact_name: clientContact || undefined,
      client_email: clientEmail || undefined,
      client_address: clientAddress || undefined,
      client_siren: clientSiren || undefined,
      site_name: siteName || undefined,
      site_address: siteAddress || undefined,
      dossier_number: dossierNumber || undefined,
      notes: notes || undefined,
      lines: lines
        .filter((l) => l.description.trim())
        .map((l, i) => ({ position: i, description: l.description, format: cleanLineFormat(l.format), quantity: l.quantity, unit_price_ht: l.unit_price_ht, vat_rate: l.vat_rate })),
    }, shownReference)
  }

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
        client_siren: parseCompanyNumber(clientSiren).ok
          ? clientSiren.replace(/\D/g, '').slice(0, 9) || undefined
          : undefined,
        quote_id: quoteId || undefined,
        intervention_id: interventionId || undefined,
        site_name: siteName || undefined,
        site_address: siteAddress || undefined,
        dossier_number: dossierNumber || undefined,
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
    if (!window.confirm(isCredit ? 'Supprimer ce brouillon d\'avoir ?' : 'Supprimer ce brouillon de facture ? Aucun numéro n\'est perdu.')) return
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
      const { url } = await buildInvoicePdf(invoiceId, profile.organization_id, profile.organizations?.name ?? 'Maintenance')
      setPdfUrl(url)
      setFlash(status === 'draft' ? 'Aperçu PDF prêt (brouillon, sans numéro).' : 'PDF généré.')
      setTimeout(() => setFlash(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur PDF')
    } finally {
      setGeneratingPdf(false)
    }
  }

  /**
   * Envoi au client : un brouillon reçoit d'abord son numéro et la date du
   * jour (base), puis le PDF est refait au numéro définitif et part par mail.
   */
  async function handleMarkSent() {
    if (!invoiceId || !profile?.organization_id) return
    // Email de la facture (sinon principal du client) + destinataires « factures » de la fiche client
    let list = await recipientsForClientId(clientId || null, 'invoices', clientEmail.trim())
    if (list.length === 0) list = splitEmails(window.prompt('Email du client à enregistrer :') ?? '')
    if (list.length === 0) {
      setError('Email du client requis.')
      return
    }
    if (list.some((e) => !isValidEmail(e))) {
      setError('Email invalide.')
      return
    }
    const recipient = list.join(', ')
    const orgName = profile.organizations?.name ?? 'Maintenance'
    setSending(true)
    setError(null)
    try {
      const wasDraft = status === 'draft'
      if (wasDraft) {
        // Numéro définitif et date du jour : posés par la base à la sortie du brouillon
        await markInvoiceSent(invoiceId, recipient)
      }
      // PDF au numéro définitif (refait si c'était un brouillon ou s'il manque)
      const built = wasDraft || !pdfUrl ? await buildInvoicePdf(invoiceId, profile.organization_id, orgName) : null
      const fresh = built?.doc ?? await getInvoice(invoiceId)
      if (!fresh) throw new Error('Facture introuvable')
      const url = built?.url ?? fresh.pdf_url ?? null
      const credited = built?.credited ?? creditedInfo
      applyInvoice(fresh)

      const { subject, body } = invoiceEmail(fresh, orgName, url, credited)
      // Tente Resend, fallback mailto:
      const result = await sendDocumentEmail({
        kind: 'invoice',
        documentId: invoiceId,
        recipientEmail: recipient,
        subject,
        body,
        pdfUrl: url,
      })
      if (!wasDraft) await markInvoiceSent(invoiceId, recipient)
      setSentAt(new Date().toISOString())

      const label = isCredit ? `Avoir ${fresh.reference}` : `Facture ${fresh.reference}`
      if (result.mode === 'resend') {
        setFlash(`${label} envoyé${isCredit ? '' : 'e'} à ${recipient} avec le PDF en pièce jointe ✓`)
      } else {
        setFlash(`${label} : numéro attribué, votre messagerie s'est ouverte pour l'envoi.`)
      }
      setTimeout(() => setFlash(null), 4000)
      onSaved?.(invoiceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      // La facture a pu être émise avant l'erreur : on relit son état
      const again = await getInvoice(invoiceId).catch(() => null)
      if (again) applyInvoice(again)
    } finally {
      setSending(false)
    }
  }

  async function handleRecordPayment() {
    if (!invoiceId) return
    const remainingNow = Math.max(0, netTtc - amountPaid)
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
      const newPaid = Math.min(netTtc, amountPaid + amount)
      setAmountPaid(newPaid)
      setPaymentMethod(method || null)
      setPaymentRef(ref || null)
      if (newPaid >= netTtc - 0.01) {
        setStatus('paid')
        setPaidAt(new Date().toISOString())
        setFlash(`Règlement enregistré ✅ Facture soldée.`)
      } else {
        setStatus('partially_paid')
        setFlash(`Règlement enregistré. Reste : ${formatAmount(netTtc - newPaid)}.`)
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
      await resetInvoicePayment(invoiceId)
      setStatus('sent')
      setAmountPaid(0)
      setPaidAt(null)
      setPaymentMethod(null)
      setPaymentRef(null)
      onSaved?.(invoiceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  /** « Faire un avoir » : ouvre la fenêtre de l'avoir avec la facture à jour */
  async function openCreditNote() {
    if (!invoiceId) return
    setError(null)
    try {
      const fresh = await getInvoice(invoiceId)
      if (!fresh) throw new Error('Facture introuvable')
      setCreditSource(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleCreditIssued(result: CreditNoteIssued) {
    setCreditSource(null)
    if (invoiceId) {
      const fresh = await getInvoice(invoiceId).catch(() => null)
      if (fresh) applyInvoice(fresh)
    }
    if (result.warning) setError(result.warning)
    const sentLine = result.sent === 'resend'
      ? ` et envoyé à ${result.recipient}`
      : result.sent === 'mailto' ? ', votre messagerie s\'est ouverte pour l\'envoi' : ''
    setFlash(`Avoir ${result.reference} émis${sentLine}.`)
    setTimeout(() => setFlash(null), 5000)
    if (invoiceId) onSaved?.(invoiceId)
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !submitting && !deleting) onClose()
  }

  if (!open) return null

  const anyLoading = submitting || deleting || loading || sending

  return (
    <>
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 920 }}>
        <div className="modal-head">
          <span className="modal-title">
            {!isEdit
              ? 'Nouvelle facture'
              : isCredit
                ? hasFinalNumber(reference) ? `Avoir ${reference}` : 'Avoir (brouillon)'
                : hasFinalNumber(reference) ? `Facture ${reference}` : 'Facture (brouillon)'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {loading ? (
          <p className="text-ink-2 text-sm">Chargement…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {notice && !isEdit && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--acc)', background: 'var(--acc-lt, #E8EEF8)', borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>
                <Copy size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{notice}</span>
              </div>
            )}
            {!locked && !isCredit && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink2)', background: 'var(--bg2, #F1F3F6)', borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>
                <Info size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {hasFinalNumber(reference)
                    ? `Brouillon n° ${reference} : il prendra la date du jour où vous l'envoyez au client.`
                    : 'Brouillon : le numéro de facture et sa date sont attribués quand vous l\'envoyez au client. Un brouillon supprimé ne laisse pas de trou dans la numérotation.'}
                </span>
              </div>
            )}
            {locked && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink2)', background: 'var(--bg2, #F1F3F6)', borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>
                <Lock size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {isCredit
                    ? <>
                        {status === 'draft' ? 'Avoir en brouillon (son émission n\'a pas abouti) : envoyez-le pour lui donner son numéro, ou supprimez-le.' : 'Avoir émis : il ne se modifie plus.'}
                        {creditedInfo && <> Il se rapporte à la facture <strong>{creditedInfo.reference}</strong> du {new Date(creditedInfo.issue_date).toLocaleDateString('fr-FR')}.</>}
                      </>
                    : status === 'cancelled'
                      ? `${cancelledReason?.startsWith('Annulée par l\'avoir') ? `Facture ${cancelledReason.charAt(0).toLowerCase()}${cancelledReason.slice(1)}` : 'Facture annulée'} : elle reste dans la numérotation et ne se modifie plus. Pour la refaire corrigée : « Dupliquer ».`
                      : 'Facture émise : son contenu ne se modifie plus. Pour corriger une erreur : « Faire un avoir » (total ou partiel), puis refaites-la avec « Dupliquer » si besoin.'}
                </span>
              </div>
            )}
            <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                        if (c.siren && !clientSiren) setClientSiren(c.siren)
                      }
                    }}
                    placeholder="Tapez le nom du client"
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
                  <AddressAutocomplete
                    value={clientAddress}
                    onChange={setClientAddress}
                    placeholder="Commencez à taper le numéro et la rue…"
                  />
                </div>
              </div>
              <div className="mrow">
                <div className="fg">
                  <label>SIREN du client <span className="text-ink-3 text-xs font-light">(clients pro)</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="9 chiffres"
                    value={formatCompanyNumber(clientSiren)}
                    onChange={(e) => setClientSiren(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  />
                  {clientSiren.length > 0 && !parseCompanyNumber(clientSiren).ok && (
                    <span className="ferr on">SIREN invalide — il ne sera pas enregistré</span>
                  )}
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
                    placeholder="Bâtiment A, hall principal…"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label>Adresse du site</label>
                  <AddressAutocomplete
                    value={siteAddress}
                    onChange={setSiteAddress}
                    placeholder="Commencez à taper le numéro et la rue…"
                  />
                </div>
              </div>
              <div className="mrow">
                <div className="fg">
                  <label>N° de dossier</label>
                  <input
                    type="text"
                    placeholder="Ex : D-2026-014"
                    value={dossierNumber}
                    onChange={(e) => setDossierNumber(e.target.value)}
                    list="invoice-dossier-numbers"
                  />
                  <datalist id="invoice-dossier-numbers">
                    {dossierOptions.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div />
              </div>
            </div>

            {/* Dates : la facture prend la date de son envoi */}
            <div className="mrow">
              <div className="fg">
                <label>{isCredit ? 'Date de l\'avoir' : 'Date de la facture'}</label>
                <input type="date" value={issueDate} disabled />
                {!locked && (
                  <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
                    Celle du jour où la facture est envoyée au client.
                  </span>
                )}
              </div>
              {!isCredit ? (
                <div className="fg">
                  <label>Date limite de paiement</label>
                  <input
                    type="date"
                    value={dueDate}
                    min={locked ? undefined : issueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                  <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
                    Date à laquelle le client doit avoir payé. Si la facture part un autre jour, l'échéance
                    est décalée d'autant. Au-delà, la facture passe en « En retard ». Par défaut J+30.
                  </span>
                </div>
              ) : <div />}
            </div>

            {/* Lignes */}
            <div className="card-section">
              <div className="card-section-title">Lignes de la facture</div>
              <LineFormatToolbar
                target={formatTarget && lines[formatTarget.index] ? formatTarget : null}
                style={formatTarget ? lines[formatTarget.index]?.format?.[formatTarget.part] : undefined}
                onChange={(style) => {
                  if (!formatTarget) return
                  const line = lines[formatTarget.index]
                  if (line) updateLine(formatTarget.index, { format: cleanLineFormat({ ...line.format, [formatTarget.part]: style }) })
                }}
              />
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
                        <LineDescriptionField
                          placeholder="Description de la prestation"
                          value={line.description}
                          format={line.format}
                          onChange={(description) => updateLine(i, { description })}
                          onFocusPart={(part) => setFormatTarget({ index: i, part })}
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
                        {lines.length > 1 && !locked && (
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
                {!locked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                    <button type="button" className="quote-add-line" onClick={addLine}>
                      <Plus size={13} strokeWidth={2} /> Ajouter une ligne
                    </button>
                    <CatalogPicker onPick={addCatalogItem} />
                    <span className="text-ink-3 text-xs font-light">
                      Entrée dans la désignation : ajoute une précision dessous (délai de livraison, référence…). La barre au-dessus met en forme le texte où se trouve le curseur.
                    </span>
                  </div>
                )}
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
            </fieldset>

            {error && <span className="ferr on">{error}</span>}
            {flash && <p className="text-grn text-sm" style={{ margin: 0 }}>✅ {flash}</p>}

            {/* WORKFLOW ENVOI, PAIEMENT, AVOIR */}
            {isEdit && (
              <div className="quote-workflow">
                <div className="quote-workflow-status">
                  Statut :{' '}
                  <strong className={`status-${displayStatus}`}>
                    {docStatusLabel(docState, displayStatus)}
                  </strong>
                  {sentAt && status !== 'cancelled' && (
                    <> · envoyé{isCredit ? '' : 'e'} le {new Date(sentAt).toLocaleDateString('fr-FR')}</>
                  )}
                  {!isCredit && creditNotes.length > 0 && (
                    <>
                      <br />
                      Avoir{creditNotes.length > 1 ? 's' : ''} :{' '}
                      {creditNotes.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && ', '}
                          <strong>{displayReference(c)}</strong> (− {formatAmount(Number(c.total_ttc))})
                        </span>
                      ))}
                      {status !== 'cancelled' && <> · total à payer : <strong>{formatAmount(netTtc)}</strong></>}
                    </>
                  )}
                  {!isCredit && amountPaid > 0 && status !== 'cancelled' && (
                    <>
                      <br />
                      Réglé : <strong>{formatAmount(amountPaid)}</strong>
                      {netTtc > 0 && amountPaid < netTtc - 0.005 && (
                        <> · reste à payer : <strong className="text-red">{formatAmount(remaining)}</strong></>
                      )}
                      {paymentMethod && <> · {paymentMethod}{paymentRef ? ` (${paymentRef})` : ''}</>}
                      {paidAt && <> · soldée le {new Date(paidAt).toLocaleDateString('fr-FR')}</>}
                    </>
                  )}
                </div>
                {status !== 'cancelled' && (
                  <div className="quote-workflow-actions">
                    {(!locked || !pdfUrl) && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleGeneratePdf()}
                        disabled={generatingPdf || sending}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <FileText size={13} strokeWidth={2} />
                        {generatingPdf ? 'Génération…' : status === 'draft' ? 'Aperçu PDF' : pdfUrl ? 'Régénérer PDF' : 'Générer PDF'}
                      </button>
                    )}
                    {pdfUrl && (
                      <FileLink
                        url={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Download size={13} /> PDF
                      </FileLink>
                    )}
                    {(status === 'draft' || !sentAt) && (
                      <button
                        type="button"
                        className="btn-sm acc"
                        onClick={() => void handleMarkSent()}
                        disabled={sending || generatingPdf}
                        title={status === 'draft' ? 'Attribue le numéro et la date du jour, refait le PDF et l\'envoie au client' : undefined}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Mail size={13} strokeWidth={2} /> {sending ? 'Envoi…' : 'Envoyer au client'}
                      </button>
                    )}
                    {!isCredit && (status === 'sent' || status === 'partially_paid' || displayStatus === 'overdue') && (
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
                    {!isCredit && (status === 'partially_paid' || status === 'paid') && (
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
                    {canCredit && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void openCreditNote()}
                        title="Annule tout ou partie de la facture par un avoir numéroté"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <FileMinus2 size={13} strokeWidth={2} /> Faire un avoir
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="modal-foot">
              {isEdit && status === 'draft' && (
                <button
                  type="button"
                  className="mf del"
                  onClick={() => void handleDelete()}
                  disabled={anyLoading}
                  style={{ marginRight: onDuplicate && !isCredit ? undefined : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </button>
              )}
              {isEdit && onDuplicate && !isCredit && (
                <button
                  type="button"
                  className="mf out"
                  onClick={handleDuplicate}
                  disabled={anyLoading}
                  style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Nouvelle facture en brouillon avec le même client et les mêmes lignes"
                >
                  <Copy size={14} strokeWidth={1.8} /> Dupliquer
                </button>
              )}
              {/* « Fermer » sur une facture existante : « Annuler » se confondait avec « Annuler la facture » */}
              <button type="button" className="mf out" onClick={onClose} disabled={anyLoading}>
                {locked || isEdit ? 'Fermer' : 'Annuler'}
              </button>
              {!locked && (
                <button
                  type="button"
                  className="mf prim"
                  onClick={() => void handleSubmit()}
                  disabled={anyLoading}
                >
                  {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer la facture'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    {creditSource && (
      <CreditNoteModal
        invoice={creditSource}
        onClose={() => setCreditSource(null)}
        onIssued={(r) => void handleCreditIssued(r)}
      />
    )}
    </>
  )
}
