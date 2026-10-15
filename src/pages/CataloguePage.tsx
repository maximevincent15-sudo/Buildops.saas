import { BookOpen, Search, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { createCatalogItems, listCatalogItems } from '../features/catalogue/api'
import { CatalogItemModal } from '../features/catalogue/components/CatalogItemModal'
import { DEFAULT_CATALOG } from '../features/catalogue/defaultCatalog'
import { CATALOG_CATEGORIES, CATALOG_CATEGORY_SHORT, marginRate } from '../features/catalogue/schemas'
import type { CatalogCategory, CatalogItem } from '../features/catalogue/schemas'
import { formatAmount } from '../features/devis/constants'
import { matchesSearch, normalizeSearch } from '../shared/lib/search'

const CATEGORY_BADGE: Record<CatalogCategory, string> = {
  prestation: 'b-blu',
  fourniture: 'b-grn',
  main_oeuvre: 'b-org',
  deplacement: 'b-gry',
  autre: 'b-gry',
}

export function CataloguePage() {
  const organizationId = useAuthStore((s) => s.profile?.organization_id)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | CatalogCategory>('all')
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setItems(await listCatalogItems())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visible = useMemo(
    () => items.filter((i) =>
      (category === 'all' || i.category === category) &&
      matchesSearch(search, [i.label, i.reference, i.notes, CATALOG_CATEGORY_SHORT[i.category]])),
    [items, category, search],
  )

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(item: CatalogItem) {
    setEditing(item)
    setModalOpen(true)
  }

  /** Ajoute les articles types absents (même désignation = déjà présent) */
  async function handleSeed() {
    if (!organizationId) return
    const existing = new Set(items.map((i) => normalizeSearch(i.label)))
    const missing = DEFAULT_CATALOG.filter((i) => !existing.has(normalizeSearch(i.label)))
    if (missing.length === 0) {
      setFlash('Tous les articles types sont déjà dans ton catalogue.')
      return
    }
    if (!window.confirm(
      `Ajouter ${missing.length} articles types (vérifications, recharges, extincteurs, BAES, main-d'œuvre, déplacement) ?\n\n` +
      'Les prix sont INDICATIFS : ajuste-les ensuite à ton propre tarif.',
    )) return
    setSeeding(true)
    setError(null)
    try {
      const n = await createCatalogItems(missing, organizationId)
      setFlash(`${n} articles ajoutés. Pense à ajuster les prix à ton tarif.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSeeding(false)
    }
  }

  const total = items.length
  const inactive = items.filter((i) => !i.active).length

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Catalogue</div>
          <div className="dash-sub">
            {total === 0 && 'Tes articles et tarifs, pour remplir un devis ou une facture en un clic'}
            {total > 0 && `${total} article${total > 1 ? 's' : ''}${inactive > 0 ? ` · ${inactive} masqué${inactive > 1 ? 's' : ''}` : ''}`}
          </div>
        </div>
        <div className="dash-acts">
          <button
            type="button"
            className="btn-sm"
            onClick={() => void handleSeed()}
            disabled={seeding || loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={13} strokeWidth={2} />
            {seeding ? 'Ajout…' : 'Articles types'}
          </button>
          <Link to="/catalogue/import" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={13} strokeWidth={2} />
            Importer
          </Link>
          <button type="button" className="btn-sm acc" onClick={openCreate}>
            + Nouvel article
          </button>
        </div>
      </div>

      {flash && (
        <div className="card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.6rem', background: '#E6F4EB', border: '1px solid #B7DFC7', color: '#0E7A3F', fontSize: '.85rem' }}>
          <span style={{ flex: 1 }}>{flash}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}
        {error && !loading && <p className="text-red text-sm">Erreur : {error}</p>}

        {!loading && !error && total === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <BookOpen size={28} strokeWidth={1.6} style={{ color: 'var(--ink3)', marginBottom: '.6rem' }} />
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Ton catalogue est vide.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '1.2rem', maxWidth: 520, marginInline: 'auto' }}>
              Démarre avec une trentaine d'articles types du métier (vérifications, recharges, extincteurs,
              éclairage de sécurité, main-d'œuvre, déplacement) puis ajuste les prix, ou importe ta propre liste de prix.
            </p>
            <div style={{ display: 'inline-flex', gap: '.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn-sm acc" onClick={() => void handleSeed()} disabled={seeding}>
                {seeding ? 'Ajout…' : 'Démarrer avec les articles types'}
              </button>
              <Link to="/catalogue/import" className="btn-sm">Importer ma liste de prix</Link>
            </div>
          </div>
        )}

        {!loading && !error && total > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
                <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
                <input
                  className="input-sm"
                  type="search"
                  placeholder="Rechercher (désignation, référence…)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: 30, width: '100%' }}
                />
              </div>
              <select className="input-sm" value={category} onChange={(e) => setCategory(e.target.value as 'all' | CatalogCategory)}>
                <option value="all">Toutes catégories</option>
                {CATALOG_CATEGORIES.map((c) => <option key={c} value={c}>{CATALOG_CATEGORY_SHORT[c]}</option>)}
              </select>
              <span className="text-ink-3 text-xs font-light">
                {visible.length === total ? 'Clique sur un article pour le modifier.' : `${visible.length} sur ${total}`}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '.75rem' }}>
                    <th style={{ padding: '.5rem' }}>Désignation</th>
                    <th style={{ padding: '.5rem' }}>Catégorie</th>
                    <th style={{ padding: '.5rem', textAlign: 'right' }}>Prix HT</th>
                    <th style={{ padding: '.5rem', textAlign: 'right' }}>Achat HT</th>
                    <th style={{ padding: '.5rem', textAlign: 'right' }}>Marge</th>
                    <th style={{ padding: '.5rem', textAlign: 'right' }}>TVA</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const margin = marginRate(item)
                    return (
                      <tr
                        key={item.id}
                        onClick={() => openEdit(item)}
                        style={{ cursor: 'pointer', borderTop: '1px solid var(--brd)', opacity: item.active ? 1 : 0.5 }}
                      >
                        <td style={{ padding: '.6rem .5rem' }}>
                          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{item.label}</div>
                          {(item.reference || !item.active) && (
                            <div className="text-ink-3 text-xs">
                              {item.reference}{!item.active ? `${item.reference ? ' · ' : ''}masqué dans les devis` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '.6rem .5rem' }}>
                          <span className={`badge ${CATEGORY_BADGE[item.category]}`}>{CATALOG_CATEGORY_SHORT[item.category]}</span>
                        </td>
                        <td style={{ padding: '.6rem .5rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {formatAmount(item.unit_price_ht)} <span className="text-ink-3 text-xs" style={{ fontWeight: 400 }}>/ {item.unit}</span>
                        </td>
                        <td style={{ padding: '.6rem .5rem', textAlign: 'right', whiteSpace: 'nowrap' }} className="text-ink-2">
                          {item.purchase_price_ht != null ? formatAmount(item.purchase_price_ht) : '—'}
                        </td>
                        <td style={{ padding: '.6rem .5rem', textAlign: 'right', whiteSpace: 'nowrap', color: margin !== null && margin < 0 ? 'var(--red)' : 'var(--ink2)' }}>
                          {margin !== null ? `${margin.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %` : '—'}
                        </td>
                        <td style={{ padding: '.6rem .5rem', textAlign: 'right' }} className="text-ink-2">
                          {item.vat_rate.toLocaleString('fr-FR')} %
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <CatalogItemModal
          key={editing?.id ?? 'new'}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onChanged={() => void load()}
          item={editing}
        />
      )}
    </>
  )
}
