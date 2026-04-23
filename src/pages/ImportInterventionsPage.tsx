import { ArrowLeft, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportWizard } from '../features/imports/components/ImportWizard'
import { interventionsImportDefinition } from '../features/imports/definitions/interventionsImport'

export function ImportInterventionsPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <CalendarDays size={22} strokeWidth={1.8} />
            Importer des interventions
          </div>
          <div className="dash-sub">
            Migre ton planning (à venir) et ton historique (interventions passées) en un seul fichier. Les interventions terminées alimenteront directement les alertes réglementaires.
          </div>
        </div>
        <Link
          to="/planning"
          className="btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Retour au planning
        </Link>
      </div>

      <ImportWizard definition={interventionsImportDefinition} />
    </>
  )
}
