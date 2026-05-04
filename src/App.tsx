import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './app/layouts/DashboardLayout'
import { PublicLayout } from './app/layouts/PublicLayout'
import { RequireAuth } from './app/RequireAuth'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { AlertesPage } from './pages/AlertesPage'
import { ClientsPage } from './pages/ClientsPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { ImportClientsPage } from './pages/ImportClientsPage'
import { ImportInterventionsPage } from './pages/ImportInterventionsPage'
import { ImportTechniciansPage } from './pages/ImportTechniciansPage'
import { ImportVehiclesPage } from './pages/ImportVehiclesPage'
import { ClientPortalPage } from './pages/ClientPortalPage'
import { DevisPage } from './pages/DevisPage'
import { EquipePage } from './pages/EquipePage'
import { FacturesPage } from './pages/FacturesPage'
import { ParametresPage } from './pages/ParametresPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OvertimePage } from './pages/OvertimePage'
import { VehiculesPage } from './pages/VehiculesPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PlanningPage } from './pages/PlanningPage'
import { RapportEditorPage } from './pages/RapportEditorPage'
import { RapportsListPage } from './pages/RapportsListPage'
import { TechniciensPage } from './pages/TechniciensPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<PublicLayout />}>
        <Route path="/auth" element={<AuthPage />} />
      </Route>

      {/* Portail client : route publique, pas d'auth requise (auth via token URL) */}
      <Route path="/client/:token" element={<ClientPortalPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/rapports" element={<RapportsListPage />} />
          <Route path="/rapports/:interventionId" element={<RapportEditorPage />} />
          <Route path="/alertes" element={<AlertesPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/import" element={<ImportClientsPage />} />
          <Route path="/techniciens/import" element={<ImportTechniciansPage />} />
          <Route path="/vehicules/import" element={<ImportVehiclesPage />} />
          <Route path="/planning/import" element={<ImportInterventionsPage />} />
          <Route path="/techniciens" element={<TechniciensPage />} />
          <Route path="/frais" element={<ExpensesPage />} />
          <Route path="/heures-sup" element={<OvertimePage />} />
          <Route path="/vehicules" element={<VehiculesPage />} />
          <Route path="/devis" element={<DevisPage />} />
          <Route path="/factures" element={<FacturesPage />} />
          <Route path="/archivage" element={<PlaceholderPage title="Archivage" description="Documents archivés par site et par intervention." />} />
          <Route path="/parametres" element={<ParametresPage />} />
          <Route path="/equipe" element={<EquipePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
