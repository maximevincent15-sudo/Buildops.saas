import { Link } from 'react-router-dom'

type Props = {
  to?: string
  className?: string
}

export function Logo({ to = '/dashboard', className }: Props) {
  return (
    <Link to={to} className={`logo${className ? ' ' + className : ''}`}>
      <div className="logo-icon">
        <svg viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div className="logo-txt">
        Build<span>Ops</span>
      </div>
    </Link>
  )
}
