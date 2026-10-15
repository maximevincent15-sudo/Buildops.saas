import { FileSignature } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAmount } from '../../devis/constants'
import { listContractsForClient } from '../api'
import { CONTRACT_STATUS_BADGE, CONTRACT_STATUS_LABELS, contractAnnualTotals } from '../schemas'
import type { ContractWithDetails } from '../schemas'

/** Contrats du client, dans sa fiche (lien vers la page Contrats) */
export function ClientContractsSection({ clientId }: { clientId: string }) {
  const [contracts, setContracts] = useState<ContractWithDetails[] | null>(null)

  useEffect(() => {
    let alive = true
    listContractsForClient(clientId).then((c) => { if (alive) setContracts(c) }, () => { if (alive) setContracts([]) })
    return () => { alive = false }
  }, [clientId])

  if (contracts === null) return null

  return (
    <div className="card history-card">
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileSignature size={14} strokeWidth={1.8} /> Contrats de maintenance
        </span>
        <Link to="/contrats" className="text-xs" style={{ color: 'var(--acc)', fontWeight: 500 }}>
          {contracts.length === 0 ? 'Créer un contrat' : 'Tous les contrats'}
        </Link>
      </div>
      {contracts.length === 0 && (
        <p className="text-ink-3 text-xs font-light" style={{ margin: 0 }}>Aucun contrat pour ce client.</p>
      )}
      {contracts.map((c) => (
        <Link
          key={c.id}
          to={`/contrats?open=${c.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.5rem 0', borderTop: '1px solid var(--brd)', color: 'inherit', textDecoration: 'none', fontSize: '.85rem' }}
        >
          <span style={{ flex: 1 }}>
            <strong style={{ fontWeight: 500 }}>{c.reference}</strong>
            <span className="text-ink-3 text-xs"> · {c.site_ids.length} site{c.site_ids.length > 1 ? 's' : ''}{c.title ? ` · ${c.title}` : ''}</span>
          </span>
          <span className={`badge ${CONTRACT_STATUS_BADGE[c.status]}`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatAmount(contractAnnualTotals(c.lines).ht)} / an</span>
        </Link>
      ))}
    </div>
  )
}
