import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEquipmentTypes } from '../../../shared/constants/interventions'
import type { VisitToInvoice } from '../visitBilling'

type Props = {
  visits: VisitToInvoice[]
  /** Visite dont la facture est en préparation (bouton désactivé) */
  preparingId: string | null
  onInvoice: (visit: VisitToInvoice) => void
}

const FIRST_ROWS = 5

function visitDate(v: VisitToInvoice): string {
  const d = v.scheduled_date ?? v.completed_at
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

/** Visites terminées (rapport finalisé), hors contrat, qui n'ont pas encore de facture */
export function VisitsToInvoiceCard({ visits, preparingId, onInvoice }: Props) {
  const [showAll, setShowAll] = useState(false)
  if (visits.length === 0) return null
  const shown = showAll ? visits : visits.slice(0, FIRST_ROWS)

  return (
    <div className="card" id="a-facturer" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Receipt size={15} strokeWidth={2} />
          Visites à facturer ({visits.length})
        </span>
        <span className="text-ink-3 text-xs font-light">
          Rapport finalisé, hors contrat, sans facture
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((v) => (
          <div
            key={v.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '.75rem',
              padding: '.55rem 0',
              borderTop: '1px solid var(--brd)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <div className="text-sm" style={{ fontWeight: 600 }}>
                {v.client_name}
                {v.site_name && <span className="text-ink-2 font-light"> · {v.site_name}</span>}
              </div>
              <div className="text-ink-3 text-xs font-light">
                {visitDate(v)} · <Link to={`/rapports/${v.id}`}>{v.reference}</Link>
                {v.equipment_types && v.equipment_types.length > 0 && <> · {formatEquipmentTypes(v.equipment_types)}</>}
              </div>
            </div>
            <button
              type="button"
              className="btn-sm acc"
              disabled={preparingId !== null}
              onClick={() => onInvoice(v)}
            >
              {preparingId === v.id ? 'Préparation…' : 'Facturer'}
            </button>
          </div>
        ))}
      </div>
      {visits.length > FIRST_ROWS && (
        <button type="button" className="btn-sm" style={{ marginTop: '.5rem' }} onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Réduire' : `Afficher les ${visits.length} visites`}
        </button>
      )}
    </div>
  )
}
