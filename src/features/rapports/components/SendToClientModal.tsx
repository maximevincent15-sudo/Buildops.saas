import { ExternalLink, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { getClient } from '../../clients/api'
import { sendDocumentEmail } from '../../email/api'
import { markReportSent } from '../api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

type Props = {
  open: boolean
  onClose: () => void
  onSent?: () => void
  reportId: string
  pdfUrl: string | null
  reference: string
  clientId: string | null
  clientName: string
  equipmentLabel: string
  organizationName: string
  scheduledDate: string | null
  isConform: boolean | null
  nokCount: number
  previousEmail: string | null
}

function formatDateLong(d: string | null): string {
  if (!d) return ''
  try {
    return format(new Date(d), 'd MMMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function buildDefaultSubject(input: {
  reference: string
  clientName: string
  equipmentLabel: string
}) {
  return `Rapport d'intervention ${input.reference} — ${input.equipmentLabel}`
}

function buildDefaultBody(input: {
  reference: string
  clientName: string
  equipmentLabel: string
  organizationName: string
  scheduledDate: string | null
  pdfUrl: string | null
  isConform: boolean | null
  nokCount: number
}): string {
  const dateLabel = input.scheduledDate ? ` le ${formatDateLong(input.scheduledDate)}` : ''
  const greeting = `Bonjour,

Suite à notre intervention${dateLabel} sur ${input.equipmentLabel} chez ${input.clientName}, vous trouverez ci-dessous le lien vers le rapport détaillé.`

  const conformity =
    input.isConform === true
      ? `\n\n✅ Rapport CONFORME : tous les points de contrôle sont conformes.`
      : input.isConform === false
        ? `\n\n⚠️ Rapport NON CONFORME : ${input.nokCount} anomalie${input.nokCount > 1 ? 's' : ''} détectée${input.nokCount > 1 ? 's' : ''}. Les actions recommandées sont détaillées dans le rapport.`
        : ''

  const pdfLine = input.pdfUrl
    ? `\n\n📄 Télécharger le rapport (PDF) :\n${input.pdfUrl}`
    : `\n\n(Le PDF est en cours de génération — un lien sera envoyé dès qu'il est disponible.)`

  const closing = `\n\nJe reste à votre disposition pour toute question.\n\nCordialement,\n${input.organizationName}`

  return greeting + conformity + pdfLine + closing
}

export function SendToClientModal({
  open,
  onClose,
  onSent,
  reportId,
  pdfUrl,
  reference,
  clientId,
  clientName,
  equipmentLabel,
  organizationName,
  scheduledDate,
  isConform,
  nokCount,
  previousEmail,
}: Props) {
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loadingClient, setLoadingClient] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentHint, setSentHint] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSentHint(false)
    setSubject(buildDefaultSubject({ reference, clientName, equipmentLabel }))
    setBody(
      buildDefaultBody({
        reference,
        clientName,
        equipmentLabel,
        organizationName,
        scheduledDate,
        pdfUrl,
        isConform,
        nokCount,
      }),
    )
    // Destinataire : priorité à ce qui a déjà été envoyé, sinon email du client
    if (previousEmail) {
      setRecipient(previousEmail)
    } else if (clientId) {
      setLoadingClient(true)
      void getClient(clientId)
        .then((c) => {
          if (c?.contact_email) setRecipient(c.contact_email)
        })
        .catch(() => { /* ignore */ })
        .finally(() => setLoadingClient(false))
    } else {
      setRecipient('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !sending) onClose()
  }

  async function handleSend() {
    if (!recipient.trim()) {
      setError('Indique un destinataire.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      setError('Email invalide.')
      return
    }
    setSending(true)
    setError(null)
    try {
      // 1. Marquer le rapport comme envoyé en base
      await markReportSent(reportId, recipient.trim())

      // 2. Tenter l'envoi via Resend (avec PDF en pièce jointe).
      //    Fallback automatique sur mailto: si Resend n'est pas configuré.
      const result = await sendDocumentEmail({
        kind: 'report',
        documentId: reportId,
        recipientEmail: recipient.trim(),
        subject,
        body,
        pdfUrl,
      })

      if (result.mode === 'resend' && result.success) {
        // Envoi automatique réussi
        setSentHint(true)
      } else if (result.mode === 'mailto') {
        // La messagerie par défaut s'est ouverte
        setSentHint(true)
      }

      setTimeout(() => {
        onSent?.()
        onClose()
      }, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSending(false)
    }
  }

  async function handleCopyLink() {
    if (!pdfUrl) return
    try {
      await navigator.clipboard.writeText(pdfUrl)
      setSentHint(true)
      setTimeout(() => setSentHint(false), 2000)
    } catch {
      // ignore
    }
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} strokeWidth={2} />
            Envoyer le rapport au client
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="text-ink-2 text-sm font-light" style={{ margin: 0 }}>
            Le rapport va s'ouvrir dans <strong>ta messagerie</strong> (Gmail, Mail, Outlook…) avec tout pré-rempli.
            Le client reçoit un email <strong>depuis ton adresse</strong> avec le <strong>lien de téléchargement du PDF</strong>.
          </p>

          <div className="fg">
            <label>Destinataire</label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={loadingClient ? 'Chargement…' : 'email@client.fr'}
              autoFocus
            />
            {!recipient && !loadingClient && !clientId && (
              <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
                Ce rapport n'est pas lié à une fiche client — saisis l'email manuellement.
              </span>
            )}
          </div>

          <div className="fg">
            <label>Objet</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="fg">
            <label>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="report-textarea"
              style={{ minHeight: 200 }}
            />
          </div>

          {!pdfUrl && (
            <p className="text-red text-xs">
              ⚠️ Aucun PDF n'est disponible — génère-le d'abord avant d'envoyer.
            </p>
          )}

          {error && <span className="ferr on">{error}</span>}

          {sentHint && (
            <p className="text-grn text-sm" style={{ margin: 0 }}>
              ✅ Ta messagerie devrait s'ouvrir — finalise l'envoi depuis celle-ci.
            </p>
          )}

          <div className="modal-foot">
            {pdfUrl && (
              <button
                type="button"
                className="mf out"
                onClick={() => void handleCopyLink()}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="Copier le lien du PDF pour le coller dans un autre outil"
              >
                <ExternalLink size={14} strokeWidth={2} />
                Copier le lien PDF
              </button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={sending}>
              Annuler
            </button>
            <button
              type="button"
              className="mf prim"
              onClick={() => void handleSend()}
              disabled={sending || !pdfUrl}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={14} strokeWidth={2} />
              {sending ? 'Ouverture…' : 'Ouvrir dans ma messagerie'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
