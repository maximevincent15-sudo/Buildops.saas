import { CalendarPlus, Mail, MapPin, Phone } from 'lucide-react'
import type { MouseEvent } from 'react'

type Props = {
  /** Téléphone : ouvre l'app de téléphone (mobile) ou copie au clic (desktop). */
  phone?: string | null
  /** Email : ouvre la messagerie par défaut. */
  email?: string | null
  /** Adresse : ouvre Google Maps avec la recherche pré-remplie. */
  address?: string | null
  /** Si fourni, callback appelé pour télécharger l'événement .ics (ex: une intervention). */
  onAddToCalendar?: () => void
  /** Mode compact (icône seulement) ou normal (icône + label). */
  compact?: boolean
  /** Événement clic (utile pour stopPropagation dans des lignes cliquables) */
  onActionClick?: (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void
}

function safeStop(
  e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
  cb?: (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void,
) {
  e.stopPropagation()
  cb?.(e)
}

function buildMapsUrl(address: string): string {
  // Format universel qui marche sur Google Maps web + mobile + Apple Maps via fallback navigateur
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function buildTelUrl(phone: string): string {
  // tel: accepte les espaces, mais c'est plus propre sans
  return `tel:${phone.replace(/[\s.-]/g, '')}`
}

export function QuickActions({
  phone,
  email,
  address,
  onAddToCalendar,
  compact = true,
  onActionClick,
}: Props) {
  const hasAny = !!(phone || email || address || onAddToCalendar)
  if (!hasAny) return null

  return (
    <div className={`quick-actions${compact ? ' compact' : ''}`}>
      {phone && (
        <a
          href={buildTelUrl(phone)}
          className="qa-btn"
          title={`Appeler ${phone}`}
          aria-label={`Appeler ${phone}`}
          onClick={(e) => safeStop(e, onActionClick)}
        >
          <Phone size={13} strokeWidth={2} />
          {!compact && <span>Appeler</span>}
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="qa-btn"
          title={`Envoyer un mail à ${email}`}
          aria-label={`Envoyer un mail à ${email}`}
          onClick={(e) => safeStop(e, onActionClick)}
        >
          <Mail size={13} strokeWidth={2} />
          {!compact && <span>Mail</span>}
        </a>
      )}
      {address && (
        <a
          href={buildMapsUrl(address)}
          target="_blank"
          rel="noreferrer"
          className="qa-btn"
          title={`Voir sur Maps : ${address}`}
          aria-label={`Voir sur Maps : ${address}`}
          onClick={(e) => safeStop(e, onActionClick)}
        >
          <MapPin size={13} strokeWidth={2} />
          {!compact && <span>Maps</span>}
        </a>
      )}
      {onAddToCalendar && (
        <button
          type="button"
          className="qa-btn"
          title="Ajouter à mon calendrier (.ics)"
          aria-label="Ajouter à mon calendrier"
          onClick={(e) => {
            safeStop(e, onActionClick)
            onAddToCalendar()
          }}
        >
          <CalendarPlus size={13} strokeWidth={2} />
          {!compact && <span>Calendrier</span>}
        </button>
      )}
    </div>
  )
}
