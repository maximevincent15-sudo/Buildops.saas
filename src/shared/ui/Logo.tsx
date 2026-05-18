import { Link } from 'react-router-dom'

type Props = {
  to?: string
  className?: string
}

/**
 * Logo Firovia — Wordmark seul (sans icône).
 *
 * Choix design : wordmark Syne suffisant pour l'app — premium, intemporel,
 * sectoriellement neutre (compatible évolution BTP global). Le mark "F sur
 * bleu" reste utilisé uniquement pour le favicon (contexte carré obligatoire).
 */
export function Logo({ to = '/dashboard', className }: Props) {
  return (
    <Link to={to} className={`logo${className ? ' ' + className : ''}`}>
      <div className="logo-txt">
        <span>Fir</span>ovia
      </div>
    </Link>
  )
}
