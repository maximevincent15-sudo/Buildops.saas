import { recipientsForClientId } from '../clients/recipients'
import { sendDocumentEmail } from '../email/api'
import type { Intervention } from '../planning/schemas'
import { formatEquipmentTypes } from '../../shared/constants/interventions'
import { markReportSent } from './api'
import { buildDefaultBody, buildDefaultSubject } from './components/SendToClientModal'

/**
 * Envoi automatique d'un rapport finalisé aux destinataires « rapports » du
 * client (Paramètres → Notifications). Rien n'est envoyé si le client n'a pas
 * d'adresse pour les rapports.
 */
export async function sendReportToClientRecipients(args: {
  intervention: Intervention
  reportId: string
  pdfUrl: string
  organizationName: string
  isConform: boolean | null
  anomalyCount: number
}): Promise<void> {
  const { intervention } = args
  const list = await recipientsForClientId(intervention.client_id, 'reports')
  if (list.length === 0) return
  const to = list.join(', ')
  const equipmentLabel = formatEquipmentTypes(intervention.equipment_types)
  const result = await sendDocumentEmail({
    kind: 'report',
    documentId: args.reportId,
    recipientEmail: to,
    subject: buildDefaultSubject({ reference: intervention.reference, clientName: intervention.client_name, equipmentLabel }),
    body: buildDefaultBody({
      reference: intervention.reference,
      clientName: intervention.client_name,
      equipmentLabel,
      organizationName: args.organizationName,
      scheduledDate: intervention.scheduled_date,
      pdfUrl: args.pdfUrl,
      isConform: args.isConform,
      nokCount: args.anomalyCount,
    }),
    pdfUrl: args.pdfUrl,
  }, { mailtoFallback: false })
  if (result.mode === 'resend') await markReportSent(args.reportId, to)
}
