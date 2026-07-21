import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Sparkles } from 'lucide-react'
import { useSubscription } from '../hooks'

/**
 * Bandeau affiché en haut de toutes les pages authentifiées.
 * Se masque tout seul quand :
 *   - l'user est en abonnement payant actif
 *   - la subscription n'est pas encore chargée
 *   - l'user n'a pas d'organisation (edge case)
 */
export function TrialBanner() {
  const { subscription, isTrialing, isActive, trialDaysLeft, urgency } = useSubscription()

  if (!subscription) return null
  if (isActive) return null // abo payant → pas de bandeau

  // past_due / canceled / unpaid → bandeau spécifique "paiement à régulariser"
  if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    return (
      <div style={bannerStyle('urgent')}>
        <AlertTriangle size={16} strokeWidth={2.5} />
        <span>
          <strong>Paiement en attente.</strong>{' '}
          Régularisez pour continuer à utiliser Firovia sans interruption.
        </span>
        <Link to="/abonnement" style={ctaLinkStyle}>
          Régulariser →
        </Link>
      </div>
    )
  }

  if (subscription.status === 'canceled') {
    return (
      <div style={bannerStyle('urgent')}>
        <AlertTriangle size={16} strokeWidth={2.5} />
        <span>
          <strong>Abonnement annulé.</strong>{' '}
          Réactivez votre plan pour retrouver l'accès complet.
        </span>
        <Link to="/abonnement" style={ctaLinkStyle}>
          Choisir un plan →
        </Link>
      </div>
    )
  }

  if (!isTrialing) return null

  const days = trialDaysLeft ?? 0

  if (urgency === 'expired') {
    return (
      <div style={bannerStyle('urgent')}>
        <AlertTriangle size={16} strokeWidth={2.5} />
        <span>
          <strong>Votre essai gratuit est terminé.</strong>{' '}
          Choisissez un plan pour continuer.
        </span>
        <Link to="/abonnement" style={ctaLinkStyle}>
          Choisir un plan →
        </Link>
      </div>
    )
  }

  const icon = urgency === 'safe'
    ? <Sparkles size={16} strokeWidth={2.5} />
    : <Clock size={16} strokeWidth={2.5} />

  const suffix = days === 1 ? 'jour restant' : 'jours restants'

  return (
    <div style={bannerStyle(urgency)}>
      {icon}
      <span>
        <strong>Essai gratuit — {days} {suffix}</strong>
        {' · '}
        Vous profitez de toutes les fonctionnalités Firovia.
      </span>
      <Link to="/abonnement" style={ctaLinkStyle}>
        Choisir un plan →
      </Link>
    </div>
  )
}

type Urgency = 'safe' | 'warning' | 'urgent' | 'expired'

const PALETTE: Record<Urgency, { bg: string; border: string; fg: string; ctaBg: string }> = {
  safe: {
    bg: '#EAF2FF',
    border: '#B8CDEE',
    fg: '#1E3A5F',
    ctaBg: '#3A5CA8',
  },
  warning: {
    bg: '#FFF4E5',
    border: '#F5C88F',
    fg: '#8A4A00',
    ctaBg: '#E67E22',
  },
  urgent: {
    bg: '#FDECEC',
    border: '#F0B4B4',
    fg: '#9B1C1C',
    ctaBg: '#C0392B',
  },
  expired: {
    bg: '#FDECEC',
    border: '#F0B4B4',
    fg: '#9B1C1C',
    ctaBg: '#C0392B',
  },
}

function bannerStyle(urgency: Urgency): React.CSSProperties {
  const p = PALETTE[urgency]
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '.6rem',
    padding: '.5rem 1rem',
    background: p.bg,
    borderBottom: `1px solid ${p.border}`,
    color: p.fg,
    fontSize: '.85rem',
    lineHeight: 1.35,
    flexWrap: 'wrap',
  }
}

const ctaLinkStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '.35rem .8rem',
  background: '#3A5CA8',
  color: '#fff',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '.8rem',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
