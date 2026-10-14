import { ArrowLeft, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImportWizard } from '../features/imports/components/ImportWizard'
import { catalogImportDefinition } from '../features/imports/definitions/catalogImport'

export function ImportCatalogPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={22} strokeWidth={1.8} />
            Importer un catalogue
          </div>
          <div className="dash-sub">
            Reprends ta liste de prix depuis Excel ou CSV en quelques clics.
          </div>
        </div>
        <Link
          to="/catalogue"
          className="btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Retour au catalogue
        </Link>
      </div>

      <ImportWizard definition={catalogImportDefinition} />
    </>
  )
}
