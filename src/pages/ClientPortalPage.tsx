import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  AlertCircle,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  Send,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatAmount } from '../features/devis/constants'
import { effectiveStatus, INVOICE_STATUS_LABEL, INVOICE_STATUS_BADGE } from '../features/factures/constants'
import type { InvoiceStatus } from '../features/factures/constants'
import {
  getPortalInvoices,
  getPortalReports,
  getPortalUpcoming,
  requestPortalIntervention,
  validatePortalToken,
} from '../features/portail/api'
import type { PortalContext, PortalInvoice, PortalReport, PortalUpcoming } from '../features/portail/api'
import {
  EQUIPMENT_TYPES,
  formatEquipmentTypesShort,
} from '../shared/constants/interventions'
import type { EquipmentType } from '../shared/constants/interventions'

type Tab = 'reports' | 'invoices' | 'upcoming' | 'request'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function formatDateLong(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'EEEE d MMMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

export function ClientPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [ctx, setCtx] = useState<PortalContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [contextLoading, setContextLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('reports')

  useEffect(() => {
    if (!token) return
    let alive = true
    setContextLoading(true)
    void validatePortalToken(token)
      .then((res) => {
        if (!alive) return
        if ('error' in res) {
          setContextError(
            res.error === 'invalid_or_expired'
              ? 'Ce lien d\'accès est invalide ou a expiré. Contacte ton prestataire pour obtenir un nouveau lien.'
              : `Erreur : ${res.error}`,
          )
        } else {
          setCtx(res)
        }
      })
      .catch((e) => {
        if (alive) setContextError(e instanceof Error ? e.message : 'Erreur de connexion')
      })
      .finally(() => {
        if (alive) setContextLoading(false)
      })
    return () => { alive = false }
  }, [token])

  if (contextLoading) {
    return (
      <div className="portal-layout">
        <div className="portal-loading">
          <Loader2 size={28} strokeWidth={2} className="portal-spinner" />
          <p>Chargement de votre espace…</p>
        </div>
      </div>
    )
  }

  if (contextError || !ctx || !token) {
    return (
      <div className="portal-layout">
        <div className="portal-error-card">
          <AlertCircle size={36} strokeWidth={1.8} />
          <h2>Accès impossible</h2>
          <p>{contextError ?? 'Lien invalide.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-layout">
      <header className="portal-header">
        <div className="portal-header-inner">
          <div>
            <div className="portal-org">
              <Building2 size={14} strokeWidth={2} />
              {ctx.organization_name}
            </div>
            <h1 className="portal-title">Espace {ctx.client_name}</h1>
            <p className="portal-subtitle">
              Lien d'accès valide jusqu'au {formatDate(ctx.expires_at)}
            </p>
          </div>
        </div>
      </header>

      <div className="portal-tabs">
        <button
          type="button"
          className={`portal-tab${tab === 'reports' ? ' on' : ''}`}
          onClick={() => setTab('reports')}
        >
          <ClipboardCheck size={14} strokeWidth={2} />
          Rapports
        </button>
        <button
          type="button"
          className={`portal-tab${tab === 'invoices' ? ' on' : ''}`}
          onClick={() => setTab('invoices')}
        >
          <Receipt size={14} strokeWidth={2} />
          Factures
        </button>
        <button
          type="button"
          className={`portal-tab${tab === 'upcoming' ? ' on' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          <CalendarPlus size={14} strokeWidth={2} />
          À venir
        </button>
        <button
          type="button"
          className={`portal-tab${tab === 'request' ? ' on' : ''}`}
          onClick={() => setTab('request')}
        >
          <Send size={14} strokeWidth={2} />
          Demander
        </button>
      </div>

      <main className="portal-main">
        {tab === 'reports' && <ReportsTab token={token} />}
        {tab === 'invoices' && <InvoicesTab token={token} />}
        {tab === 'upcoming' && <UpcomingTab token={token} />}
        {tab === 'request' && (
          <RequestTab token={token} clientName={ctx.client_name} />
        )}
      </main>

      <footer className="portal-footer">
        <p>
          Espace client sécurisé propulsé par <strong>BuildOps</strong>
        </p>
      </footer>
    </div>
  )
}

// ─── Onglet Rapports ──────────────────────────────────────────────────

function ReportsTab({ token }: { token: string }) {
  const [reports, setReports] = useState<PortalReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void getPortalReports(token)
      .then((data) => {
        if (alive) setReports(data)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [token])

  if (loading) return <p className="portal-empty">Chargement…</p>
  if (reports.length === 0) {
    return (
      <p className="portal-empty">
        Aucun rapport finalisé pour le moment.
      </p>
    )
  }

  return (
    <div className="portal-list">
      {reports.map((r) => {
        // Calcule conformité depuis la checklist
        const nokCount = (r.checklist ?? []).filter((c) => c.value === 'nok').length
        const isConform = nokCount === 0
        const equipLabel = formatEquipmentTypesShort({
          equipment_types: r.equipment_types,
          equipment_type: r.equipment_type,
        })
        return (
          <div key={r.id} className={`portal-card ${isConform ? 'conform' : 'non-conform'}`}>
            <div className="portal-card-icon">
              {isConform ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </div>
            <div className="portal-card-body">
              <div className="portal-card-title">
                {r.reference}
                <span className="portal-card-light"> · {equipLabel}</span>
              </div>
              <div className="portal-card-meta">
                {formatDateLong(r.completed_at ?? r.scheduled_date)}
                {r.site_name && <> · {r.site_name}</>}
                {r.technician_name && <> · {r.technician_name}</>}
              </div>
              <div className="portal-card-status">
                {isConform ? (
                  <span className="portal-badge conform">CONFORME</span>
                ) : (
                  <span className="portal-badge non-conform">
                    {nokCount} anomalie{nokCount > 1 ? 's' : ''} détectée{nokCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            {r.pdf_url && (
              <a
                href={r.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="portal-card-cta"
              >
                <Download size={14} strokeWidth={2} />
                <span>PDF</span>
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Onglet Factures ──────────────────────────────────────────────────

function InvoicesTab({ token }: { token: string }) {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void getPortalInvoices(token)
      .then((data) => {
        if (alive) setInvoices(data)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [token])

  const enriched = useMemo(
    () =>
      invoices.map((i) => ({
        ...i,
        eff: effectiveStatus(
          i.status as InvoiceStatus,
          i.due_date,
          Number(i.amount_paid ?? 0),
          Number(i.total_ttc ?? 0),
        ),
      })),
    [invoices],
  )

  if (loading) return <p className="portal-empty">Chargement…</p>
  if (enriched.length === 0) {
    return <p className="portal-empty">Aucune facture émise pour le moment.</p>
  }

  return (
    <div className="portal-list">
      {enriched.map((i) => {
        const remaining = Number(i.total_ttc) - Number(i.amount_paid ?? 0)
        return (
          <div key={i.id} className="portal-card">
            <div className={`portal-card-icon ${INVOICE_STATUS_BADGE[i.eff]}`}>
              <Receipt size={18} />
            </div>
            <div className="portal-card-body">
              <div className="portal-card-title">
                {i.reference}
                {i.site_name && (
                  <span className="portal-card-light"> · {i.site_name}</span>
                )}
              </div>
              <div className="portal-card-meta">
                Émise le {formatDate(i.issue_date)}
                {i.due_date && i.eff !== 'paid' && (
                  <> · à régler avant le {formatDate(i.due_date)}</>
                )}
                {i.eff === 'paid' && i.paid_at && (
                  <> · payée le {formatDate(i.paid_at)}</>
                )}
              </div>
              <div className="portal-card-status">
                <span className={`portal-badge ${INVOICE_STATUS_BADGE[i.eff]}`}>
                  {INVOICE_STATUS_LABEL[i.eff]}
                </span>
              </div>
            </div>
            <div className="portal-card-amount">
              <div className="portal-amount-val">{formatAmount(Number(i.total_ttc))}</div>
              {i.eff === 'partially_paid' && (
                <div className="portal-amount-sub">
                  Reste {formatAmount(remaining)}
                </div>
              )}
            </div>
            {i.pdf_url && (
              <a
                href={i.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="portal-card-cta"
              >
                <Download size={14} strokeWidth={2} />
                <span>PDF</span>
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Onglet À venir ───────────────────────────────────────────────────

function UpcomingTab({ token }: { token: string }) {
  const [items, setItems] = useState<PortalUpcoming[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void getPortalUpcoming(token)
      .then((data) => {
        if (alive) setItems(data)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [token])

  if (loading) return <p className="portal-empty">Chargement…</p>
  if (items.length === 0) {
    return <p className="portal-empty">Aucune intervention prévue.</p>
  }

  return (
    <div className="portal-list">
      {items.map((i) => (
        <div key={i.id} className="portal-card">
          <div className="portal-card-icon b-acc">
            <CalendarPlus size={18} />
          </div>
          <div className="portal-card-body">
            <div className="portal-card-title">
              {i.reference}
              <span className="portal-card-light">
                {' · '}{formatEquipmentTypesShort({ equipment_types: i.equipment_types })}
              </span>
            </div>
            <div className="portal-card-meta">
              {i.scheduled_date ? (
                <>📅 {formatDateLong(i.scheduled_date)}</>
              ) : (
                <span className="text-ink-3">À planifier</span>
              )}
              {i.site_name && <> · {i.site_name}</>}
              {i.technician_name && <> · {i.technician_name}</>}
            </div>
          </div>
          <div className="portal-card-status">
            <span className="portal-badge b-org">
              {i.status === 'a_planifier' ? 'À planifier' : i.status === 'planifiee' ? 'Planifiée' : 'En cours'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Onglet Demander une intervention ────────────────────────────────

function RequestTab({ token, clientName }: { token: string; clientName: string }) {
  const [equipment, setEquipment] = useState<EquipmentType>('extincteurs')
  const [siteName, setSiteName] = useState('')
  const [address, setAddress] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await requestPortalIntervention(token, equipment, message, siteName, address)
      if ('error' in res) {
        setError(`Erreur : ${res.error}`)
      } else {
        setSuccess(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="portal-success-card">
        <CheckCircle2 size={36} strokeWidth={2} />
        <h3>Demande envoyée ✅</h3>
        <p>
          Votre prestataire a bien reçu votre demande d'intervention.
          Vous serez recontacté(e) prochainement pour fixer une date.
        </p>
        <button
          type="button"
          className="portal-btn"
          onClick={() => {
            setSuccess(false)
            setMessage('')
            setSiteName('')
            setAddress('')
          }}
        >
          Faire une autre demande
        </button>
      </div>
    )
  }

  return (
    <div className="portal-form-card">
      <h2>Demander une intervention</h2>
      <p className="portal-form-sub">
        Bonjour <strong>{clientName}</strong>, votre demande sera transmise immédiatement à votre prestataire.
      </p>

      <div className="fg">
        <label>Type d'équipement concerné</label>
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as EquipmentType)}
        >
          {(Object.entries(EQUIPMENT_TYPES) as [EquipmentType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="mrow">
        <div className="fg">
          <label>Site / lieu (optionnel)</label>
          <input
            type="text"
            placeholder="Ex: Bâtiment A, hall principal…"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
        </div>
        <div className="fg">
          <label>Adresse (si différente)</label>
          <input
            type="text"
            placeholder="Ex: 12 rue X, 75010 Paris"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      </div>

      <div className="fg">
        <label>Message / précisions</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex: contrôle annuel, ou urgence: extincteur déchargé…"
          rows={5}
        />
      </div>

      {error && <p className="portal-error-msg">{error}</p>}

      <button
        type="button"
        className="portal-btn portal-btn-primary"
        onClick={() => void handleSubmit()}
        disabled={submitting}
      >
        <Send size={14} strokeWidth={2} />
        {submitting ? 'Envoi…' : 'Envoyer la demande'}
        <ExternalLink size={11} strokeWidth={2} />
      </button>
      <p className="text-ink-3 text-xs font-light" style={{ marginTop: 12, textAlign: 'center' }}>
        <FileText size={10} strokeWidth={2} style={{ verticalAlign: '-1px', marginRight: 4 }} />
        Votre demande sera enregistrée dans le planning de votre prestataire.
      </p>
    </div>
  )
}
