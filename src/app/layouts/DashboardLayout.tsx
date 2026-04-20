import { Outlet } from 'react-router-dom'
import { Sidebar } from '../../features/dashboard/components/Sidebar'
import { TopNav } from '../../features/dashboard/components/TopNav'

export function DashboardLayout() {
  return (
    <>
      <TopNav />
      <div className="dash-page">
        <div className="dash-wrap">
          <Sidebar />
          <main className="dash-main">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  )
}
