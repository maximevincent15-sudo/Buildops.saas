import { LogOut, Menu, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../auth/api'
import { Logo } from '../../../shared/ui/Logo'

type Props = {
  onToggleSidebar?: () => void
}

export function TopNav({ onToggleSidebar }: Props) {
  const navigate = useNavigate()

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
        <span className="b-plan-pill">Plan Pro</span>
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
