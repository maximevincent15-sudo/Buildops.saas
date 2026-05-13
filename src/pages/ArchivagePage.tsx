import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Archive,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Receipt,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listArchivedDocuments } from '../features/archivage/api'
import type { ArchivedDocument } from '../features/archivage/api'
import { formatAmount } from '../features/devis/constants'

type KindFilter = 'all' | 'report' | 'quote' | 'invoice'

const KIND_LABEL: Record<Exclude<KindFilter, 'all'>, string> = {
  report: 'Rapport',
  quote: 'Devis',
  invoice: 'Facture',
}

const KIND_ICON: Record<Exclude<KindFilter, 'all'>, typeof ClipboardCheck> = {
  report: ClipboardCheck,
  quote: FileText,
  invoice: Receipt,
}

const KIND_BADGE: Record<Exclude<KindFilter, 'all'>, string> = {
  report: 'b-grn',
  quote: 'b-acc',
  invoice: 'b-org',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function getYear(d: string): string {
  try {
    return new Date(d).getFullYear().toString()
  } catch {
    return '—'
  }
}

export function ArchivagePage() {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = (profile?.user_role ?? 'admin') === 'admin'

  const [docs, setDocs] = useState<ArchivedDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtres
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await listArchivedDocuments()
      setDocs(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Listes uniques pour les filtres
  const clients = useMemo(() => {
    const set = new Set<string>()
    for (const d of docs) set.add(d.client_name)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [docs])

  const years = useMemo(() => {
    const set = new Set<string>()
    for (const d of docs) set.add(getYear(d.date))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [docs])

  // Application des filtres
  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (kindFilter !== 'all' && d.kind !== kindFilter) return false
      if (clientFilter !== 'all' && d.client_name !== clientFilter) return false
      if (yearFilter !== 'all' && getYear(d.date) !== yearFilter) return false
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        const haystack = [
          d.reference,
          d.client_name,
          d.site_name ?? '',
        ].join(' ').toLowerCase()
        if (!haystack.includes(s)) return false
      }
      return true
    })
  }, [docs, kindFilter, clientFilter, yearFilter, search])

  // Stats globales
  const counts = useMemo(() => ({
    all: docs.length,
    report: docs.filter((d) => d.kind === 'report').length,
    quote: docs.filter((d) => d.kind === 'quote').length,
    invoice: docs.filter((d) => d.kind === 'invoice').length,
  }), [docs])

  function clearFilters() {
    setSearch('')
    setKindFilter('all')
    setClientFilter('all')
    setYearFilter('all')
  }

  const hasActiveFilters =
    search.trim() !== '' ||
    kindFilter !== 'all' ||
    clientFilter !== 'all' ||
    yearFilter !== 'all'

  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '2rem auto' }}>
        <div className="card-top">
          <span className="card-title">Accès restreint</span>
        </div>
        <p className="text-ink-2 text-sm font-light">
          Seuls les administrateurs peuvent consulter l'archivage des documents.
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
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Archive size={22} strokeWidth={1.8} />
            Archivage
          </div>
          <div className="dash-sub">
            {docs.length === 0 && 'Aucun document pour le moment'}
            {docs.length === 1 && '1 document archivé'}
            {docs.length > 1 && `${docs.length} documents · ${counts.report} rapports, ${counts.quote} devis, ${counts.invoice} factures`}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="archive-filters">
          {/* Recherche */}
          <div className="archive-search">
            <Search size={14} strokeWidth={2} />
            <input
              type="text"
              placeholder="Rechercher par référence, client, site…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filtres pills */}
          <div className="archive-pills">
            <button
              type="button"
              className={`filter-pill${kindFilter === 'all' ? ' on' : ''}`}
              onClick={() => setKindFilter('all')}
            >
              Tous ({counts.all})
            </button>
            <button
              type="button"
              className={`filter-pill${kindFilter === 'report' ? ' on' : ''}`}
              onClick={() => setKindFilter('report')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ClipboardCheck size={12} strokeWidth={2} />
              Rapports ({counts.report})
            </button>
            <button
              type="button"
              className={`filter-pill${kindFilter === 'quote' ? ' on' : ''}`}
              onClick={() => setKindFilter('quote')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <FileText size={12} strokeWidth={2} />
              Devis ({counts.quote})
            </button>
            <button
              type="button"
              className={`filter-pill${kindFilter === 'invoice' ? ' on' : ''}`}
              onClick={() => setKindFilter('invoice')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Receipt size={12} strokeWidth={2} />
              Factures ({counts.invoice})
            </button>
          </div>

          {/* Filtres dropdowns */}
          <div className="archive-dropdowns">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="archive-select"
            >
              <option value="all">Tous les clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="archive-select"
            >
              <option value="all">Toutes les années</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                className="archive-clear"
                onClick={clearFilters}
                title="Réinitialiser tous les filtres"
              >
                <X size={12} strokeWidth={2.5} />
                Effacer les filtres
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Résultats */}
      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement de l'archivage…</p>}
        {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

        {!loading && !error && filtered.length === 0 && docs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <FileSearch size={32} strokeWidth={1.5} className="text-ink-3" style={{ margin: '0 auto .5rem' }} />
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucun document archivé pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 460, margin: '0 auto' }}>
              Tous tes rapports finalisés, devis envoyés et factures émises apparaîtront ici
              automatiquement, avec leur PDF téléchargeable.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && docs.length > 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p className="text-ink-3 text-sm font-light">
              Aucun document ne correspond à ta recherche.
            </p>
            <button
              type="button"
              className="btn-sm"
              onClick={clearFilters}
              style={{ marginTop: '.6rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <X size={12} strokeWidth={2.5} />
              Effacer les filtres
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            {hasActiveFilters && (
              <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '.6rem' }}>
                {filtered.length} résultat{filtered.length > 1 ? 's' : ''} sur {docs.length}
              </p>
            )}
            <div className="archive-list">
              {filtered.map((d) => {
                const Icon = KIND_ICON[d.kind]
                const sourceLink =
                  d.kind === 'report'
                    ? `/rapports/${d.intervention_id}`
                    : d.kind === 'quote'
                      ? `/devis`
                      : `/factures`
                return (
                  <div key={`${d.kind}-${d.id}`} className={`archive-row ${KIND_BADGE[d.kind]}`}>
                    <div className={`archive-icon ${KIND_BADGE[d.kind]}`}>
                      <Icon size={14} strokeWidth={2} />
                    </div>
                    <div className="archive-main">
                      <div className="archive-title">
                        <span className="archive-kind">{KIND_LABEL[d.kind]}</span>
                        <strong>{d.reference}</strong>
                        <span className="archive-light"> — {d.client_name}</span>
                        {d.site_name && <span className="text-ink-3"> · {d.site_name}</span>}
                      </div>
                      <div className="archive-meta">
                        {formatDate(d.date)}
                        {d.amount_ttc !== undefined && (
                          <> · <strong>{formatAmount(d.amount_ttc)}</strong> TTC</>
                        )}
                      </div>
                    </div>
                    <div className="archive-actions">
                      {d.pdf_url && (
                        <a
                          href={d.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-sm"
                          title="Télécharger le PDF"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Download size={11} strokeWidth={2} /> PDF
                        </a>
                      )}
                      {d.kind === 'report' && d.intervention_id && (
                        <Link
                          to={sourceLink}
                          className="btn-sm subtle"
                          title="Ouvrir le document source"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <ExternalLink size={11} strokeWidth={2} />
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
