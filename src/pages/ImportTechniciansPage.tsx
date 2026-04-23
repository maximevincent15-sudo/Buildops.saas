import { ArrowLeft, HardHat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportWizard } from '../features/imports/components/ImportWizard'
import { techniciansImportDefinition } from '../features/imports/definitions/techniciansImport'

export function ImportTechniciansPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <HardHat size={22} strokeWidth={1.8} />
            Importer des techniciens
          </div>
          <div className="dash-sub">
            Migre ton équipe depuis Excel ou CSV en quelques clics.
          </div>
        </div>
        <Link
          to="/techniciens"
          className="btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Retour aux techniciens
        </Link>
      </div>

      <ImportWizard definition={techniciansImportDefinition} />
    </>
  )
}
