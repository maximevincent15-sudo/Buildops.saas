import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../../features/dashboard/components/Sidebar'
import { TopNav } from '../../features/dashboard/components/TopNav'
import { TrialBanner } from '../../features/billing/components/TrialBanner'
import { useSubscription } from '../../features/billing/hooks'
import { IdleLogout } from '../../features/auth/components/IdleLogout'
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary'
import { OfflineBanner } from '../../shared/ui/OfflineBanner'

// Pages accessibles même quand l'essai est expiré ou l'abonnement terminé
const ALLOWED_WHEN_BLOCKED = ['/abonnement']

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  // Essai expiré / abonnement résilié ou impayé → redirection vers le paiement.
  // En cas d'erreur de chargement, on laisse passer (fail open).
  const { isBlocked, loading: subscriptionLoading } = useSubscription()

  // Ferme la sidebar mobile quand la route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!subscriptionLoading && isBlocked && !ALLOWED_WHEN_BLOCKED.includes(location.pathname)) {
    return <Navigate to="/abonnement" replace />
  }

  return (
    <>
      <OfflineBanner />
      <TopNav onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <TrialBanner />
      <Sidebar />
      {sidebarOpen && (
        <div
          className={`b-sidebar-backdrop${sidebarOpen ? ' show' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <main className="b-main">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <IdleLogout />
    </>
  )
}
