import { Calculator, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { CatalogPicker } from '../../catalogue/components/CatalogPicker'
import type { CatalogItem } from '../../catalogue/schemas'
import type { Client } from '../../clients/schemas'
import { VAT_RATES, formatAmount } from '../../devis/constants'
import { listSites } from '../../equipment/api'
import { EQUIPMENT_FAMILIES, EQUIPMENT_FAMILY_LABELS } from '../../equipment/schemas'
import type { EquipmentFamily, Site } from '../../equipment/schemas'
import { ClientAutocomplete } from '../../planning/components/ClientAutocomplete'
import {
  applyContractRevision, countEquipmentOnSites, deleteContract, expireContract, listUpcomingContractVisits, planContractVisits,
  renewContract, saveContract, terminateContract,
} from '../api'
import {
  BILLING_FREQUENCY_LABELS, BILLING_MODE_LABELS, CONTRACT_STATUS_LABELS, FAMILY_DEFAULT_FREQUENCY, FREQUENCY_LABELS,
  contractAnnualTotals, currentPeriodEnd, fixedEnd, lineAnnualHt, noticeDeadline, pendingRevision, revisedPrice,
} from '../schemas'
import type {
  ContractBillingMode, ContractFrequency, ContractLine, ContractStatus, ContractWithDetails,
} from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  /** message : résumé à afficher (visites créées, résiliation…) */
  onSaved: (message: string) => void
  contract: ContractWithDetails | null
}

const FREQUENCIES: ContractFrequency[] = ['annual', 'semiannual', 'quarterly']

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function frDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const now = new Date()
  return Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000)
}

function pct(rate: number): string {
  return `${rate > 0 ? '+' : ''}${String(rate).replace('.', ',')} %`
}

function emptyLine(position: number): ContractLine {
  return {
    position, site_id: null, catalog_item_id: null, equipment_family: null,
    description: '', quantity: 1, unit_price_ht: 0, vat_rate: 20, frequency: 'annual',
  }
}

function parseNumber(text: string): number {
  const n = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function ContractModal({ open, onClose, onSaved, contract }: Props) {
  const organizationId = useAuthStore((s) => s.profile?.organization_id)
  const isEdit = contract !== null

  const [clientName, setClientName] = useState(contract?.client_name ?? '')
  const [clientId, setClientId] = useState<string | null>(contract?.client_id ?? null)
  const [title, setTitle] = useState(contract?.title ?? '')
  const [status, setStatus] = useState<ContractStatus>(contract?.status ?? 'active')
  const [startDate, setStartDate] = useState(contract?.start_date ?? todayIso())
  const [initialMonths, setInitialMonths] = useState(contract?.initial_months ?? 12)
  const [tacitRenewal, setTacitRenewal] = useState(contract?.tacit_renewal ?? true)
  const [noticeMonths, setNoticeMonths] = useState(contract?.notice_months ?? 3)
  const [billingMode, setBillingMode] = useState<ContractBillingMode>(contract?.billing_mode ?? 'per_visit')
  const [billingFrequency, setBillingFrequency] = useState<ContractFrequency>(contract?.billing_frequency ?? 'annual')
  const [revisionRate, setRevisionRate] = useState(contract?.revision_rate != null ? String(contract.revision_rate) : '')
  const [notes, setNotes] = useState(contract?.notes ?? '')
  const [siteIds, setSiteIds] = useState<string[]>(contract?.site_ids ?? [])
  const [lines, setLines] = useState<ContractLine[]>(contract?.lines.length ? contract.lines : [emptyLine(0)])

  const [sites, setSites] = useState<Site[]>([])
  const [counting, setCounting] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Résiliation
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [terminatedOn, setTerminatedOn] = useState(todayIso())
  const [terminationReason, setTerminationReason] = useState('')
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null)
  const [deleteUpcoming, setDeleteUpcoming] = useState(false)

  // Sites du client sélectionné
  useEffect(() => {
    if (!clientId) return
    let alive = true
    listSites(clientId).then((s) => { if (alive) setSites(s) }, () => { if (alive) setSites([]) })
    return () => { alive = false }
  }, [clientId])

  useEffect(() => {
    if (!terminateOpen || !contract) return
    listUpcomingContractVisits(contract.id).then((v) => setUpcomingCount(v.length), () => setUpcomingCount(0))
  }, [terminateOpen, contract])

  // Sans client choisi, aucun site proposé
  const clientSites = clientId ? sites : []
  const totals = useMemo(() => contractAnnualTotals(lines.filter((l) => l.description.trim())), [lines])
  const periodEnd = currentPeriodEnd({ start_date: startDate, initial_months: initialMonths, tacit_renewal: tacitRenewal })
  const deadline = noticeDeadline({ start_date: startDate, initial_months: initialMonths, tacit_renewal: tacitRenewal, notice_months: noticeMonths })

  if (!open) return null

  function updateLine(index: number, patch: Partial<ContractLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addLine(line: ContractLine) {
    setLines((prev) => {
      const last = prev[prev.length - 1]
      const lastIsEmpty = !!last && !last.description.trim() && !last.unit_price_ht
      const next = lastIsEmpty ? [...prev.slice(0, -1), line] : [...prev, line]
      return next.map((l, i) => ({ ...l, position: i }))
    })
  }

  function addCatalogItem(item: CatalogItem) {
    addLine({ ...emptyLine(0), catalog_item_id: item.id, description: item.label, unit_price_ht: item.unit_price_ht, vat_rate: item.vat_rate })
  }

  function addFlatFee() {
    addLine({ ...emptyLine(0), description: 'Forfait annuel de maintenance', quantity: 1 })
  }

  function setFamily(index: number, family: EquipmentFamily | null) {
    updateLine(index, { equipment_family: family, ...(family ? { frequency: FAMILY_DEFAULT_FREQUENCY[family] } : {}) })
  }

  async function countFromInventory(index: number) {
    const line = lines[index]
    if (!line?.equipment_family) return
    const targetSites = line.site_id ? [line.site_id] : siteIds
    setCounting(index)
    try {
      const n = await countEquipmentOnSites(targetSites, line.equipment_family)
      updateLine(index, { quantity: n })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comptage impossible')
    } finally {
      setCounting(null)
    }
  }

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSave() {
    if (!organizationId) return
    if (!clientName.trim()) { setError('Choisis le client du contrat.'); return }
    if (!lines.some((l) => l.description.trim())) { setError('Ajoute au moins une prestation (ou un forfait).'); return }
    setSaving(true)
    setError(null)
    try {
      const saved = await saveContract({
        client_id: clientId,
        client_name: clientName,
        title: title || null,
        status,
        start_date: startDate,
        initial_months: initialMonths,
        tacit_renewal: tacitRenewal,
        notice_months: noticeMonths,
        billing_mode: billingMode,
        billing_frequency: billingFrequency,
        revision_rate: revisionRate.trim() ? Number.parseFloat(revisionRate.replace(',', '.')) : null,
        notes: notes || null,
        // Les lignes rattachées à un site décoché passent sur « tous les sites »
        site_ids: siteIds.filter((id) => clientSites.length === 0 || clientSites.some((s) => s.id === id)),
        lines: lines.map((l) => (l.site_id && !siteIds.includes(l.site_id) ? { ...l, site_id: null } : l)),
      }, organizationId, contract?.id)

      let message = `Contrat ${saved.reference} enregistré.`
      if (saved.status === 'active' && saved.site_ids.length > 0) {
        const { linked, created } = await planContractVisits(saved, organizationId)
        const parts = [
          created > 0 ? `${created} visite${created > 1 ? 's' : ''} à planifier créée${created > 1 ? 's' : ''}` : '',
          linked > 0 ? `${linked} visite${linked > 1 ? 's' : ''} déjà prévue${linked > 1 ? 's' : ''} rattachée${linked > 1 ? 's' : ''}` : '',
        ].filter(Boolean)
        if (parts.length > 0) message += ` ${parts.join(', ')}.`
      }
      onSaved(message)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevision() {
    if (!contract || !revision) return
    setSaving(true)
    setError(null)
    try {
      await applyContractRevision(contract, revision.from)
      onSaved(`Révision de ${pct(revision.rate)} appliquée au contrat ${contract.reference} : ${formatAmount(revisedAnnual)} HT par an à partir du ${frDate(revision.from)}.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  async function handleRenew() {
    if (!contract || !end) return
    setSaving(true)
    setError(null)
    try {
      await renewContract(contract)
      onSaved(`Contrat ${contract.reference} renouvelé de 12 mois : nouvelle fin le ${frDate(fixedEnd({ ...contract, initial_months: contract.initial_months + 12 }))}.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  async function handleExpire() {
    if (!contract) return
    setSaving(true)
    setError(null)
    try {
      await expireContract(contract.id)
      onSaved(`Contrat ${contract.reference} expiré : plus de visites ni de factures proposées.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  async function handleTerminate() {
    if (!contract) return
    setSaving(true)
    setError(null)
    try {
      await terminateContract(contract.id, terminatedOn, terminationReason, deleteUpcoming)
      onSaved(`Contrat ${contract.reference} résilié au ${frDate(terminatedOn)}.${deleteUpcoming && upcomingCount ? ` ${upcomingCount} visite${upcomingCount > 1 ? 's' : ''} à venir supprimée${upcomingCount > 1 ? 's' : ''}.` : ''}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!contract || !window.confirm(`Supprimer le contrat ${contract.reference} ?\n\nSes visites restent au planning, détachées du contrat. Pour arrêter un contrat en cours, préfère « Résilier ».`)) return
    setSaving(true)
    try {
      await deleteContract(contract.id)
      onSaved(`Contrat ${contract.reference} supprimé.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !saving) onClose()
  }

  const coveredSites = clientSites.filter((s) => siteIds.includes(s.id))
  const isRunning = contract?.status === 'active' || contract?.status === 'suspended'

  // Étape C : révision annuelle (due, ou anticipée 60 j avant pour un contrat facturé d'avance)
  const nextEnd = contract ? currentPeriodEnd(contract) : null
  const revision = contract
    ? pendingRevision(contract) ?? (contract.billing_mode === 'advance' && nextEnd && daysUntil(nextEnd) <= 60 ? pendingRevision(contract, nextEnd) : null)
    : null
  const revisedAnnual = revision && contract
    ? contractAnnualTotals(contract.lines.map((l) => ({ ...l, unit_price_ht: revisedPrice(l.unit_price_ht, revision.rate) }))).ht
    : 0
  const end = contract && isRunning ? fixedEnd(contract) : null
  const endDays = end ? daysUntil(end) : null
  const cell = { padding: '.35rem .3rem', verticalAlign: 'top' as const }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 1040 }}>
        <div className="modal-head">
          <span className="modal-title">
            {isEdit ? `Contrat ${contract.reference}` : 'Nouveau contrat de maintenance'}
            {isEdit && (
              <span className="text-ink-3 text-xs font-light" style={{ marginLeft: 8 }}>{CONTRACT_STATUS_LABELS[contract.status]}</span>
            )}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Révision annuelle du prix */}
          {revision && contract && (
            <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '.75rem .9rem', borderRadius: 10, background: '#FDF1E7', border: '1px solid #F0C9A6', fontSize: '.85rem' }}>
              <span style={{ flex: '1 1 320px' }}>
                <strong>Révision annuelle de {pct(revision.rate)}</strong>{' '}
                {revision.from <= todayIso() ? `à appliquer (contrat reconduit le ${frDate(revision.from)})` : `pour la période qui commence le ${frDate(revision.from)}`} :{' '}
                {formatAmount(contractAnnualTotals(contract.lines).ht)} → <strong>{formatAmount(revisedAnnual)}</strong> HT par an.
              </span>
              <button type="button" className="btn-sm acc" onClick={() => void handleRevision()} disabled={saving}>Appliquer la révision</button>
            </div>
          )}

          {/* Contrat sans reconduction : fin proche ou dépassée */}
          {end && endDays !== null && endDays <= 90 && contract && (
            <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '.75rem .9rem', borderRadius: 10, background: endDays < 0 ? '#FBEAEA' : '#FDF1E7', border: `1px solid ${endDays < 0 ? '#F2C4C4' : '#F0C9A6'}`, fontSize: '.85rem' }}>
              <span style={{ flex: '1 1 320px' }}>
                {endDays < 0 ? <>Ce contrat est <strong>arrivé à son terme le {frDate(end)}</strong></> : <>Ce contrat <strong>se termine le {frDate(end)}</strong></>}
                {' '}(sans reconduction tacite). Renouvelle-le avec le client, ou laisse-le expirer.
              </span>
              <button type="button" className="btn-sm acc" onClick={() => void handleRenew()} disabled={saving}>Renouveler 12 mois</button>
              {endDays < 0 && (
                <button type="button" className="mf out" onClick={() => void handleExpire()} disabled={saving}>Laisser expirer</button>
              )}
            </div>
          )}

          {/* Client */}
          <div className="card-section">
            <div className="card-section-title">Client</div>
            <div className="mrow">
              <div className="fg">
                <label>Client</label>
                <ClientAutocomplete
                  value={clientName}
                  onChange={(name, c: Client | null) => {
                    setClientName(name)
                    if ((c?.id ?? null) !== clientId) {
                      setClientId(c?.id ?? null)
                      setSiteIds([])
                    }
                  }}
                  placeholder="Rechercher un client…"
                />
              </div>
              <div className="fg">
                <label>Intitulé (optionnel)</label>
                <input type="text" placeholder="Ex : Contrat de maintenance annuel" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Sites */}
          <div className="card-section">
            <div className="card-section-title">Sites couverts</div>
            {!clientId && <p className="text-ink-3 text-xs font-light">Choisis d'abord un client existant.</p>}
            {clientId && clientSites.length === 0 && (
              <p className="text-ink-3 text-xs font-light">Ce client n'a pas encore de site. Crée-le dans Équipements pour planifier ses visites.</p>
            )}
            {clientSites.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                {clientSites.map((s) => (
                  <label key={s.id} className={`filter-pill${siteIds.includes(s.id) ? ' on' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} style={{ margin: 0 }} />
                    {s.name}{s.city ? ` · ${s.city}` : ''}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Prestations */}
          <div className="card-section">
            <div className="card-section-title">Prestations (prix par visite)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem', minWidth: 860 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '.72rem' }}>
                    <th style={cell}>Désignation</th>
                    <th style={cell}>Famille</th>
                    <th style={cell}>Site</th>
                    <th style={{ ...cell, width: 110 }}>Qté</th>
                    <th style={{ ...cell, width: 90 }}>PU HT</th>
                    <th style={{ ...cell, width: 120 }}>Fréquence</th>
                    <th style={{ ...cell, width: 70 }}>TVA</th>
                    <th style={{ ...cell, width: 100, textAlign: 'right' }}>Par an HT</th>
                    <th style={{ ...cell, width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--brd)' }}>
                      <td style={cell}>
                        <input type="text" placeholder="Ex : Vérification annuelle extincteurs" value={line.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })} style={{ width: '100%', minWidth: 230 }} />
                      </td>
                      <td style={cell}>
                        <select value={line.equipment_family ?? ''} onChange={(e) => setFamily(i, (e.target.value || null) as EquipmentFamily | null)}>
                          <option value="">—</option>
                          {EQUIPMENT_FAMILIES.map((f) => <option key={f} value={f}>{EQUIPMENT_FAMILY_LABELS[f]}</option>)}
                        </select>
                      </td>
                      <td style={cell}>
                        <select value={line.site_id ?? ''} onChange={(e) => updateLine(i, { site_id: e.target.value || null })}>
                          <option value="">Tous les sites</option>
                          {coveredSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td style={cell}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input type="text" inputMode="decimal" value={String(line.quantity)}
                            onChange={(e) => updateLine(i, { quantity: parseNumber(e.target.value) })} style={{ width: 56 }} />
                          {line.equipment_family && siteIds.length > 0 && (
                            <button type="button" className="ql-remove" title="Compter depuis le parc" aria-label="Compter depuis le parc"
                              onClick={() => void countFromInventory(i)} disabled={counting === i}>
                              <Calculator size={12} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={cell}>
                        <input type="text" inputMode="decimal" value={String(line.unit_price_ht)}
                          onChange={(e) => updateLine(i, { unit_price_ht: parseNumber(e.target.value) })} style={{ width: 80 }} />
                      </td>
                      <td style={cell}>
                        <select value={line.frequency} onChange={(e) => updateLine(i, { frequency: e.target.value as ContractFrequency })}>
                          {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                        </select>
                      </td>
                      <td style={cell}>
                        <select value={line.vat_rate} onChange={(e) => updateLine(i, { vat_rate: Number(e.target.value) })}>
                          {VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
                        </select>
                      </td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', paddingTop: '.65rem' }}>
                        {formatAmount(lineAnnualHt(line))}
                      </td>
                      <td style={cell}>
                        {lines.length > 1 && (
                          <button type="button" className="ql-remove" aria-label="Supprimer cette ligne"
                            onClick={() => setLines((prev) => prev.filter((_, j) => j !== i).map((l, j) => ({ ...l, position: j })))}>
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
              <button type="button" className="quote-add-line" onClick={() => addLine(emptyLine(lines.length))}>
                <Plus size={13} strokeWidth={2} /> Ligne
              </button>
              <button type="button" className="quote-add-line" onClick={addFlatFee}>
                <Plus size={13} strokeWidth={2} /> Forfait
              </button>
              <CatalogPicker onPick={addCatalogItem} />
            </div>
            <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.5rem' }}>
              Choisis une famille puis clique sur la calculette pour compter les équipements en service du parc.
              Le montant annuel = quantité × prix par visite × nombre de visites par an.
            </p>
            <div className="quote-totals" style={{ marginTop: '.6rem' }}>
              <div className="quote-total-row"><span>Montant annuel HT</span><strong>{formatAmount(totals.ht)}</strong></div>
              <div className="quote-total-row"><span>TVA</span><span>{formatAmount(totals.vat)}</span></div>
              <div className="quote-total-row"><span>Montant annuel TTC</span><strong>{formatAmount(totals.ttc)}</strong></div>
            </div>
          </div>

          {/* Durée et facturation */}
          <div className="card-section">
            <div className="card-section-title">Durée et facturation</div>
            <div className="mrow">
              <div className="fg">
                <label>Date de début</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="fg">
                <label>Durée initiale (mois)</label>
                <input type="number" min={1} max={120} value={initialMonths} onChange={(e) => setInitialMonths(Math.max(1, Number(e.target.value) || 12))} />
              </div>
              <div className="fg">
                <label>Préavis de résiliation (mois)</label>
                <input type="number" min={0} max={24} value={noticeMonths} onChange={(e) => setNoticeMonths(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
            <label className="text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: '.4rem' }}>
              <input type="checkbox" checked={tacitRenewal} onChange={(e) => setTacitRenewal(e.target.checked)} />
              Reconduction tacite par périodes de 12 mois
            </label>
            <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.3rem' }}>
              {periodEnd
                ? <>Prochaine échéance : <strong>{frDate(periodEnd)}</strong>{deadline ? <> · résiliation possible jusqu'au <strong>{frDate(deadline)}</strong></> : null}</>
                : 'Contrat arrivé à son terme.'}
            </p>

            <div className="mrow" style={{ marginTop: '.8rem' }}>
              <div className="fg">
                <label>Facturation</label>
                <select value={billingMode} onChange={(e) => setBillingMode(e.target.value as ContractBillingMode)}>
                  {(Object.keys(BILLING_MODE_LABELS) as ContractBillingMode[]).map((m) => <option key={m} value={m}>{BILLING_MODE_LABELS[m]}</option>)}
                </select>
              </div>
              {billingMode === 'advance' && (
                <div className="fg">
                  <label>Échéances</label>
                  <select value={billingFrequency} onChange={(e) => setBillingFrequency(e.target.value as ContractFrequency)}>
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{BILLING_FREQUENCY_LABELS[f]}</option>)}
                  </select>
                </div>
              )}
              <div className="fg">
                <label>Révision annuelle du prix (%)</label>
                <input type="text" inputMode="decimal" placeholder="Ex : 3" value={revisionRate} onChange={(e) => setRevisionRate(e.target.value)} />
              </div>
            </div>

            {!isRunning && (
              <div className="fg" style={{ marginTop: '.6rem', maxWidth: 260 }}>
                <label>Statut</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>
                  <option value="active">Actif : planifier les visites</option>
                  <option value="draft">Brouillon : pas encore signé</option>
                </select>
              </div>
            )}
            {isEdit && contract.status === 'active' && (
              <label className="text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: '.6rem' }}>
                <input type="checkbox" checked={status === 'suspended'} onChange={(e) => setStatus(e.target.checked ? 'suspended' : 'active')} />
                Suspendre le contrat (plus de nouvelles visites jusqu'à réactivation)
              </label>
            )}
            {isEdit && contract.status === 'suspended' && (
              <label className="text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: '.6rem' }}>
                <input type="checkbox" checked={status === 'active'} onChange={(e) => setStatus(e.target.checked ? 'active' : 'suspended')} />
                Réactiver le contrat
              </label>
            )}
          </div>

          <div className="fg">
            <label>Notes internes (optionnel)</label>
            <input type="text" placeholder="Ex : interlocuteur, conditions particulières…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Résiliation */}
          {terminateOpen && contract && (
            <div className="card-section" style={{ border: '1px solid var(--red-lt, #F7D4D4)', borderRadius: 10, padding: '.9rem' }}>
              <div className="card-section-title">Résilier le contrat</div>
              <div className="mrow">
                <div className="fg">
                  <label>Date d'effet</label>
                  <input type="date" value={terminatedOn} onChange={(e) => setTerminatedOn(e.target.value)} />
                </div>
                <div className="fg">
                  <label>Motif (optionnel)</label>
                  <input type="text" placeholder="Ex : changement de prestataire" value={terminationReason} onChange={(e) => setTerminationReason(e.target.value)} />
                </div>
              </div>
              {upcomingCount !== null && upcomingCount > 0 && (
                <label className="text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: '.4rem' }}>
                  <input type="checkbox" checked={deleteUpcoming} onChange={(e) => setDeleteUpcoming(e.target.checked)} />
                  Supprimer aussi {upcomingCount === 1 ? 'la visite à venir' : `les ${upcomingCount} visites à venir`} de ce contrat
                </label>
              )}
              <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.4rem' }}>
                Plus aucune visite ne sera créée pour ce contrat. Les rapports, devis et factures existants sont conservés.
              </p>
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.6rem' }}>
                <button type="button" className="mf del" onClick={() => void handleTerminate()} disabled={saving}>Confirmer la résiliation</button>
                <button type="button" className="mf out" onClick={() => setTerminateOpen(false)} disabled={saving}>Annuler</button>
              </div>
            </div>
          )}

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            {isEdit && (
              <button type="button" className="mf del" onClick={() => void handleDelete()} disabled={saving}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} strokeWidth={1.8} /> Supprimer
              </button>
            )}
            {isEdit && isRunning && !terminateOpen && (
              <button type="button" className="mf out" onClick={() => setTerminateOpen(true)} disabled={saving}>Résilier…</button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={saving}>Annuler</button>
            {(!isEdit || isRunning || contract.status === 'draft') && (
              <button type="button" className="mf prim" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le contrat'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
