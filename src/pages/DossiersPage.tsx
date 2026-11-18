import { FolderInput, FolderOpen, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listDossiers } from '../features/dossiers/api'
import { DossierImportModal } from '../features/dossiers/components/DossierImportModal'
import type { DossierSummary } from '../features/dossiers/api'
import { matchesSearch } from '../shared/lib/search'

/** Liste des dossiers (un par N° de dossier), avec recherche par numéro, client ou site */
export function DossiersPage() {
  const [dossiers, setDossiers] = useState<DossierSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    listDossiers()
      .then((list) => { if (alive) { setDossiers(list); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reloadKey])

  const filtered = useMemo(
    () => dossiers.filter((d) => matchesSearch(search, [d.number, ...d.years, ...d.clientNames, ...d.siteNames])),
    [dossiers, search],
  )

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={22} strokeWidth={2} />
            Dossiers
          </div>
          <div className="dash-sub">
            Chaque chantier et tout ce qui s'y rattache : visites, rapports, devis, factures, documents et photos.
          </div>
        </div>
        <div className="dash-acts">
          <button
            type="button"
            className="btn-sm acc"
            onClick={() => setImportOpen(true)}
            title="Déposer des ZIP, des dossiers ou des fichiers : chaque document est rangé dans son dossier"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <FolderInput size={14} strokeWidth={2} /> Importer des documents
          </button>
        </div>
      </div>
      {flash && <p className="text-grn text-sm" style={{ margin: '0 0 .8rem' }}>{flash}</p>}
      {importOpen && (
        <DossierImportModal
          knownNumbers={dossiers.map((d) => d.number)}
          onClose={() => setImportOpen(false)}
          onImported={(count) => {
            setReloadKey((k) => k + 1)
            setFlash(`${count} document${count > 1 ? 's' : ''} rangé${count > 1 ? 's' : ''} dans leurs dossiers.`)
            setTimeout(() => setFlash(null), 5000)
          }}
        />
      )}

      <div className="card">
        {dossiers.length > 0 && (
          <div className="archive-search" style={{ marginBottom: '.8rem' }}>
            <Search size={14} strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un N° de dossier, un client, un site…"
            />
          </div>
        )}

        {loading && <p className="text-ink-2 text-sm font-light">Chargement des dossiers…</p>}
        {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

        {!loading && !error && dossiers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <FolderOpen size={32} strokeWidth={1.5} className="text-ink-3" style={{ margin: '0 auto .5rem' }} />
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>Aucun dossier pour l'instant.</p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 460, margin: '0 auto 1rem' }}>
              Donnez un N° de dossier à un site (Équipements, choisissez le site, puis « Modifier ce site ») ou à une visite (Planning) :
              son dossier apparaît ici, avec ses visites, ses rapports, ses devis, ses factures et ses documents. Chaque année a son numéro.
            </p>
            <Link to="/equipements" className="btn-sm">Aller aux équipements</Link>
          </div>
        )}

        {!loading && !error && dossiers.length > 0 && filtered.length === 0 && (
          <p className="text-ink-3 text-sm font-light">Aucun dossier ne correspond à « {search} ».</p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="archive-list">
            {filtered.map((d) => (
              <Link key={d.number} to={`/dossiers/${encodeURIComponent(d.number)}`} className="archive-row b-acc" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="archive-icon b-acc"><FolderOpen size={14} strokeWidth={2} /></div>
                <div className="archive-main">
                  <div className="archive-title">
                    <strong>{d.number}</strong>
                    {d.years.length > 0 && <span className="archive-light"> · {d.years.join(', ')}</span>}
                    {d.clientNames.length > 0 && <span className="archive-light"> — {d.clientNames.join(', ')}</span>}
                  </div>
                  <div className="archive-meta">
                    {d.siteNames.length === 0
                      ? 'Aucun site rattaché'
                      : `${d.siteNames.length} site${d.siteNames.length > 1 ? 's' : ''} : ${d.siteNames.join(', ')}`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
