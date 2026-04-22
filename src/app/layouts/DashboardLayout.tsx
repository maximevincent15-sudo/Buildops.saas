import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../../features/dashboard/components/Sidebar'
import { TopNav } from '../../features/dashboard/components/TopNav'
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary'

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Ferme la sidebar mobile quand la route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <>
      <TopNav onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="dash-page">
        <div className={`dash-wrap${sidebarOpen ? ' sidebar-open' : ''}`}>
          <Sidebar />
          {sidebarOpen && (
            <div
              className="sidebar-backdrop"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <main className="dash-main">
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  )
}
