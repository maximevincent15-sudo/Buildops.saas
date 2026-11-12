import { Download, FileText, Mail } from 'lucide-react'
import { useState } from 'react'
import { FileLink } from '../../../shared/ui/FileLink'
import { isPrivateFile } from '../../../shared/lib/privateFiles'
import { getClientNumber } from '../../clients/api'
import { sendDocumentEmail } from '../../email/api'
import { getInvoicingSettings } from '../../parametres/api'
import { getQuote, markOrderAckSent, saveOrderAck, setOrderAckPdfUrl } from '../api'
import { uploadQuoteDocumentPdf } from '../pdf/generateQuotePdf'
import { QuotePdf } from '../pdf/QuotePdf'
import type { QuoteWithLines } from '../schemas'

type Props = {
  quote: QuoteWithLines
  organizationId: string
  organizationName: string
  /** Conditions de paiement des Paramètres (proposées par défaut) */
  defaultPaymentTerms: string | null
  /** Destinataires du client (demandés si aucun) ; null = envoi annulé */
  resolveRecipients: () => Promise<string | null>
  onClose: () => void
  /** Devis mis à jour (PDF de l'AR, envoi) */
  onChanged: (quote: QuoteWithLines) => void
}

const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')
const frDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')

/** Accusé de réception de commande : fait quand le client valide le devis */
export function OrderAckModal({ quote, organizationId, organizationName, defaultPaymentTerms, resolveRecipients, onClose, onChanged }: Props) {
  const [orderReference, setOrderReference] = useState(quote.order_reference ?? '')
  const [orderDate, setOrderDate] = useState(dayOf(quote.order_date ?? quote.signed_at ?? quote.accepted_at) || dayOf(new Date().toISOString()))
  const [leadTime, setLeadTime] = useState(quote.order_lead_time ?? '')
  const [paymentTerms, setPaymentTerms] = useState(quote.order_payment_terms ?? defaultPaymentTerms ?? '')
  const [pdfUrl, setPdfUrl] = useState<string | null>(quote.order_ack_pdf_url ?? null)
  const [sentAt, setSentAt] = useState<string | null>(quote.order_ack_sent_at ?? null)
  const [busy, setBusy] = useState<'pdf' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  // PDF à refaire si un champ a changé depuis
  const [generatedFor, setGeneratedFor] = useState<string | null>(
    quote.order_ack_pdf_url ? JSON.stringify([quote.order_reference ?? '', dayOf(quote.order_date), quote.order_lead_time ?? '', quote.order_payment_terms ?? '']) : null,
  )
  const current = JSON.stringify([orderReference.trim(), orderDate, leadTime.trim(), paymentTerms.trim()])
  const upToDate = !!pdfUrl && generatedFor === current

  async function generate(): Promise<string | null> {
    setBusy('pdf')
    setError(null)
    setFlash(null)
    try {
      await saveOrderAck(quote.id, {
        order_reference: orderReference.trim() || null,
        order_date: orderDate || null,
        order_lead_time: leadTime.trim() || null,
        order_payment_terms: paymentTerms.trim() || null,
      })
      const fresh = await getQuote(quote.id)
      if (!fresh) throw new Error('Devis introuvable')
      const [settings, clientNumber] = await Promise.all([
        getInvoicingSettings(organizationId),
        getClientNumber(fresh.client_id),
      ])
      const url = await uploadQuoteDocumentPdf(
        <QuotePdf quote={fresh} organizationName={organizationName} settings={settings} clientNumber={clientNumber} variant="order_ack" />,
        organizationId,
        quote.id,
        `AR-${fresh.reference}`,
      )
      await setOrderAckPdfUrl(quote.id, url)
      setPdfUrl(url)
      setGeneratedFor(current)
      onChanged({ ...fresh, order_ack_pdf_url: url })
      setFlash('Accusé de réception prêt.')
      return url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création du PDF')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    const url = upToDate ? pdfUrl : await generate()
    if (!url) return
    const recipient = await resolveRecipients()
    if (!recipient) return
    setBusy('send')
    setError(null)
    try {
      const greet = quote.client_contact_name?.trim() ? `Bonjour ${quote.client_contact_name.trim()},` : 'Bonjour,'
      const datePart = orderDate ? ` du ${new Date(orderDate).toLocaleDateString('fr-FR')}` : ''
      const refPart = orderReference.trim() ? ` (votre référence : ${orderReference.trim()})` : ''
      const leadPart = leadTime.trim() ? `\n\nDélai prévu : ${leadTime.trim()}.` : ''
      const pdfLine = isPrivateFile(url)
        ? `\n\n📄 L'accusé de réception est joint à ce mail.`
        : `\n\n📄 L'accusé de réception est joint à ce mail (ou téléchargeable ici : ${url})`
      const body =
        `${greet}\n\nNous avons bien reçu votre commande${datePart}${refPart}, établie sur la base de notre devis ${quote.reference}, et vous en remercions.${leadPart}${pdfLine}\n\nJe reste à votre disposition pour toute question.\n\nCordialement,\n${organizationName}`
      const result = await sendDocumentEmail({
        kind: 'quote',
        documentId: quote.id,
        recipientEmail: recipient,
        subject: `Accusé de réception de votre commande — devis ${quote.reference}`,
        body,
        pdfUrl: url,
      })
      if (result.mode === 'error') throw new Error(result.error)
      const now = await markOrderAckSent(quote.id)
      setSentAt(now)
      onChanged({ ...quote, order_reference: orderReference.trim() || null, order_date: orderDate || null, order_lead_time: leadTime.trim() || null, order_payment_terms: paymentTerms.trim() || null, order_ack_pdf_url: url, order_ack_sent_at: now })
      setFlash(result.mode === 'resend' ? `Accusé de réception envoyé à ${recipient} ✓` : 'Message préparé dans votre messagerie.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="overlay open" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-head">
          <span className="modal-title">Accusé de réception · {quote.reference}</span>
          <button type="button" className="modal-x" onClick={onClose} disabled={!!busy} aria-label="Fermer">×</button>
        </div>

        <p className="text-ink-2 text-sm" style={{ margin: '0 0 .9rem', lineHeight: 1.5 }}>
          Confirmez au client que sa commande est bien reçue. Le PDF reprend les lignes et les prix du devis {quote.reference}, avec les informations ci-dessous.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
          <div className="mrow">
            <div className="fg">
              <label>Date de la commande</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="fg">
              <label>Référence de commande du client <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
              <input type="text" value={orderReference} onChange={(e) => setOrderReference(e.target.value)} placeholder="Ex : BC-2026-0412" />
            </div>
          </div>
          <div className="fg">
            <label>Délai prévu <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
            <input type="text" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="Ex : intervention prévue semaine 48" />
          </div>
          <div className="fg">
            <label>Conditions de paiement</label>
            <textarea
              className="report-textarea"
              style={{ minHeight: 60 }}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Ex : acompte de 30 % à la commande, solde à réception de facture"
            />
          </div>

          {(pdfUrl || sentAt) && (
            <p className="text-ink-3 text-xs" style={{ margin: 0 }}>
              {pdfUrl && !upToDate ? 'Informations modifiées : le PDF sera refait. ' : ''}
              {sentAt ? `Envoyé au client le ${frDate(sentAt)}.` : pdfUrl ? 'Pas encore envoyé au client.' : ''}
            </p>
          )}
          {error && <span className="ferr on">{error}</span>}
          {flash && <p className="text-grn text-sm" style={{ margin: 0 }}>✅ {flash}</p>}
        </div>

        <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="mf out" onClick={onClose} disabled={!!busy}>Fermer</button>
          {pdfUrl && upToDate && (
            <FileLink url={pdfUrl} target="_blank" rel="noreferrer" className="mf out" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
              <Download size={14} /> PDF
            </FileLink>
          )}
          {!upToDate && (
            <button type="button" className="mf out" onClick={() => void generate()} disabled={!!busy} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FileText size={14} /> {busy === 'pdf' ? 'Création…' : 'Créer le PDF'}
            </button>
          )}
          <button type="button" className="mf prim" onClick={() => void send()} disabled={!!busy} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Mail size={14} /> {busy === 'send' ? 'Envoi…' : sentAt ? 'Renvoyer au client' : 'Envoyer au client'}
          </button>
        </div>
      </div>
    </div>
  )
}
