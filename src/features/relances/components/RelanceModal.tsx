import { Bell, ExternalLink, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import {
  RELANCE_ICONS,
  RELANCE_LABELS,
  buildRelance,
} from '../templates'
import type { RelanceContext, RelanceType } from '../templates'

type Props = {
  open: boolean
  onClose: () => void
  /** Email destinataire pré-rempli */
  recipientEmail?: string | null
  /** Type initial pré-sélectionné */
  initialType?: RelanceType
  /** Si on cache certains types (ex: pas de "facture" sur la fiche client tant que pas de facture) */
  availableTypes?: RelanceType[]
  /** Contexte (sera passé aux templates) */
  context: Omit<RelanceContext, 'organizationName'>
}

const ALL_TYPES: RelanceType[] = ['intervention', 'devis', 'facture', 'general']

export function RelanceModal({
  open,
  onClose,
  recipientEmail,
  initialType = 'general',
  availableTypes = ALL_TYPES,
  context,
}: Props) {
  const profile = useAuthStore((s) => s.profile)
  const orgName = profile?.organizations?.name ?? 'Maintenance'

  const [type, setType] = useState<RelanceType>(initialType)
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setType(initialType)
    setRecipient(recipientEmail ?? '')
    const ctxFull: RelanceContext = { ...context, organizationName: orgName }
    const built = buildRelance(initialType, ctxFull)
    setSubject(built.subject)
    setBody(built.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function changeType(newType: RelanceType) {
    setType(newType)
    const ctxFull: RelanceContext = { ...context, organizationName: orgName }
    const built = buildRelance(newType, ctxFull)
    setSubject(built.subject)
    setBody(built.body)
  }

  function buildMailtoUrl(): string {
    const params = new URLSearchParams()
    if (subject) params.set('subject', subject)
    if (body) params.set('body', body)
    const qs = params.toString().replace(/\+/g, '%20')
    return `mailto:${encodeURIComponent(recipient)}?${qs}`
  }

  function handleSend() {
    if (!recipient.trim()) {
      setError('Indique un destinataire.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      setError('Email invalide.')
      return
    }
    window.location.href = buildMailtoUrl()
    setTimeout(() => onClose(), 1000)
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Bell size={16} strokeWidth={2} />
            Relance — {context.clientName}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Type de relance */}
          <div className="fg">
            <label>Type de relance</label>
            <div className="relance-type-grid">
              {availableTypes.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`relance-type${type === t ? ' on' : ''}`}
                  onClick={() => changeType(t)}
                >
                  <span className="relance-type-emoji">{RELANCE_ICONS[t]}</span>
                  <span>{RELANCE_LABELS[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="fg">
            <label>Destinataire</label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="email@client.fr"
              autoFocus
            />
          </div>

          <div className="fg">
            <label>Objet</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
            />
          </div>

          <div className="fg">
            <label>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="report-textarea"
              style={{ minHeight: 220 }}
            />
            <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
              Tu peux modifier librement. Ta messagerie s'ouvrira avec ce message pré-rempli.
            </span>
          </div>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              className="mf prim"
              onClick={handleSend}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={14} strokeWidth={2} />
              Ouvrir dans ma messagerie
              <ExternalLink size={11} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
