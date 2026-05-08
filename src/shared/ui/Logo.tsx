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
          <path d="M12 2L4 5v6c0 5.25 3.5 9 8 10.5 4.5-1.5 8-5.25 8-10.5V5l-8-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <div className="logo-txt">
        <span>Fir</span>ovia
      </div>
    </Link>
  )
}
