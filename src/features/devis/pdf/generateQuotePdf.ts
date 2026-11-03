import { pdf } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { uploadPrivateFile } from '../../../shared/lib/privateFiles'

export async function generateAndUploadQuotePdf(
  pdfDocument: ReactElement<DocumentProps>,
  organizationId: string,
  quoteId: string,
  reference: string,
): Promise<string> {
  const blob = await pdf(pdfDocument).toBlob()
  const safeRef = reference.replace(/[^a-zA-Z0-9-]/g, '-')
  const filename = `${safeRef}.pdf`
  const path = `${organizationId}/quotes/${quoteId}/${filename}`

  // Stockage privé : la base garde l'adresse de référence, ouverte par lien temporaire
  const stored = await uploadPrivateFile(path, blob, { contentType: 'application/pdf', upsert: true })
  return `${stored.url}?t=${Date.now()}`
}
