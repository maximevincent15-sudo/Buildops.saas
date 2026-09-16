import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { listClients } from '../../clients/api'
import type { Client } from '../../clients/schemas'
import {
  batchCreateEquipmentUnits,
  listSites,
  listZones,
} from '../api'
import {
  EQUIPMENT_FAMILIES,
  EQUIPMENT_FAMILY_LABELS,
  computeNextReplacementYear,
} from '../schemas'
import type {
  CreateEquipmentUnitInput,
  EquipmentFamily,
  Site,
  Zone,
} from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const CURRENT_YEAR = new Date().getFullYear()

function padNumber(n: number, width: number): string {
  return n.toString().padStart(width, '0')
}

export function BatchAddUnitsModal({ open, onClose, onCreated }: Props) {
  const profile = useAuthStore((s) => s.profile)

  const [clients, setClients] = useState<Client[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [zones, setZones] = useState<Zone[]>([])

  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [zoneId, setZoneId] = useState('')

  const [family, setFamily] = useState<EquipmentFamily>('extincteurs')
  const [subtype, setSubtype] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [installYear, setInstallYear] = useState<number>(CURRENT_YEAR)
  const [count, setCount] = useState(10)
  const [startNumber, setStartNumber] = useState(1)
  const [padWidth, setPadWidth] = useState(2) // "01" au lieu de "1"

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset au ré-ouverture
  useEffect(() => {
    if (!open) return
    setError(null)
    setCreating(false)
    listClients().then(setClients).catch(() => setClients([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!clientId) { setSites([]); setSiteId(''); return }
    listSites(clientId).then(setSites).catch(() => setSites([]))
  }, [open, clientId])

  useEffect(() => {
    if (!open) return
    if (!siteId) { setZones([]); setZoneId(''); return }
    listZones(siteId).then(setZones).catch(() => setZones([]))
  }, [open, siteId])

  const nextReplacementYear = useMemo(
    () => computeNextReplacementYear(family, installYear),
    [family, installYear],
  )

  const preview = useMemo(() => {
    if (count < 1) return []
    const list: string[] = []
    for (let i = 0; i < Math.min(count, 5); i++) {
      list.push(padNumber(startNumber + i, padWidth))
    }
    if (count > 5) {
      list.push('…')
      list.push(padNumber(startNumber + count - 1, padWidth))
    }
    return list
  }, [count, startNumber, padWidth])

  async function handleSubmit() {
    if (!profile?.organization_id) {
      setError('Profil non chargé. Reconnecte-toi.')
      return
    }
    if (!clientId || !siteId) {
      setError('Choisis un client et un site.')
      return
    }
    if (count < 1 || count > 500) {
      setError('Nombre invalide (1 à 500).')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const inputs: CreateEquipmentUnitInput[] = []
      for (let i = 0; i < count; i++) {
        inputs.push({
          client_id: clientId,
          site_id: siteId,
          zone_id: zoneId || undefined,
          family,
          subtype: subtype || undefined,
          serial_number: padNumber(startNumber + i, padWidth),
          brand: brand || undefined,
          model: model || undefined,
          install_year: installYear,
          next_replacement_year: nextReplacementYear ?? undefined,
          status: 'active',
        })
      }
      await batchCreateEquipmentUnits(inputs, profile.organization_id)
      onClose()
      onCreated?.()
    } catch (e) {
      // Supabase renvoie souvent des PostgrestError (pas des vraies Error).
      // On extrait le message de manière robuste.
      const err = e as { message?: string; details?: string; hint?: string; code?: string } | Error
      const msg =
        (typeof err === 'object' && err !== null && 'message' in err && err.message) ||
        (typeof err === 'object' && err !== null && 'details' in err && err.details) ||
        String(e)
      const lowerMsg = String(msg).toLowerCase()
      // Détection du cas doublon (contrainte unique site_id, family, serial_number)
      if (
        lowerMsg.includes('duplicate') ||
        lowerMsg.includes('unique') ||
        lowerMsg.includes('23505') // Postgres error code pour unique_violation
      ) {
        setError(
          `Certains N° existent déjà pour cette famille sur ce site (par ex. N°12 semble présent). ` +
          `Change le N° de départ ou supprime les unités existantes d'abord.`,
        )
      } else {
        setError(`${msg}`)
      }
      // Log en console pour debug
      console.error('Batch create error:', e)
    } finally {
      setCreating(false)
    }
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !creating) onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdropClick}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">Ajout rapide en lot</span>
          <button type="button" className="modal-x" onClick={onClose} disabled={creating} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '.5rem 0' }}>
          <div style={helpBoxStyle}>
            Idéal pour saisir un nouveau site :
            <strong> choisis une zone + une famille + un modèle,
            saisis combien d'unités identiques.</strong> Firovia les crée toutes
            avec des N° incrémentaux.
          </div>

          {/* Localisation */}
          <div className="mrow">
            <div className="fg">
              <label>Client</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— Choisir un client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>Site</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!clientId}>
                <option value="">— Choisir un site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="fg">
            <label>Zone (optionnel — toutes les unités du lot iront dans cette zone)</label>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={!siteId}>
              <option value="">— Aucune zone (à assigner plus tard) —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.parent_zone ? `${z.parent_zone} · ${z.name}` : z.name}
                </option>
              ))}
            </select>
          </div>

          {/* Famille — chips */}
          <div className="fg">
            <label>Famille d'équipement</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EQUIPMENT_FAMILIES.map((fam) => (
                <button
                  key={fam}
                  type="button"
                  className={`filter-pill${family === fam ? ' on' : ''}`}
                  onClick={() => setFamily(fam)}
                >
                  {EQUIPMENT_FAMILY_LABELS[fam]}
                </button>
              ))}
            </div>
          </div>

          {/* Modèle commun */}
          <div className="mrow">
            <div className="fg">
              <label>Type / sous-type</label>
              <input
                type="text"
                placeholder="Ex : EPA 6L, CO² 5kg, P6 ABC"
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
              />
            </div>
            <div className="fg">
              <label>Marque</label>
              <input
                type="text"
                placeholder="Ex : ANDRIEU"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Modèle (facultatif)</label>
              <input
                type="text"
                placeholder=""
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="fg">
              <label>
                Année de mise en service
                {nextReplacementYear !== null && (
                  <span style={hintStyle}> · réforme suggérée {nextReplacementYear}</span>
                )}
              </label>
              <input
                type="number"
                min={1900}
                max={2100}
                value={installYear}
                onChange={(e) => setInstallYear(parseInt(e.target.value, 10) || CURRENT_YEAR)}
              />
            </div>
          </div>

          {/* Nombre + N° début */}
          <div className="mrow">
            <div className="fg">
              <label>Nombre d'unités à créer</label>
              <input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="fg">
              <label>N° de départ (auto-incrémenté)</label>
              <input
                type="number"
                min={1}
                value={startNumber}
                onChange={(e) => setStartNumber(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="fg">
            <label>Format N° (padding zéros)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`filter-pill${padWidth === w ? ' on' : ''}`}
                  onClick={() => setPadWidth(w)}
                >
                  {padNumber(1, w)} · {padNumber(99, w)}
                </button>
              ))}
            </div>
          </div>

          {/* Aperçu */}
          {preview.length > 0 && (
            <div style={previewBoxStyle}>
              <div style={{ fontSize: 11.5, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 6 }}>
                Aperçu · {count} unités {EQUIPMENT_FAMILY_LABELS[family]}
                {subtype ? ` · ${subtype}` : ''}
                {brand ? ` · ${brand}` : ''}
                {installYear ? ` · ${installYear}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {preview.map((p, i) => (
                  <span key={i} style={previewChipStyle}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {error && <span className="ferr on">{error}</span>}
        </div>

        <div className="modal-foot">
          <button type="button" className="mf out" onClick={onClose} disabled={creating}>
            Annuler
          </button>
          <button
            type="button"
            className="mf prim"
            onClick={() => void handleSubmit()}
            disabled={creating || !clientId || !siteId || count < 1}
          >
            {creating ? `Création de ${count} unités…` : `Créer ${count} unité${count > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const helpBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--acc-lt, #E8EEF8)',
  color: 'var(--acc, #3A5CA8)',
  borderRadius: 8,
  fontSize: 12.5,
  lineHeight: 1.5,
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink3)',
  fontWeight: 500,
  marginLeft: 4,
}

const previewBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--wht, #F8F9FB)',
  border: '1px solid var(--brd, #E1E5EA)',
  borderRadius: 8,
}

const previewChipStyle: React.CSSProperties = {
  padding: '2px 8px',
  background: 'var(--acc-lt, #E8EEF8)',
  color: 'var(--acc, #3A5CA8)',
  fontWeight: 700,
  fontSize: 12,
  borderRadius: 5,
  fontFamily: 'monospace',
}
