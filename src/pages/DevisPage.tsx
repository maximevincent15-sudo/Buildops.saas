import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Download, FileText, Mail, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { listQuotes } from '../features/devis/api'
import { QuoteModal } from '../features/devis/components/QuoteModal'
import {
  QUOTE_STATUS_BADGE,
  QUOTE_STATUS_ICON,
  QUOTE_STATUS_LABEL,
  formatAmount,
} from '../features/devis/constants'
import type { QuoteStatus } from '../features/devis/constants'
import type { Quote } from '../features/devis/schemas'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

const TABS: Array<{ key: QuoteStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'sent', label: 'Envoyés' },
  { key: 'accepted', label: 'Acceptés' },
  { key: 'refused', label: 'Refusés' },
]

export function DevisPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<QuoteStatus | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await listQuotes()
      setQuotes(data)
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length }
    for (const status of ['draft', 'sent', 'accepted', 'refused', 'expired'] as QuoteStatus[]) {
      c[status] = quotes.filter((q) => q.status === status).length
    }
    return c
  }, [quotes])

  const filtered = useMemo(() => {
    if (tab === 'all') return quotes
    return quotes.filter((q) => q.status === tab)
  }, [quotes, tab])

  // KPIs
  const monthStart = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  }, [])
  const totalAccepted = quotes
    .filter((q) => q.status === 'accepted')
    .reduce((sum, q) => sum + Number(q.total_ttc), 0)
  const totalSentMonth = quotes
    .filter((q) => q.status === 'sent' && q.issue_date >= monthStart)
    .reduce((sum, q) => sum + Number(q.total_ttc), 0)
  const totalAcceptedMonth = quotes
    .filter((q) => q.status === 'accepted' && q.issue_date >= monthStart)
    .reduce((sum, q) => sum + Number(q.total_ttc), 0)

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
          <div className="dash-title">Devis</div>
          <div className="dash-sub">
            {quotes.length === 0 && 'Aucun devis pour le moment'}
            {quotes.length === 1 && '1 devis enregistré'}
            {quotes.length > 1 && `${quotes.length} devis · ${counts.accepted} accepté${counts.accepted > 1 ? 's' : ''}, ${counts.sent} en attente`}
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
            Nouveau devis
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="kpi-lbl">Acceptés (mois)</div>
          <div className="kpi-val">{formatAmount(totalAcceptedMonth)}</div>
          <div className="kpi-sub">CA confirmé</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">En attente (mois)</div>
          <div className="kpi-val">{formatAmount(totalSentMonth)}</div>
          <div className="kpi-sub">Devis envoyés sans réponse</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Total acceptés</div>
          <div className="kpi-val">{formatAmount(totalAccepted)}</div>
          <div className="kpi-sub">{counts.accepted} devis</div>
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
              {tab === 'all' ? 'Aucun devis pour le moment.' : 'Aucun devis dans ce statut.'}
            </p>
            {tab === 'all' && (
              <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 460, margin: '0 auto' }}>
                Crée ton premier devis pour le proposer au client. La numérotation est automatique
                (DEV-2026-0001) et tu peux générer un PDF prêt à envoyer en 1 clic.
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="quotes-list">
            {filtered.map((q) => {
              const status = q.status as QuoteStatus
              const Icon = QUOTE_STATUS_ICON[status]
              return (
                <div
                  key={q.id}
                  className="quote-row"
                  onClick={() => openEdit(q.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openEdit(q.id) }}
                >
                  <div className={`quote-row-icon ${QUOTE_STATUS_BADGE[status]}`}>
                    <Icon size={14} strokeWidth={2} />
                  </div>
                  <div className="quote-row-main">
                    <div className="quote-row-title">
                      <strong>{q.reference}</strong>
                      <span className="quote-row-client"> — {q.client_name}</span>
                      {q.site_name && <span className="text-ink-3"> · {q.site_name}</span>}
                    </div>
                    <div className="quote-row-meta">
                      Émis le {formatDate(q.issue_date)}
                      {q.validity_date && <> · valide jusqu'au {formatDate(q.validity_date)}</>}
                      {q.sent_at && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                          · <Mail size={9} strokeWidth={2} /> envoyé
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="quote-row-amount">
                    <div className="quote-row-amount-val">{formatAmount(Number(q.total_ttc))}</div>
                    <div className="quote-row-amount-sub">TTC</div>
                  </div>
                  <div className="quote-row-status">
                    <span className={`badge ${QUOTE_STATUS_BADGE[status]}`}>
                      {QUOTE_STATUS_LABEL[status]}
                    </span>
                  </div>
                  {q.pdf_url && (
                    <a
                      href={q.pdf_url}
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
              )
            })}
          </div>
        )}
      </div>

      <QuoteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
        quoteId={editingId}
      />
    </>
  )
}
