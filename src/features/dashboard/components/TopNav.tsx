import { LogOut, Menu, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut } from '../../auth/api'
import { useSubscription } from '../../billing/hooks'
import { PLAN_OFFERS } from '../../billing/constants'
import { Logo } from '../../../shared/ui/Logo'

type Props = {
  onToggleSidebar?: () => void
}

export function TopNav({ onToggleSidebar }: Props) {
  const navigate = useNavigate()
  const { subscription, isTrialing, isActive, trialDaysLeft } = useSubscription()

  const planLabel = (() => {
    if (!subscription) return null
    if (isActive && subscription.plan) {
      const label = PLAN_OFFERS.find((o) => o.plan === subscription.plan)?.label
      return `Plan ${label ?? subscription.plan}`
    }
    if (isTrialing) {
      const days = trialDaysLeft ?? 0
      if (days <= 0) return 'Essai expiré'
      return `Essai · ${days} j`
    }
    if (subscription.status === 'past_due' || subscription.status === 'unpaid') return 'Paiement en retard'
    if (subscription.status === 'canceled') return 'Annulé'
    return null
  })()

  async function handleSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <nav className="b-topnav">
      <div className="b-topnav-l">
        {onToggleSidebar && (
          <button
            type="button"
            className="b-sb-toggle"
            onClick={onToggleSidebar}
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
        )}
        <Logo />
        <div className="b-search">
          <Search size={14} strokeWidth={2} />
          <span>Rechercher…</span>
          <kbd>⌘ K</kbd>
        </div>
      </div>
      <div className="b-topnav-r">
        {planLabel && (
          <Link to="/abonnement" className="b-plan-pill" style={{ textDecoration: 'none' }}>
            {planLabel}
          </Link>
        )}
        <a href="https://firovia.fr" className="b-btn" target="_blank" rel="noreferrer">
          ← Site
        </a>
        <button type="button" onClick={handleSignOut} className="b-btn">
          <span className="logout-label">Déconnexion</span>
          <LogOut size={14} strokeWidth={1.8} className="logout-icon" />
        </button>
      </div>
    </nav>
  )
}
