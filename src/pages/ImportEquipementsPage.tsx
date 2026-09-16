import { ArrowLeft, Boxes } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportWizard } from '../features/imports/components/ImportWizard'
import { equipmentsImportDefinition } from '../features/imports/definitions/equipmentsImport'

export function ImportEquipementsPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Boxes size={22} strokeWidth={1.8} />
            Importer des équipements
          </div>
          <div className="dash-sub">
            Migre ton registre APSAD depuis Excel ou CSV — extincteurs, RIA, BAES, portes coupe-feu…
          </div>
        </div>
        <Link
          to="/equipements"
          className="btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Retour à l'inventaire
        </Link>
      </div>

      <ImportWizard definition={equipmentsImportDefinition} />
    </>
  )
}
