import { ArrowLeft, Car } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportWizard } from '../features/imports/components/ImportWizard'
import { vehiclesImportDefinition } from '../features/imports/definitions/vehiclesImport'

export function ImportVehiclesPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Car size={22} strokeWidth={1.8} />
            Importer des véhicules
          </div>
          <div className="dash-sub">
            Migre ton parc véhicules avec dates CT, assurance et vidange en un seul import.
          </div>
        </div>
        <Link
          to="/vehicules"
          className="btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Retour aux véhicules
        </Link>
      </div>

      <ImportWizard definition={vehiclesImportDefinition} />
    </>
  )
}
