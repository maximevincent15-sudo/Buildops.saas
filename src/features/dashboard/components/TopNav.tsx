import { LogOut, Menu } from 'lucide-react'
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
    <nav className="topnav">
      <div className="topnav-left">
        {onToggleSidebar && (
          <button
            type="button"
            className="sb-toggle"
            onClick={onToggleSidebar}
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
        )}
        <Logo />
      </div>
      <div className="nav-r">
        <span className="plan-label">
          Plan <strong className="text-acc">Pro</strong>
        </span>
        <a href="https://buildops-site.vercel.app" className="btn-sm site-btn" target="_blank" rel="noreferrer">
          ← Site
        </a>
        <button type="button" onClick={handleSignOut} className="btn-sm logout-btn">
          <span className="logout-label">Déconnexion</span>
          <LogOut size={15} strokeWidth={1.8} className="logout-icon" />
        </button>
      </div>
    </nav>
  )
}
