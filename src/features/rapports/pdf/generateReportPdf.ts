import { pdf } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { supabase } from '../../../shared/lib/supabase'

const BUCKET = 'report-photos'

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

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '60',
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Ajoute un cache buster pour forcer le rechargement quand on régénère
  return `${data.publicUrl}?t=${Date.now()}`
}
