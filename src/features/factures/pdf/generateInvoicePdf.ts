import { pdf } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { supabase } from '../../../shared/lib/supabase'

const BUCKET = 'report-photos'

export async function generateAndUploadInvoicePdf(
  pdfDocument: ReactElement<DocumentProps>,
  organizationId: string,
  invoiceId: string,
  reference: string,
): Promise<string> {
  const blob = await pdf(pdfDocument).toBlob()
  const safeRef = reference.replace(/[^a-zA-Z0-9-]/g, '-')
  const filename = `${safeRef}.pdf`
  const path = `${organizationId}/invoices/${invoiceId}/${filename}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '60',
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}
