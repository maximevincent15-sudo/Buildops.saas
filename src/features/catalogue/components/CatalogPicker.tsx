import { BookOpen } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { matchesSearch } from '../../../shared/lib/search'
import { formatAmount } from '../../devis/constants'
import { listCatalogItems } from '../api'
import { CATALOG_CATEGORY_SHORT } from '../schemas'
import type { CatalogItem } from '../schemas'

type Props = {
  /** Article choisi : le parent ajoute la ligne (désignation, prix, TVA) */
  onPick: (item: CatalogItem) => void
}

const MAX_RESULTS = 8

/**
 * Recherche dans le catalogue pour remplir une ligne de devis ou de facture
 * en un clic (« co2 », « baes », « déplacement »…). Le catalogue est chargé
 * au premier focus, une seule fois.
 */
export function CatalogPicker({ onPick }: Props) {
  const [items, setItems] = useState<CatalogItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const loading = useRef(false)

  function ensureLoaded() {
    if (items !== null || loading.current) return
    loading.current = true
    listCatalogItems({ activeOnly: true })
      .then(setItems, () => { setItems([]); setLoadError(true) })
      .finally(() => { loading.current = false })
  }

  const results = useMemo(() => {
    if (!items) return []
    return items
      .filter((i) => matchesSearch(query, [i.label, i.reference, CATALOG_CATEGORY_SHORT[i.category]]))
      .slice(0, MAX_RESULTS)
  }, [items, query])

  function pick(item: CatalogItem) {
    onPick(item)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      // Ne pas soumettre le formulaire du devis
      e.preventDefault()
      const item = results[active]
      if (open && item) pick(item)
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 460, alignSelf: 'center' }}>
      <BookOpen
        size={14}
        strokeWidth={2}
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }}
      />
      <input
        type="text"
        className="input-sm"
        placeholder="Ajouter un article du catalogue (ex. CO2, BAES, déplacement)…"
        value={query}
        onFocus={() => { ensureLoaded(); setOpen(true) }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={handleKey}
        style={{ paddingLeft: 30, width: '100%', display: 'block' }}
        aria-label="Rechercher un article du catalogue"
      />
      {open && items !== null && (
        <div
          role="listbox"
          style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 20,
            background: 'white', border: '1px solid var(--brd)', borderRadius: 10,
            boxShadow: '0 12px 30px rgba(28,33,48,.12)', overflow: 'hidden',
          }}
        >
          {results.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={idx === active}
              // mousedown : passe avant le blur du champ
              onMouseDown={(e) => { e.preventDefault(); pick(item) }}
              onMouseEnter={() => setActive(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '.55rem .8rem', border: 'none', cursor: 'pointer', fontSize: '.85rem',
                background: idx === active ? 'var(--acc-lt, #EAF0FA)' : 'white',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                <span className="text-ink-3 text-xs">
                  {CATALOG_CATEGORY_SHORT[item.category]}{item.reference ? ` · ${item.reference}` : ''}
                </span>
              </span>
              <span style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                {formatAmount(item.unit_price_ht)}
                <span className="text-ink-3 text-xs" style={{ fontWeight: 400 }}> HT / {item.unit}</span>
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="text-ink-3 text-xs" style={{ padding: '.7rem .8rem' }}>
              {loadError
                ? 'Catalogue indisponible pour le moment.'
                : items.length === 0
                  ? <>Ton catalogue est vide. <Link to="/catalogue" target="_blank" rel="noreferrer" onMouseDown={(e) => e.preventDefault()} style={{ color: 'var(--acc)', fontWeight: 500 }}>Créer mon catalogue</Link></>
                  : `Aucun article ne correspond à « ${query} ».`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
