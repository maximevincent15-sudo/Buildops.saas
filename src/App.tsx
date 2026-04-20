import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './app/layouts/DashboardLayout'
import { PublicLayout } from './app/layouts/PublicLayout'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route element={<PublicLayout />}>
        <Route path="/auth" element={<AuthPage />} />
      </Route>
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
