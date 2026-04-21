import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './app/layouts/DashboardLayout'
import { PublicLayout } from './app/layouts/PublicLayout'
import { RequireAuth } from './app/RequireAuth'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { ClientsPage } from './pages/ClientsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PlanningPage } from './pages/PlanningPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<PublicLayout />}>
        <Route path="/auth" element={<AuthPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/rapports" element={<PlaceholderPage title="Rapports d'intervention" description="Module 2 — à construire. Checklist, photos, signature, PDF auto." />} />
          <Route path="/alertes" element={<PlaceholderPage title="Alertes réglementaires" description="Toutes les échéances réglementaires par site et équipement." />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/techniciens" element={<PlaceholderPage title="Techniciens" description="Gestion des techniciens et de leurs disponibilités." />} />
          <Route path="/devis" element={<PlaceholderPage title="Devis" description="Création et suivi des devis clients." />} />
          <Route path="/factures" element={<PlaceholderPage title="Factures" description="Facturation et relances." />} />
          <Route path="/archivage" element={<PlaceholderPage title="Archivage" description="Documents archivés par site et par intervention." />} />
          <Route path="/parametres" element={<PlaceholderPage title="Paramètres" description="Configuration du compte et de l'organisation." />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
