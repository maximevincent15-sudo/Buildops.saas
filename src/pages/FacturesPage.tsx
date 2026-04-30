import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, Bell, Download, FileText, Mail, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatAmount } from '../features/devis/constants'
import { listInvoices } from '../features/factures/api'
import { InvoiceModal } from '../features/factures/components/InvoiceModal'
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_ICON,
  INVOICE_STATUS_LABEL,
  effectiveStatus,
} from '../features/factures/constants'
import type { InvoiceStatus } from '../features/factures/constants'
import type { Invoice } from '../features/factures/schemas'
import { RelanceModal } from '../features/relances/components/RelanceModal'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

const TABS: Array<{ key: InvoiceStatus | 'all' | 'unpaid'; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'sent', label: 'Envoyées' },
  { key: 'partially_paid', label: 'Partiellement' },
  { key: 'overdue', label: '⚠️ En retard' },
  { key: 'paid', label: 'Payées' },
  { key: 'cancelled', label: 'Annulées' },
]

export function FacturesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<InvoiceStatus | 'all' | 'unpaid'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [relanceInvoice, setRelanceInvoice] = useState<Invoice | null>(null)

  // Support ouverture via ?open=<id> (depuis QuoteModal "Transformer en facture")
  useEffect(() => {
    const id = searchParams.get('open')
    if (id) {
      setEditingId(id)
      setModalOpen(true)
      // Nettoie le paramètre pour ne pas réouvrir au refresh
      const next = new URLSearchParams(searchParams)
      next.delete('open')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await listInvoices()
      setInvoices(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Statut effectif (calcule overdue à partir de la date)
  const enrichedInvoices = useMemo(
    () =>
      invoices.map((i) => ({
        ...i,
        effective: effectiveStatus(
          i.status,
          i.due_date,
          Number(i.amount_paid ?? 0),
          Number(i.total_ttc ?? 0),
        ),
      })),
    [invoices],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: enrichedInvoices.length }
    for (const status of ['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled'] as InvoiceStatus[]) {
      c[status] = enrichedInvoices.filter((q) => q.effective === status).length
    }
    return c
  }, [enrichedInvoices])

  const filtered = useMemo(() => {
    if (tab === 'all') return enrichedInvoices
    return enrichedInvoices.filter((i) => i.effective === tab)
  }, [enrichedInvoices, tab])

  // KPIs
  const monthStart = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  }, [])

  const totalEncaisseMonth = enrichedInvoices
    .filter((i) => i.effective === 'paid' && i.issue_date >= monthStart)
    .reduce((sum, i) => sum + Number(i.total_ttc), 0)

  const totalImpaye = enrichedInvoices
    .filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.effective))
    .reduce((sum, i) => sum + (Number(i.total_ttc) - Number(i.amount_paid ?? 0)), 0)

  const totalEnRetard = enrichedInvoices
    .filter((i) => i.effective === 'overdue')
    .reduce((sum, i) => sum + (Number(i.total_ttc) - Number(i.amount_paid ?? 0)), 0)

  function openCreate() {
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setModalOpen(true)
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Factures</div>
          <div className="dash-sub">
            {invoices.length === 0 && 'Aucune facture pour le moment'}
            {invoices.length === 1 && '1 facture enregistrée'}
            {invoices.length > 1 && `${invoices.length} factures · ${counts.paid} payée${counts.paid > 1 ? 's' : ''}, ${counts.overdue} en retard`}
          </div>
        </div>
        <div className="dash-acts">
          <button
            type="button"
            className="mf prim"
            onClick={openCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} strokeWidth={2} />
            Nouvelle facture
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="kpi-lbl">Encaissé (mois)</div>
          <div className="kpi-val text-grn">{formatAmount(totalEncaisseMonth)}</div>
          <div className="kpi-sub">CA confirmé</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Impayés</div>
          <div className="kpi-val">{formatAmount(totalImpaye)}</div>
          <div className="kpi-sub">{counts.sent + counts.partially_paid + counts.overdue} facture{counts.sent + counts.partially_paid + counts.overdue > 1 ? 's' : ''} en attente</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">En retard</div>
          <div className="kpi-val text-red">{formatAmount(totalEnRetard)}</div>
          <div className="kpi-sub">{counts.overdue} facture{counts.overdue > 1 ? 's' : ''} à relancer</div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`filter-pill${tab === t.key ? ' on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </div>

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}
        {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <FileText size={32} strokeWidth={1.5} className="text-ink-3" style={{ margin: '0 auto .5rem' }} />
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              {tab === 'all' ? 'Aucune facture pour le moment.' : 'Aucune facture dans ce statut.'}
            </p>
            {tab === 'all' && (
              <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 460, margin: '0 auto' }}>
                Crée une facture directement, ou transforme un devis accepté en facture en 1 clic
                depuis la page Devis. Numérotation FAC-2026-0001 automatique et continue (conforme fiscalité FR).
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="quotes-list">
            {filtered.map((i) => {
              const status = i.effective
              const Icon = INVOICE_STATUS_ICON[status]
              const remaining = Number(i.total_ttc) - Number(i.amount_paid ?? 0)
              return (
                <div
                  key={i.id}
                  className="quote-row"
                  onClick={() => openEdit(i.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openEdit(i.id) }}
                >
                  <div className={`quote-row-icon ${INVOICE_STATUS_BADGE[status]}`}>
                    <Icon size={14} strokeWidth={2} />
                  </div>
                  <div className="quote-row-main">
                    <div className="quote-row-title">
                      <strong>{i.reference}</strong>
                      <span className="quote-row-client"> — {i.client_name}</span>
                      {i.site_name && <span className="text-ink-3"> · {i.site_name}</span>}
                    </div>
                    <div className="quote-row-meta">
                      Émise le {formatDate(i.issue_date)}
                      {i.due_date && (
                        <>
                          {' · '}
                          <span className={status === 'overdue' ? 'text-red' : ''}>
                            {status === 'overdue' && <AlertTriangle size={9} strokeWidth={2} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 2 }} />}
                            échéance {formatDate(i.due_date)}
                          </span>
                        </>
                      )}
                      {i.sent_at && (
                        <>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                            · <Mail size={9} strokeWidth={2} /> envoyée
                          </span>
                        </>
                      )}
                      {Number(i.amount_paid ?? 0) > 0 && status !== 'paid' && (
                        <span className="text-ink-3"> · réglé {formatAmount(Number(i.amount_paid))}</span>
                      )}
                    </div>
                  </div>
                  <div className="quote-row-amount">
                    <div className="quote-row-amount-val">{formatAmount(Number(i.total_ttc))}</div>
                    <div className="quote-row-amount-sub">
                      {status === 'partially_paid' || status === 'overdue'
                        ? `Reste ${formatAmount(remaining)}`
                        : 'TTC'}
                    </div>
                  </div>
                  <div className="quote-row-status">
                    <span className={`badge ${INVOICE_STATUS_BADGE[status]}`}>
                      {INVOICE_STATUS_LABEL[status]}
                    </span>
                  </div>
                  {/* Actions inline */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {(status === 'overdue' || status === 'sent' || status === 'partially_paid') && i.client_email && (
                      <button
                        type="button"
                        className="qa-btn relance"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRelanceInvoice(i)
                        }}
                        title="Relancer le client"
                        aria-label="Relancer"
                      >
                        <Bell size={13} strokeWidth={2} />
                      </button>
                    )}
                    {i.pdf_url && (
                      <a
                        href={i.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="quote-row-pdf"
                        title="Télécharger le PDF"
                      >
                        <Download size={12} strokeWidth={2} />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <InvoiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
        invoiceId={editingId}
      />

      {/* Relance facture impayée */}
      {relanceInvoice && (
        <RelanceModal
          open={!!relanceInvoice}
          onClose={() => setRelanceInvoice(null)}
          recipientEmail={relanceInvoice.client_email}
          initialType="facture"
          availableTypes={['facture', 'general']}
          context={{
            clientName: relanceInvoice.client_name,
            contactName: relanceInvoice.client_contact_name,
            reference: relanceInvoice.reference,
            issueDate: relanceInvoice.issue_date,
            dueDate: relanceInvoice.due_date,
            amount: Number(relanceInvoice.total_ttc) - Number(relanceInvoice.amount_paid ?? 0),
          }}
        />
      )}
    </>
  )
}
