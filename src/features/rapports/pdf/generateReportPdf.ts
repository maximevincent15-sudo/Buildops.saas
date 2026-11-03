import { pdf } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { uploadPrivateFile } from '../../../shared/lib/privateFiles'

/**
 * Rend le Document React PDF en Blob puis upload dans le bucket.
 * Retourne l'URL publique du PDF.
 */
export async function generateAndUploadReportPdf(
  pdfDocument: ReactElement<DocumentProps>,
  organizationId: string,
  interventionId: string,
  reference: string,
): Promise<string> {
  const blob = await pdf(pdfDocument).toBlob()
  const safeRef = reference.replace(/[^a-zA-Z0-9-]/g, '-')
  const filename = `rapport-${safeRef}.pdf`
  const path = `${organizationId}/interventions/${interventionId}/${filename}`

  // Stockage privé : la base garde l'adresse de référence, ouverte par lien temporaire
  const stored = await uploadPrivateFile(path, blob, { contentType: 'application/pdf', upsert: true })
  // Ajoute un cache buster pour forcer le rechargement quand on régénère
  return `${stored.url}?t=${Date.now()}`
}
