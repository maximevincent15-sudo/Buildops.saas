import { Download, ExternalLink, FolderOpen, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../auth/store'
import { matchesSearch } from '../../../shared/lib/search'
import { getDossier, listDossiers } from '../api'
import type { DossierSummary } from '../api'
import { exportDossierZip, saveBlob } from '../zip'

/** Archivage : les dossiers complets, à ouvrir ou à télécharger en un fichier ZIP */
export function DossierArchiveList() {
  const orgName = useAuthStore((s) => s.profile?.organizations?.name ?? '')
  const [dossiers, setDossiers] = useState<DossierSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [zipping, setZipping] = useState<{ number: string; label: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listDossiers()
      .then((list) => { if (alive) { setDossiers(list); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const filtered = useMemo(
    () => dossiers.filter((d) => matchesSearch(search, [d.number, ...d.years, ...d.clientNames, ...d.siteNames])),
    [dossiers, search],
  )

  async function handleZip(number: string) {
    setZipping({ number, label: 'Lecture du dossier…' })
    setFlash(null)
    try {
      const dossier = await getDossier(number)
      const res = await exportDossierZip(dossier, orgName, (label, done, total) =>
        setZipping({ number, label: total > 1 ? `${label} ${done}/${total}` : label }))
      saveBlob(res.blob, res.filename)
      setFlash(`Dossier ${number} téléchargé (${res.fileCount} pièce${res.fileCount > 1 ? 's' : ''}${res.failed ? `, ${res.failed} indisponible${res.failed > 1 ? 's' : ''}` : ''}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setZipping(null)
    }
  }

  return (
    <div className="card">
      <div className="archive-search" style={{ marginBottom: '.8rem' }}>
        <Search size={14} strokeWidth={2} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un N° de dossier, un client, un site…"
        />
      </div>

      {flash && <p className="text-grn text-sm" style={{ margin: '0 0 .6rem' }}>{flash}</p>}
      {loading && <p className="text-ink-2 text-sm font-light">Chargement des dossiers…</p>}
      {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

      {!loading && !error && dossiers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <FolderOpen size={32} strokeWidth={1.5} className="text-ink-3" style={{ margin: '0 auto .5rem' }} />
          <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>Aucun dossier pour l'instant.</p>
          <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 460, margin: '0 auto' }}>
            Donnez un N° de dossier à un site (Équipements, choisissez le site, puis « Modifier ce site ») ou à une visite (Planning) : le dossier complet du chantier apparaît ici, un par année.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="archive-list">
          {filtered.map((d) => {
            const busy = zipping?.number === d.number
            return (
              <div key={d.number} className="archive-row b-acc">
                <div className="archive-icon b-acc"><FolderOpen size={14} strokeWidth={2} /></div>
                <div className="archive-main">
                  <div className="archive-title">
                    <span className="archive-kind">Dossier</span>
                    <strong>{d.number}</strong>
                    {d.years.length > 0 && <span className="archive-light"> · {d.years.join(', ')}</span>}
                    {d.clientNames.length > 0 && <span className="archive-light"> — {d.clientNames.join(', ')}</span>}
                  </div>
                  <div className="archive-meta">
                    {busy
                      ? zipping.label
                      : d.siteNames.length === 0
                        ? 'Aucun site rattaché'
                        : `${d.siteNames.length} site${d.siteNames.length > 1 ? 's' : ''} : ${d.siteNames.join(', ')}`}
                  </div>
                </div>
                <div className="archive-actions">
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => void handleZip(d.number)}
                    disabled={!!zipping}
                    title="Télécharger le dossier complet : sommaire, rapports, devis, factures, documents et photos"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Download size={11} strokeWidth={2} /> {busy ? 'Préparation…' : 'ZIP'}
                  </button>
                  <Link
                    to={`/dossiers/${encodeURIComponent(d.number)}`}
                    className="btn-sm subtle"
                    title="Ouvrir le dossier"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={11} strokeWidth={2} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
