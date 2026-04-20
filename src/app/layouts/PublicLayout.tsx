import { Outlet } from 'react-router-dom'

export function PublicLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <Outlet />
    </div>
  )
}
