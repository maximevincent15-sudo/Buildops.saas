import { pdf } from '@react-pdf/renderer'
import { linkDossierDocument } from '../../dossiers/api'
import { getInvoicingSettings } from '../../parametres/api'
import { uploadPrivateFile } from '../../../shared/lib/privateFiles'
import { setReceptionReportPdfUrl } from '../receptionReports'
import type { ReceptionReport } from '../receptionReports'
import { ReceptionReportPdf } from './ReceptionReportPdf'

/** Crée (ou refait) le PDF d'un PV, rangé avec son devis et dans le dossier */
export async function buildReceptionReportPdf(
  report: ReceptionReport,
  organizationName: string,
  createdByName: string | null,
): Promise<string> {
  const settings = await getInvoicingSettings(report.organization_id)
  const blob = await pdf(<ReceptionReportPdf report={report} organizationName={organizationName} settings={settings} />).toBlob()
  const fileName = `${report.reference.replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`
  const folder = report.quote_id ? `quotes/${report.quote_id}` : 'reception-reports'
  const stored = await uploadPrivateFile(`${report.organization_id}/${folder}/${fileName}`, blob, { contentType: 'application/pdf', upsert: true })
  const url = `${stored.url}?t=${Date.now()}`
  await setReceptionReportPdfUrl(report.id, url)
  const dossier = report.dossier_number?.trim()
  if (dossier) {
    await linkDossierDocument({
      organizationId: report.organization_id,
      dossierNumber: dossier,
      kind: 'certificate',
      title: `Procès-verbal ${report.reference}`,
      filePath: stored.path,
      fileUrl: stored.url,
      fileName,
      sizeBytes: blob.size,
      createdByName,
    }).catch((e) => console.warn('Rangement du PV dans le dossier échoué', e))
  }
  return url
}
