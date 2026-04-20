import { Link } from 'react-router-dom'
import { Logo } from '../../../shared/ui/Logo'

export function TopNav() {
  return (
    <nav className="topnav">
      <Logo />
      <div className="nav-r">
        <span className="text-[.82rem] text-ink-2">
          Plan <strong className="text-acc">Pro</strong>
        </span>
        <Link to="/" className="btn-sm">
          ← Site
        </Link>
        <Link to="/auth" className="btn-sm">
          Déconnexion
        </Link>
      </div>
    </nav>
  )
}
