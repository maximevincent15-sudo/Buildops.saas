import { ArrowLeft, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportWizard } from '../features/imports/components/ImportWizard'
import { clientsImportDefinition } from '../features/imports/definitions/clientsImport'

export function ImportClientsPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} strokeWidth={1.8} />
            Importer des clients
          </div>
          <div className="dash-sub">
            Migre tes clients depuis ton outil actuel en quelques clics (Excel, CSV, Google Sheets, Optim-BTP…)
          </div>
        </div>
        <Link
          to="/clients"
          className="btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Retour aux clients
        </Link>
      </div>

      <ImportWizard definition={clientsImportDefinition} />
    </>
  )
}
