import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'

/**
 * Pages réservées aux administrateurs (gestion, réglages, facturation) : un
 * technicien (compte « member ») revient au tableau de bord.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const profile = useAuthStore((s) => s.profile)
  // Profil pas encore chargé : on attend plutôt que de rediriger à tort
  if (!profile) return null
  return (profile.user_role ?? 'admin') === 'admin' ? <>{children}</> : <Navigate to="/dashboard" replace />
}
