import { supabase } from '../../shared/lib/supabase'
import { isPrivateFile } from '../../shared/lib/privateFiles'
import { getClientNumber } from '../clients/api'
import { formatAmount } from '../devis/constants'
import { getInvoicingSettings } from '../parametres/api'
import { getInvoice, setInvoicePdfUrl } from './api'
import { isCreditNote } from './constants'
import type { Invoice, InvoiceWithLines } from './schemas'
import { InvoicePdf } from './pdf/InvoicePdf'
import { generateAndUploadInvoicePdf } from './pdf/generateInvoicePdf'

export type CreditedInvoiceInfo = { reference: string; issue_date: string }
export type DepositQuoteInfo = { reference: string; issue_date: string }

/** Facture d'acompte : numéro et date du devis */
export async function depositQuoteInfo(doc: Pick<Invoice, 'is_deposit' | 'quote_id'>): Promise<DepositQuoteInfo | null> {
  if (!doc.is_deposit || !doc.quote_id) return null
  const { data, error } = await supabase
    .from('quotes')
    .select('reference, issue_date')
    .eq('id', doc.quote_id)
    .maybeSingle()
  if (error) throw error
  return (data as DepositQuoteInfo | null) ?? null
}

/** Avoir : numéro et date de la facture qu'il crédite */
export async function creditedInvoiceInfo(doc: Pick<Invoice, 'kind' | 'credited_invoice_id'>): Promise<CreditedInvoiceInfo | null> {
  if (!isCreditNote(doc) || !doc.credited_invoice_id) return null
  const { data, error } = await supabase
    .from('invoices')
    .select('reference, issue_date')
    .eq('id', doc.credited_invoice_id)
    .maybeSingle()
  if (error) throw error
  return (data as CreditedInvoiceInfo | null) ?? null
}

/**
 * PDF d'une facture ou d'un avoir, relu en base (numéro et date à jour),
 * enregistré dans le stockage privé et rattaché au document.
 */
export async function buildInvoicePdf(
  invoiceId: string,
  organizationId: string,
  organizationName: string,
): Promise<{ doc: InvoiceWithLines; url: string; credited: CreditedInvoiceInfo | null; depositQuote: DepositQuoteInfo | null }> {
  const doc = await getInvoice(invoiceId)
  if (!doc) throw new Error('Facture introuvable')
  const [settings, clientNumber, credited, depositQuote] = await Promise.all([
    getInvoicingSettings(organizationId),
    getClientNumber(doc.client_id),
    creditedInvoiceInfo(doc),
    depositQuoteInfo(doc),
  ])
  const element = (
    <InvoicePdf
      invoice={doc}
      organizationName={organizationName || 'Maintenance'}
      settings={settings}
      clientNumber={clientNumber}
      creditedInvoice={credited}
      depositQuote={depositQuote}
    />
  )
  const url = await generateAndUploadInvoicePdf(element, organizationId, invoiceId, doc.reference)
  await setInvoicePdfUrl(invoiceId, url)
  return { doc: { ...doc, pdf_url: url }, url, credited, depositQuote }
}

/** Objet et texte du mail qui accompagne une facture ou un avoir */
export function invoiceEmail(
  doc: Pick<Invoice, 'kind' | 'reference' | 'client_contact_name' | 'total_ttc' | 'due_date' | 'is_deposit'>,
  organizationName: string,
  pdfUrl: string | null,
  credited: CreditedInvoiceInfo | null,
  depositQuote: DepositQuoteInfo | null = null,
): { subject: string; body: string } {
  const credit = isCreditNote(doc)
  const greet = doc.client_contact_name?.trim() ? `Bonjour ${doc.client_contact_name.trim()},` : 'Bonjour,'
  const what = credit ? "L'avoir est joint" : 'La facture est jointe'
  // PDF privé : joint au mail, sans lien (il faudrait être connecté pour l'ouvrir)
  const pdfLine = pdfUrl
    ? isPrivateFile(pdfUrl)
      ? `\n\n📄 ${what} à ce mail.`
      : `\n\n📄 ${what} à ce mail (ou téléchargeable ici : ${pdfUrl})`
    : '\n\n(Le PDF est disponible sur demande.)'
  const signature = `\n\nN'hésitez pas à me contacter pour toute question.\n\nCordialement,\n${organizationName || 'Maintenance'}`
  if (credit) {
    const about = credited ? ` relatif à la facture ${credited.reference}` : ''
    return {
      subject: `Avoir ${doc.reference}`,
      body: `${greet}\n\nVeuillez trouver ci-après l'avoir n° ${doc.reference}${about}, d'un montant de ${formatAmount(Number(doc.total_ttc))} TTC, qui vient en déduction de cette facture.${pdfLine}${signature}`,
    }
  }
  const dueLine = doc.due_date ? `\n\nÉchéance de paiement : ${new Date(doc.due_date).toLocaleDateString('fr-FR')}.` : ''
  if (doc.is_deposit) {
    const about = depositQuote ? ` relative au devis ${depositQuote.reference}` : ''
    return {
      subject: `Facture d'acompte ${doc.reference}`,
      body: `${greet}\n\nVeuillez trouver ci-après la facture d'acompte${about}. Elle sera déduite de la facture finale.\n\nMontant à régler : ${formatAmount(Number(doc.total_ttc))} TTC.${dueLine}${pdfLine}${signature}`,
    }
  }
  return {
    subject: `Facture ${doc.reference}`,
    body: `${greet}\n\nVeuillez trouver ci-après la facture pour la prestation réalisée.\n\nMontant à régler : ${formatAmount(Number(doc.total_ttc))} TTC.${dueLine}${pdfLine}${signature}`,
  }
}
