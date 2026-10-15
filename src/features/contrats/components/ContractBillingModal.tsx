import { Receipt } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../auth/store'
import { formatAmount } from '../../devis/constants'
import { createBillingInvoices, loadMonthBilling } from '../billingApi'
import type { BillingResult } from '../billingApi'
import type { BillingProposal, BillingSkip } from '../billing'

type Props = {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

/**
 * « Facturer le mois » : propose les factures des contrats (visites terminées
 * du mois, échéances d'avance qui commencent ce mois-ci), à cocher, puis les
 * crée en brouillon. Rien n'est envoyé au client à cette étape.
 */
export function ContractBillingModal({ open, onClose, onDone }: Props) {
  const organizationId = useAuthStore((s) => s.profile?.organization_id ?? null)
  const [month, setMonth] = useState(currentMonth)
  const [proposals, setProposals] = useState<BillingProposal[]>([])
  const [skipped, setSkipped] = useState<BillingSkip[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BillingResult | null>(null)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    let alive = true
    loadMonthBilling(month)
      .then((plan) => {
        if (!alive) return
        setProposals(plan.proposals)
        setSkipped(plan.skipped)
        setSelected(new Set(plan.proposals.map((p) => p.key)))
        setError(null)
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, month, reloadKey])

  function changeMonth(value: string) {
    if (!value || value === month) return
    setLoading(true)
    setResult(null)
    setMonth(value)
  }

  const chosen = useMemo(() => proposals.filter((p) => selected.has(p.key)), [proposals, selected])
  const totalHt = chosen.reduce((s, p) => s + p.totals.ht, 0)

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleCreate() {
    if (!organizationId || chosen.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const res = await createBillingInvoices(chosen, organizationId, monthLabel(month))
      setResult(res)
      if (res.created.length > 0) {
        onDone(`${res.created.length} facture${res.created.length > 1 ? 's' : ''} de contrat créée${res.created.length > 1 ? 's' : ''} en brouillon (${monthLabel(month)}).`)
      }
      setLoading(true)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setCreating(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !creating) onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={16} strokeWidth={1.8} /> Facturer le mois
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={creating}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <label className="text-ink-2 text-sm" htmlFor="billing-month">Mois</label>
          <input id="billing-month" type="month" className="input-sm" value={month}
            onChange={(e) => changeMonth(e.target.value)} />
          <span className="text-ink-3 text-xs font-light" style={{ flex: '1 1 260px' }}>
            Visites terminées en {monthLabel(month)} et échéances d'avance qui commencent ce mois-ci.
            Les factures sont créées en <strong>brouillon</strong> : rien n'est envoyé au client.
          </span>
        </div>

        {result && (
          <div className="card" style={{ marginBottom: '1rem', background: result.errors.length ? '#FDF1E7' : '#E6F4EB', border: `1px solid ${result.errors.length ? '#F0C9A6' : '#B7DFC7'}`, fontSize: '.85rem' }}>
            {result.created.length > 0 && (
              <p style={{ margin: 0, color: '#0E7A3F' }}>
                {result.created.length} facture{result.created.length > 1 ? 's' : ''} créée{result.created.length > 1 ? 's' : ''} en brouillon :{' '}
                {result.created.map((c) => c.reference).join(', ')}.{' '}
                <Link to="/factures" style={{ color: 'inherit', fontWeight: 600 }}>Les vérifier et les envoyer →</Link>
              </p>
            )}
            {result.errors.map((err) => <p key={err} style={{ margin: '.3rem 0 0', color: 'var(--red)' }}>Non créée — {err}</p>)}
          </div>
        )}

        {loading && <p className="text-ink-2 text-sm font-light">Calcul en cours…</p>}
        {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

        {!loading && !error && proposals.length === 0 && (
          <p className="text-ink-2 text-sm font-light" style={{ padding: '1.2rem 0' }}>
            Rien à facturer pour {monthLabel(month)} : aucune visite sous contrat terminée et non facturée,
            et aucune échéance d'avance qui commence ce mois-ci.
          </p>
        )}

        {!loading && proposals.length > 0 && (
          <div style={{ display: 'grid', gap: '.5rem', maxHeight: '52vh', overflowY: 'auto' }}>
            {proposals.map((p) => (
              <label key={p.key} style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start', padding: '.7rem .8rem', border: '1px solid var(--brd)', borderRadius: 10, cursor: 'pointer', background: selected.has(p.key) ? 'white' : 'var(--wht)' }}>
                <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} style={{ marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {p.contract.client_name}
                    <span className="text-ink-3 text-xs font-light" style={{ marginLeft: 6 }}>
                      {p.contract.reference} · {p.kind === 'per_visit' ? 'après visite' : "d'avance"}
                    </span>
                  </div>
                  <div className="text-ink-2 text-xs" style={{ marginTop: 2 }}>{p.summary}</div>
                  <div className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
                    {p.lines.map((l) => `${l.description} : ${l.quantity} × ${formatAmount(l.unit_price_ht)}`).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700 }}>{formatAmount(p.totals.ht)} HT</div>
                  <div className="text-ink-3 text-xs">{formatAmount(p.totals.ttc)} TTC</div>
                </div>
              </label>
            ))}
          </div>
        )}

        {!loading && skipped.length > 0 && (
          <div style={{ marginTop: '.9rem' }}>
            <div className="text-ink-3 text-xs" style={{ marginBottom: 4 }}>Rien à facturer :</div>
            {skipped.map((s) => (
              <div key={s.key} className="text-ink-3 text-xs font-light">· {s.contract.client_name} ({s.contract.reference}) — {s.reason}</div>
            ))}
          </div>
        )}

        <div className="modal-foot" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
          <span className="text-ink-2 text-sm" style={{ flex: 1 }}>
            {chosen.length > 0 ? <>{chosen.length} facture{chosen.length > 1 ? 's' : ''} · <strong>{formatAmount(totalHt)} HT</strong></> : null}
          </span>
          <button type="button" className="mf out" onClick={onClose} disabled={creating}>Fermer</button>
          {proposals.length > 0 && (
            <button type="button" className="btn-sm acc" onClick={() => void handleCreate()} disabled={creating || loading || chosen.length === 0}>
              {creating ? 'Création…' : `Créer ${chosen.length > 1 ? `les ${chosen.length} factures` : 'la facture'} en brouillon`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
