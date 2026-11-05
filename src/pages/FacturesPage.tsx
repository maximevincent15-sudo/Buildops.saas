import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, Bell, Calculator, Download, FileMinus2, FileText, Mail, Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { formatAmount } from '../features/devis/constants'
import { listInvoices } from '../features/factures/api'
import { InvoiceModal } from '../features/factures/components/InvoiceModal'
import { BulkSendModal } from '../features/factures/components/BulkSendModal'
import { VisitsToInvoiceCard } from '../features/factures/components/VisitsToInvoiceCard'
import { buildVisitInvoiceSeed, listVisitsToInvoice } from '../features/factures/visitBilling'
import type { VisitToInvoice } from '../features/factures/visitBilling'
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_ICON,
  displayReference,
  docEffectiveStatus,
  docStatusLabel,
  hasFinalNumber,
  isCreditNote,
  netTotalTtc,
  remainingDue,
} from '../features/factures/constants'
import type { InvoiceStatus } from '../features/factures/constants'
import type { Invoice, UpsertInvoiceInput } from '../features/factures/schemas'
import { RelanceModal } from '../features/relances/components/RelanceModal'
import { AccountingExportModal } from '../features/export/components/AccountingExportModal'
import { FileLink } from '../shared/ui/FileLink'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

type TabKey = InvoiceStatus | 'all' | 'unpaid' | 'credit_note'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'sent', label: 'Envoyées' },
  { key: 'partially_paid', label: 'Partiellement' },
  { key: 'overdue', label: '⚠️ En retard' },
  { key: 'paid', label: 'Payées' },
  { key: 'cancelled', label: 'Annulées' },
  { key: 'credit_note', label: 'Avoirs' },
]

export function FacturesPage() {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = (profile?.user_role ?? 'admin') === 'admin'

  const [searchParams, setSearchParams] = useSearchParams()
  const [exportOpen, setExportOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Onglet initial possible par lien (?onglet=draft depuis « Facturer le mois »)
  const [tab, setTab] = useState<TabKey>(() => {
    const wanted = new URLSearchParams(window.location.search).get('onglet')
    return TABS.some((t) => t.key === wanted) ? (wanted as TabKey) : 'all'
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [relanceInvoice, setRelanceInvoice] = useState<Invoice | null>(null)
  // Création pré-remplie : copie d'une facture ou facture d'une visite
  const [prefill, setPrefill] = useState<{ seed: Partial<UpsertInvoiceInput>; notice: string } | null>(null)
  const [visitsToInvoice, setVisitsToInvoice] = useState<VisitToInvoice[]>([])
  const [preparingVisitId, setPreparingVisitId] = useState<string | null>(null)

  // Support ouverture via ?open=<id> (depuis QuoteModal "Transformer en facture")
  useEffect(() => {
    const id = searchParams.get('open')
    if (id) {
      setPrefill(null)
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
      const [data, visits] = await Promise.all([listInvoices(), listVisitsToInvoice().catch(() => [])])
      setInvoices(data)
      setVisitsToInvoice(visits)
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

  // Lien « À facturer » du tableau de bord : amène à la liste des visites
  const wantsToInvoice = searchParams.get('a_facturer') === '1'
  useEffect(() => {
    if (!wantsToInvoice || loading) return
    document.getElementById('a-facturer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [wantsToInvoice, loading])

  async function invoiceVisit(visit: VisitToInvoice) {
    setPreparingVisitId(visit.id)
    try {
      const seed = await buildVisitInvoiceSeed(visit)
      setPrefill({
        seed,
        notice: `Facture de la visite ${visit.reference} : complétez les prix (ou ajoutez des articles du catalogue), puis créez la facture.`,
      })
      setEditingId(null)
      setModalOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPreparingVisitId(null)
    }
  }

  // Statut effectif (calcule overdue à partir de la date, avoirs déduits)
  const enrichedInvoices = useMemo(
    () =>
      invoices.map((i) => ({
        ...i,
        effective: docEffectiveStatus(i),
        credit: isCreditNote(i),
      })),
    [invoices],
  )
  // Numéro de la facture d'origine de chaque avoir
  const referenceById = useMemo(() => new Map(invoices.map((i) => [i.id, i.reference])), [invoices])
  const factures = useMemo(() => enrichedInvoices.filter((i) => !i.credit), [enrichedInvoices])
  const drafts = useMemo(() => factures.filter((i) => i.status === 'draft'), [factures])
  const [bulkOpen, setBulkOpen] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: enrichedInvoices.length, credit_note: enrichedInvoices.length - factures.length }
    for (const status of ['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled'] as InvoiceStatus[]) {
      c[status] = factures.filter((q) => q.effective === status).length
    }
    return c
  }, [enrichedInvoices, factures])

  const filtered = useMemo(() => {
    if (tab === 'all') return enrichedInvoices
    if (tab === 'credit_note') return enrichedInvoices.filter((i) => i.credit)
    return factures.filter((i) => i.effective === tab)
  }, [enrichedInvoices, factures, tab])

  // KPIs
  const monthStart = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  }, [])

  // Montants des factures, avoirs déduits (les avoirs eux-mêmes ne comptent pas en plus)
  const totalEncaisseMonth = factures
    .filter((i) => i.effective === 'paid' && i.issue_date >= monthStart)
    .reduce((sum, i) => sum + netTotalTtc(i), 0)

  const totalImpaye = factures
    .filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.effective))
    .reduce((sum, i) => sum + remainingDue(i), 0)

  const totalEnRetard = factures
    .filter((i) => i.effective === 'overdue')
    .reduce((sum, i) => sum + remainingDue(i), 0)

  function openCreate() {
    setPrefill(null)
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(id: string) {
    setPrefill(null)
    setEditingId(id)
    setModalOpen(true)
  }

  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '2rem auto' }}>
        <div className="card-top">
          <span className="card-title">Accès restreint</span>
        </div>
        <p className="text-ink-2 text-sm font-light">
          Seuls les administrateurs peuvent consulter les factures.
        </p>
        <Link to="/dashboard" className="btn-sm" style={{ marginTop: '1rem', display: 'inline-block' }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Factures</div>
          <div className="dash-sub">
            {factures.length === 0 && 'Aucune facture pour le moment'}
            {factures.length === 1 && '1 facture enregistrée'}
            {factures.length > 1 && `${factures.length} factures · ${counts.paid} payée${counts.paid > 1 ? 's' : ''}, ${counts.overdue} en retard`}
            {counts.credit_note > 0 && ` · ${counts.credit_note} avoir${counts.credit_note > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="dash-acts">
          <button
            type="button"
            className="mf out"
            onClick={() => setExportOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Calculator size={14} strokeWidth={2} />
            Export comptable
          </button>
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

      <VisitsToInvoiceCard visits={visitsToInvoice} preparingId={preparingVisitId} onInvoice={(v) => void invoiceVisit(v)} />

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
        {drafts.length >= 2 && (
          <button
            type="button"
            className="btn-sm acc"
            onClick={() => setBulkOpen(true)}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Chaque brouillon reçoit son numéro et part au client avec son PDF"
          >
            <Send size={13} strokeWidth={2} /> Envoyer les brouillons ({drafts.length})
          </button>
        )}
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
                Créez une facture directement, ou transformez un devis accepté en facture en 1 clic
                depuis la page Devis. Le numéro (FAC-2026-0001…) est attribué à l'envoi, dans l'ordre et sans trou.
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="quotes-list">
            {filtered.map((i) => {
              const status = i.effective
              const Icon = i.credit && status !== 'draft' ? FileMinus2 : INVOICE_STATUS_ICON[status]
              const remaining = remainingDue(i)
              const numbered = hasFinalNumber(i.reference)
              const credited = Number(i.credited_ttc ?? 0)
              const fromRef = i.credit && i.credited_invoice_id ? referenceById.get(i.credited_invoice_id) : null
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
                      <strong>{i.credit && numbered ? `Avoir ${i.reference}` : displayReference(i)}</strong>
                      <span className="quote-row-client"> — {i.client_name}</span>
                      {fromRef && <span className="text-ink-3"> · sur la facture {fromRef}</span>}
                      {i.site_name && <span className="text-ink-3"> · {i.site_name}</span>}
                      {i.dossier_number && <span className="text-ink-3"> · dossier {i.dossier_number}</span>}
                    </div>
                    <div className="quote-row-meta">
                      {status === 'draft'
                        ? <>Créé le {formatDate(i.created_at)} · {numbered ? 'date fixée' : 'numéro et date attribués'} à l'envoi</>
                        : <>{i.credit ? 'Émis' : 'Émise'} le {formatDate(i.issue_date)}</>}
                      {i.due_date && !i.credit && status !== 'draft' && (
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
                            · <Mail size={9} strokeWidth={2} /> envoyé{i.credit ? '' : 'e'}
                          </span>
                        </>
                      )}
                      {credited > 0 && (
                        <span className="text-ink-3"> · avoir − {formatAmount(credited)}</span>
                      )}
                      {!i.credit && Number(i.amount_paid ?? 0) > 0 && status !== 'paid' && (
                        <span className="text-ink-3"> · réglé {formatAmount(Number(i.amount_paid))}</span>
                      )}
                    </div>
                  </div>
                  <div className="quote-row-amount">
                    <div className="quote-row-amount-val">{i.credit ? `− ${formatAmount(Number(i.total_ttc))}` : formatAmount(Number(i.total_ttc))}</div>
                    <div className="quote-row-amount-sub">
                      {i.credit
                        ? 'Avoir TTC'
                        : status === 'partially_paid' || status === 'overdue' || (credited > 0 && status === 'sent')
                          ? `Reste ${formatAmount(remaining)}`
                          : 'TTC'}
                    </div>
                  </div>
                  <div className="quote-row-status">
                    <span className={`badge ${i.credit && status !== 'draft' ? 'b-gry' : INVOICE_STATUS_BADGE[status]}`}>
                      {i.credit && status !== 'draft' ? 'Avoir' : docStatusLabel(i, status)}
                    </span>
                  </div>
                  {/* Actions inline */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {!i.credit && (status === 'overdue' || status === 'sent' || status === 'partially_paid') && i.client_email && (
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
                      <FileLink
                        url={i.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="quote-row-pdf"
                        title="Télécharger le PDF"
                      >
                        <Download size={12} strokeWidth={2} />
                      </FileLink>
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
        seed={prefill?.seed}
        notice={prefill?.notice}
        onDuplicate={(seed, from) => {
          setPrefill({ seed, notice: `Copie de la facture ${from} : vérifiez le client, les lignes et l'échéance, puis créez la facture. Son numéro sera attribué à l'envoi.` })
          setEditingId(null)
        }}
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
            amount: remainingDue(relanceInvoice),
          }}
        />
      )}
      {exportOpen && <AccountingExportModal onClose={() => setExportOpen(false)} />}
      {bulkOpen && <BulkSendModal drafts={drafts} onClose={() => setBulkOpen(false)} onDone={() => void load()} />}
    </>
  )
}
