import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4 bg-bg">
      <h1 className="font-display text-6xl font-extrabold text-ink">404</h1>
      <p className="text-ink-2">Page introuvable</p>
      <Link to="/" className="text-acc hover:underline text-sm">
        ← Retour à l'accueil
      </Link>
    </div>
  )
}
