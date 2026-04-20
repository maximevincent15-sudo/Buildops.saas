import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'

export function RequireAuth() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-2 font-light">
        Chargement...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <Outlet />
}
