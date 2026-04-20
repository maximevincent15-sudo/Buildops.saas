import { useNavigate } from 'react-router-dom'
import { signOut } from '../../auth/api'
import { Logo } from '../../../shared/ui/Logo'

export function TopNav() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <nav className="topnav">
      <Logo />
      <div className="nav-r">
        <span className="text-[.82rem] text-ink-2">
          Plan <strong className="text-acc">Pro</strong>
        </span>
        <a href="https://buildops.fr" className="btn-sm" target="_blank" rel="noreferrer">
          ← Site
        </a>
        <button type="button" onClick={handleSignOut} className="btn-sm">
          Déconnexion
        </button>
      </div>
    </nav>
  )
}
