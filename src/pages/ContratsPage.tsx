import { FileSignature, Receipt, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listContracts } from '../features/contrats/api'
import { ContractBillingModal } from '../features/contrats/components/ContractBillingModal'
import { ContractModal } from '../features/contrats/components/ContractModal'
import {
  BILLING_MODE_LABELS, CONTRACT_STATUS_BADGE, CONTRACT_STATUS_LABELS, contractAnnualTotals, currentPeriodEnd, fixedEnd, noticeDeadline,
  pendingRevision, todayIso,
} from '../features/contrats/schemas'
import type { ContractStatus, ContractWithDetails } from '../features/contrats/schemas'
import { formatAmount } from '../features/devis/constants'
import { matchesSearch } from '../shared/lib/search'
import { useModuleEnabled } from '../features/parametres/modules'

function frDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y!, m! - 1, d!).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
}

export function ContratsPage() {
  // « Facturer le mois » crée des factures : masqué si le module Factures l'est
  const facturesEnabled = useModuleEnabled()('factures')
  const [searchParams, setSearchParams] = useSearchParams()
  const [contracts, setContracts] = useState<ContractWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [flashToInvoices, setFlashToInvoices] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'running' | 'all' | ContractStatus>('running')
  const [editing, setEditing] = useState<ContractWithDetails | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  // Facturation : réservée aux administrateurs, comme la page Factures
  const isAdmin = (useAuthStore((st) => st.profile?.user_role) ?? 'admin') === 'admin'

  async function load() {
    setLoading(true)
    try {
      const data = await listContracts()
      setContracts(data)
      setError(null)
      // Ouverture directe par lien (?open=<id>), ex. depuis la fiche client
      const openId = searchParams.get('open')
      if (openId) {
        const target = data.find((c) => c.id === openId)
        if (target) { setEditing(target); setModalOpen(true) }
        searchParams.delete('open')
        setSearchParams(searchParams, { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(() => contracts.filter((c) => {
    if (statusFilter === 'running' && c.status !== 'active' && c.status !== 'suspended' && c.status !== 'draft') return false
    if (statusFilter !== 'running' && statusFilter !== 'all' && c.status !== statusFilter) return false
    return matchesSearch(search, [c.reference, c.client_name, c.title, c.notes])
  }), [contracts, statusFilter, search])

  const running = contracts.filter((c) => c.status === 'active')
  const annualActiveHt = running.reduce((sum, c) => sum + contractAnnualTotals(c.lines).ht, 0)

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Contrats</div>
          <div className="dash-sub">
            {contracts.length === 0
              ? 'Tes contrats de maintenance : sites couverts, prestations, échéances et visites'
              : `${running.length} contrat${running.length > 1 ? 's' : ''} actif${running.length > 1 ? 's' : ''} · ${formatAmount(annualActiveHt)} HT par an`}
          </div>
        </div>
        <div className="dash-acts">
          {isAdmin && facturesEnabled && contracts.length > 0 && (
            <button type="button" className="mf out" onClick={() => setBillingOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={13} strokeWidth={2} /> Facturer le mois
            </button>
          )}
          <button type="button" className="btn-sm acc" onClick={openCreate}>+ Nouveau contrat</button>
        </div>
      </div>

      {flash && (
        <div className="card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.6rem', background: '#E6F4EB', border: '1px solid #B7DFC7', color: '#0E7A3F', fontSize: '.85rem' }}>
          <span style={{ flex: 1 }}>
            {flash}
            {flashToInvoices && (
              <>{' '}<Link to="/factures?onglet=draft" style={{ color: 'inherit', fontWeight: 600 }}>Voir dans Factures →</Link></>
            )}
          </span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}
        {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

        {!loading && !error && contracts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <FileSignature size={28} strokeWidth={1.6} style={{ color: 'var(--ink3)', marginBottom: '.6rem' }} />
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>Aucun contrat pour le moment.</p>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '1.2rem', maxWidth: 520, marginInline: 'auto' }}>
              Un contrat relie un client, ses sites et ses prestations à un prix annuel. Firovia planifie ses visites,
              les enchaîne d'une année sur l'autre et t'alertera avant chaque échéance.
            </p>
            <button type="button" className="btn-sm acc" onClick={openCreate}>+ Créer mon premier contrat</button>
          </div>
        )}

        {!loading && !error && contracts.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
                <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
                <input className="input-sm" type="search" placeholder="Rechercher (client, référence…)" value={search}
                  onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 30, width: '100%', display: 'block' }} />
              </div>
              <select className="input-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                <option value="running">En cours (actifs, suspendus, brouillons)</option>
                <option value="all">Tous</option>
                {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => <option key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '.75rem' }}>
                    <th style={{ padding: '.5rem' }}>Contrat</th>
                    <th style={{ padding: '.5rem' }}>Statut</th>
                    <th style={{ padding: '.5rem' }}>Sites</th>
                    <th style={{ padding: '.5rem' }}>Facturation</th>
                    <th style={{ padding: '.5rem' }}>Échéance</th>
                    <th style={{ padding: '.5rem', textAlign: 'right' }}>Par an HT</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => {
                    const running = c.status === 'active' || c.status === 'suspended'
                    const end = running ? currentPeriodEnd(c) : null
                    const deadline = c.status === 'active' ? noticeDeadline(c) : null
                    const soon = end !== null && daysUntil(end) <= 60
                    const revision = pendingRevision(c)
                    const lapsed = running && !end ? fixedEnd(c) : null
                    return (
                      <tr key={c.id} onClick={() => { setEditing(c); setModalOpen(true) }} style={{ cursor: 'pointer', borderTop: '1px solid var(--brd)' }}>
                        <td style={{ padding: '.6rem .5rem' }}>
                          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{c.client_name}</div>
                          <div className="text-ink-3 text-xs">{c.reference}{c.title ? ` · ${c.title}` : ''}</div>
                        </td>
                        <td style={{ padding: '.6rem .5rem' }}>
                          <span className={`badge ${CONTRACT_STATUS_BADGE[c.status]}`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
                        </td>
                        <td style={{ padding: '.6rem .5rem' }} className="text-ink-2">{c.site_ids.length}</td>
                        <td style={{ padding: '.6rem .5rem' }} className="text-ink-2">{BILLING_MODE_LABELS[c.billing_mode]}</td>
                        <td style={{ padding: '.6rem .5rem', whiteSpace: 'nowrap' }}>
                          {end ? (
                            <>
                              <span style={{ color: soon ? 'var(--org, #C45A1A)' : 'var(--ink2)', fontWeight: soon ? 600 : 400 }}>{frDate(end)}</span>
                              {deadline && <div className="text-ink-3 text-xs">{deadline < todayIso() ? 'préavis dépassé' : `préavis avant le ${frDate(deadline)}`}</div>}
                            </>
                          ) : lapsed ? (
                            <span style={{ color: 'var(--red)', fontWeight: 600 }}>échu le {frDate(lapsed)}</span>
                          ) : c.status === 'terminated' ? (
                            <span className="text-ink-3 text-xs">résilié le {frDate(c.terminated_on)}</span>
                          ) : '—'}
                          {revision && (
                            <div style={{ marginTop: 2 }}>
                              <span className="badge b-org">Révision {revision.rate > 0 ? '+' : ''}{String(revision.rate).replace('.', ',')} % à appliquer</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '.6rem .5rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {formatAmount(contractAnnualTotals(c.lines).ht)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {visible.length === 0 && (
                <p className="text-ink-3 text-sm font-light" style={{ textAlign: 'center', padding: '1.5rem' }}>Aucun contrat ne correspond.</p>
              )}
            </div>
          </>
        )}
      </div>

      {billingOpen && (
        <ContractBillingModal
          open={billingOpen}
          onClose={() => setBillingOpen(false)}
          onDone={(message) => { setFlash(message); setFlashToInvoices(true) }}
        />
      )}

      {modalOpen && (
        <ContractModal
          key={editing?.id ?? 'new'}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={(message) => { setFlash(message); setFlashToInvoices(false); void load() }}
          contract={editing}
        />
      )}
    </>
  )
}
