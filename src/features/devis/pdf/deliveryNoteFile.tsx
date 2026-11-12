import { getInvoicingSettings } from '../../parametres/api'
import { setDeliveryNotePdfUrl } from '../deliveryNotes'
import type { DeliveryNoteWithLines } from '../schemas'
import { DeliveryNotePdf } from './DeliveryNotePdf'
import { uploadQuoteDocumentPdf } from './generateQuotePdf'

/** Crée (ou refait) le PDF d'un bon de livraison, rangé avec son devis */
export async function buildDeliveryNotePdf(
  note: DeliveryNoteWithLines,
  organizationId: string,
  organizationName: string,
  quoteId: string,
): Promise<string> {
  const settings = await getInvoicingSettings(organizationId)
  const url = await uploadQuoteDocumentPdf(
    <DeliveryNotePdf note={note} organizationName={organizationName} settings={settings} />,
    organizationId,
    quoteId,
    note.reference,
  )
  await setDeliveryNotePdfUrl(note.id, url)
  return url
}
