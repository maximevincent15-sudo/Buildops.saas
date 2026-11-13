import { Link2, Plus, Search, Tag } from 'lucide-react'
import { ModalPortal } from '../../../shared/ui/ModalPortal'
import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { normalizeSearch } from '../../../shared/lib/search'
import { firoviaLabelCode } from '../labels'
import { unitLocation, unitRepere, unitTypeLine } from '../identification'
import type { EquipmentUnit, Zone } from '../schemas'

type Props = {
  /** Contenu scanné de la nouvelle étiquette */
  code: string
  /** Appareils du site sans étiquette, dans l'ordre de passage */
  candidates: EquipmentUnit[]
  zonesById: Map<string, Zone>
  /** Appareils prévus au chantier (affichés en premier) */
  isInScope: (u: EquipmentUnit) => boolean
  onLink: (unit: EquipmentUnit) => Promise<void>
  onCreate: () => void
  onClose: () => void
}

/**
 * Étiquette scannée inconnue : l'associer à un appareil déjà enregistré sans
 * étiquette (parc importé), ou créer un nouvel appareil.
 */
export function LinkLabelSheet({ code, candidates, zonesById, isInScope, onLink, onCreate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shortCode = firoviaLabelCode(code) ?? code.trim()

  const list = useMemo(() => {
    const q = normalizeSearch(query)
    const rows = candidates.filter((u) => {
      if (!q) return true
      const zone = u.zone_id ? zonesById.get(u.zone_id) : null
      return normalizeSearch([unitRepere(u), u.serial_number, unitTypeLine(u), u.implantation ?? '', zone?.name ?? '', u.brand ?? ''].join(' ')).includes(q)
    })
    // Appareils du chantier d'abord, l'ordre de passage est conservé
    return [...rows.filter(isInScope), ...rows.filter((u) => !isInScope(u))]
  }, [candidates, query, zonesById, isInScope])

  async function link(u: EquipmentUnit) {
    setBusyId(u.id)
    setError(null)
    try {
      await onLink(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Association impossible. Vérifiez votre connexion.')
      setBusyId(null)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !busyId) onClose()
  }

  return (
    <ModalPortal>
      <div className="overlay open" onClick={handleBackdrop}>
        <div className="modal" style={{ maxWidth: 520 }}>
          <div className="modal-head">
            <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Tag size={16} strokeWidth={2} /> Nouvelle étiquette
            </span>
            <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={!!busyId}>×</button>
          </div>

          <p className="text-ink-2 text-sm" style={{ margin: '0 0 .8rem' }}>
            Code <strong>{shortCode.length > 40 ? `${shortCode.slice(0, 40)}…` : shortCode}</strong> : à quel appareil est-elle collée ?
          </p>

          <div className="fg" style={{ marginBottom: '.6rem', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink3)' }} />
            <input
              type="search"
              placeholder="Repère, emplacement, type…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>

          <div style={{ maxHeight: '45vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.length === 0 && (
              <p className="text-ink-3 text-sm font-light" style={{ margin: '.4rem 0' }}>Aucun appareil sans étiquette ne correspond.</p>
            )}
            {list.map((u) => {
              const zone = u.zone_id ? zonesById.get(u.zone_id) ?? null : null
              const where = unitLocation(u, zone)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => void link(u)}
                  disabled={!!busyId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                    padding: '.6rem .75rem', borderRadius: 10, border: '1px solid var(--brd2)',
                    background: 'var(--wht)', cursor: 'pointer', font: 'inherit', color: 'var(--ink)',
                  }}
                >
                  <Link2 size={15} style={{ flex: '0 0 auto', color: 'var(--acc)' }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 700 }}>{unitRepere(u)}</span>
                    {unitTypeLine(u) && <span className="text-ink-2"> · {unitTypeLine(u)}</span>}
                    <span className="text-ink-3" style={{ display: 'block', fontSize: 12.5 }}>
                      {where || 'Emplacement non renseigné'}{!isInScope(u) ? ' · hors chantier' : ''}
                    </span>
                  </span>
                  {busyId === u.id && <span className="text-ink-3 text-xs">Association…</span>}
                </button>
              )
            })}
          </div>

          {error && <span className="ferr on" style={{ marginTop: 8, display: 'block' }}>{error}</span>}

          <div className="modal-foot" style={{ marginTop: '1rem' }}>
            <button type="button" className="mf out" onClick={onClose} disabled={!!busyId}>Annuler</button>
            <button type="button" className="mf prim" onClick={onCreate} disabled={!!busyId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nouvel appareil
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
