import { Camera, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  getFamilyTemplate,
  listChecksByIntervention,
  listEquipmentUnits,
  listZones,
  upsertCheck,
} from '../../equipment/api'
import {
  CHECK_VERDICT_LABELS,
  EQUIPMENT_FAMILY_LABELS,
} from '../../equipment/schemas'
import type {
  CheckItemValue,
  CheckVerdict,
  EquipmentCheck,
  EquipmentUnit,
  FamilyTemplate,
  Zone,
} from '../../equipment/schemas'

type Props = {
  interventionId: string
  siteId: string | null
  organizationId: string
  technicianId: string | null
  technicianName: string | null
  readOnly?: boolean
  onProgressChange?: (checked: number, total: number) => void
}

// Cache des templates par famille (partagé sur cette instance)
type TemplateCache = Map<string, FamilyTemplate>

export function UnitBasedControls({
  interventionId,
  siteId,
  organizationId,
  technicianId,
  technicianName,
  readOnly,
  onProgressChange,
}: Props) {
  const [zones, setZones] = useState<Zone[]>([])
  const [units, setUnits] = useState<EquipmentUnit[]>([])
  const [checks, setChecks] = useState<EquipmentCheck[]>([])
  const [templateCache, setTemplateCache] = useState<TemplateCache>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeZoneId, setActiveZoneId] = useState<string | 'all'>('all')
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)

  async function load() {
    if (!siteId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [z, u, c] = await Promise.all([
        listZones(siteId),
        listEquipmentUnits({ siteId }),
        listChecksByIntervention(interventionId),
      ])
      setZones(z)
      setUnits(u)
      setChecks(c)
      // Précharge les templates des familles présentes
      const families = Array.from(new Set(u.map((x) => x.family)))
      const templates = await Promise.all(families.map((f) => getFamilyTemplate(f)))
      const cache = new Map<string, FamilyTemplate>()
      templates.forEach((t) => { if (t) cache.set(t.family, t) })
      setTemplateCache(cache)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, interventionId])

  // Notifier progression au parent
  useEffect(() => {
    if (!onProgressChange) return
    const checkedCount = checks.filter((c) => c.verdict !== 'non_verifie').length
    onProgressChange(checkedCount, units.length)
  }, [checks, units.length, onProgressChange])

  const checksByUnit = useMemo(() => {
    const map = new Map<string, EquipmentCheck>()
    for (const c of checks) map.set(c.equipment_unit_id, c)
    return map
  }, [checks])

  const zonesById = useMemo(() => {
    const map = new Map<string, Zone>()
    for (const z of zones) map.set(z.id, z)
    return map
  }, [zones])

  // Unités affichées selon zone active
  const displayedUnits = useMemo(() => {
    if (activeZoneId === 'all') return units
    return units.filter((u) => u.zone_id === activeZoneId)
  }, [units, activeZoneId])

  const editingUnit = useMemo(
    () => (editingUnitId ? units.find((u) => u.id === editingUnitId) ?? null : null),
    [units, editingUnitId],
  )

  async function handleSaveCheck(patch: {
    checklist: Record<string, CheckItemValue>
    observation: string | null
    verdict: CheckVerdict
  }) {
    if (!editingUnit) return
    try {
      const template = templateCache.get(editingUnit.family) ?? null
      const saved = await upsertCheck(
        {
          intervention_id: interventionId,
          equipment_unit_id: editingUnit.id,
          family_template_id: template?.id ?? null,
          checklist: patch.checklist,
          observation: patch.observation,
          verdict: patch.verdict,
          photos: [],
        },
        organizationId,
        { technicianId, technicianName },
      )
      setChecks((prev) => {
        const filtered = prev.filter((c) => c.equipment_unit_id !== saved.equipment_unit_id)
        return [...filtered, saved]
      })
      setEditingUnitId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur enregistrement')
    }
  }

  if (!siteId) return null

  if (loading) {
    return (
      <div className="card">
        <p className="text-ink-2 text-sm font-light" style={{ padding: 12 }}>
          Chargement des équipements du site…
        </p>
      </div>
    )
  }

  if (units.length === 0) return null // pas d'inventaire → on utilise l'ancien flow

  // Compteurs par zone
  function countZone(zoneId: string): { done: number; total: number } {
    const zoneUnits = units.filter((u) => u.zone_id === zoneId)
    const done = zoneUnits.filter((u) => {
      const c = checksByUnit.get(u.id)
      return c && c.verdict !== 'non_verifie'
    }).length
    return { done, total: zoneUnits.length }
  }
  const orphanCount = units.filter((u) => !u.zone_id).length
  const orphanDone = units.filter((u) => {
    if (u.zone_id) return false
    const c = checksByUnit.get(u.id)
    return c && c.verdict !== 'non_verifie'
  }).length

  const totalChecked = checks.filter((c) => c.verdict !== 'non_verifie').length

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title">Contrôle par unité — {units.length} équipements du site</span>
        <span className="text-ink-3 text-xs font-light">
          {totalChecked} / {units.length} contrôlés
        </span>
      </div>

      {error && (
        <p className="text-red text-sm" style={{ padding: '4px 12px' }}>
          Erreur : {error}
        </p>
      )}

      {/* Filtre par zone */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 4px 12px' }}>
        <button
          type="button"
          className={`filter-pill${activeZoneId === 'all' ? ' on' : ''}`}
          onClick={() => setActiveZoneId('all')}
        >
          Toutes ({units.length})
        </button>
        {zones.map((z) => {
          const c = countZone(z.id)
          if (c.total === 0) return null
          return (
            <button
              key={z.id}
              type="button"
              className={`filter-pill${activeZoneId === z.id ? ' on' : ''}`}
              onClick={() => setActiveZoneId(z.id)}
            >
              {z.name} ({c.done}/{c.total})
            </button>
          )
        })}
        {orphanCount > 0 && (
          <button
            type="button"
            className={`filter-pill${activeZoneId === 'unassigned' ? ' on' : ''}`}
            onClick={() => setActiveZoneId('unassigned' as unknown as string)}
          >
            Sans zone ({orphanDone}/{orphanCount})
          </button>
        )}
      </div>

      {/* Liste des unités */}
      <div style={unitListStyle}>
        {displayedUnits.map((u) => {
          const check = checksByUnit.get(u.id)
          const verdict: CheckVerdict = check?.verdict ?? 'non_verifie'
          const zoneName = u.zone_id ? zonesById.get(u.zone_id)?.name ?? '—' : 'Sans zone'
          return (
            <button
              key={u.id}
              type="button"
              className="unit-tile"
              onClick={() => setEditingUnitId(u.id)}
              disabled={readOnly}
              style={{
                ...unitTileStyle,
                background: verdictTileBg(verdict),
                borderLeftColor: verdictColor(verdict),
              }}
            >
              <div style={unitTileNumStyle}>{u.serial_number}</div>
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={unitTileTitleStyle}>
                  {EQUIPMENT_FAMILY_LABELS[u.family]}
                  {u.subtype ? ` · ${u.subtype}` : ''}
                </div>
                <div style={unitTileMetaStyle}>
                  {zoneName}
                  {u.implantation ? ` · ${u.implantation}` : ''}
                  {u.brand ? ` · ${u.brand}` : ''}
                  {u.install_year ? ` · ${u.install_year}` : ''}
                </div>
              </div>
              <div style={unitTileVerdictStyle(verdict)}>
                {verdict === 'non_verifie' ? '—' : CHECK_VERDICT_LABELS[verdict]}
              </div>
            </button>
          )
        })}
      </div>

      {editingUnit && (
        <UnitCheckModal
          unit={editingUnit}
          template={templateCache.get(editingUnit.family) ?? null}
          existing={checksByUnit.get(editingUnit.id) ?? null}
          onClose={() => setEditingUnitId(null)}
          onSave={handleSaveCheck}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}

// ─── Modal de contrôle d'une unité ─────────────────────────

type ModalProps = {
  unit: EquipmentUnit
  template: FamilyTemplate | null
  existing: EquipmentCheck | null
  onClose: () => void
  onSave: (patch: {
    checklist: Record<string, CheckItemValue>
    observation: string | null
    verdict: CheckVerdict
  }) => Promise<void> | void
  readOnly?: boolean
}

function UnitCheckModal({ unit, template, existing, onClose, onSave, readOnly }: ModalProps) {
  const [checklist, setChecklist] = useState<Record<string, CheckItemValue>>(
    existing?.checklist ?? {},
  )
  const [observation, setObservation] = useState(existing?.observation ?? '')
  const [verdict, setVerdict] = useState<CheckVerdict>(existing?.verdict ?? 'non_verifie')
  const [saving, setSaving] = useState(false)

  function toggleItem(itemId: string, val: CheckItemValue) {
    setChecklist((prev) => {
      const next = { ...prev }
      if (next[itemId] === val) delete next[itemId]
      else next[itemId] = val
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        checklist,
        observation: observation.trim() || null,
        verdict,
      })
    } finally {
      setSaving(false)
    }
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  const items = template?.checklist ?? []
  const observationTypes = template?.observation_types ?? []
  const answered = Object.keys(checklist).length

  return (
    <div className="overlay open" onClick={handleBackdropClick}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">
            Unité n°{unit.serial_number} · {EQUIPMENT_FAMILY_LABELS[unit.family]}
            {unit.subtype ? ` · ${unit.subtype}` : ''}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem', padding: '.5rem 0' }}>
          {/* Meta unité */}
          <div style={metaBoxStyle}>
            <MetaLine k="Marque" v={unit.brand ?? '—'} />
            {unit.model && <MetaLine k="Modèle" v={unit.model} />}
            <MetaLine k="Année" v={unit.install_year?.toString() ?? '—'} />
            <MetaLine k="Implantation" v={unit.implantation ?? '—'} />
          </div>

          {/* Checklist */}
          {items.length > 0 && (
            <div>
              <div style={sectionTitleStyle}>
                <span>Checklist ({template?.reference_code ?? 'contrôle'})</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 500 }}>
                  {answered} / {items.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((item) => {
                  const val = checklist[item.id]
                  return (
                    <div key={item.id} style={checkRowStyle}>
                      <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
                        {item.label}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id, 'ok')}
                          disabled={readOnly}
                          style={{ ...btnPillStyle, ...(val === 'ok' ? btnOkOnStyle : {}) }}
                        >
                          <Check size={12} strokeWidth={3} />
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id, 'na')}
                          disabled={readOnly}
                          style={{ ...btnPillStyle, ...(val === 'na' ? btnNaOnStyle : {}) }}
                        >
                          N/A
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Observation */}
          <div>
            <div style={sectionTitleStyle}>
              <span>Observation</span>
            </div>
            {observationTypes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {observationTypes.map((obs) => (
                  <button
                    key={obs}
                    type="button"
                    className={`filter-pill${observation === obs ? ' on' : ''}`}
                    onClick={() => setObservation(obs)}
                    disabled={readOnly}
                  >
                    {obs}
                  </button>
                ))}
              </div>
            )}
            <textarea
              rows={2}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Note libre (optionnel)"
              disabled={readOnly}
              style={{ width: '100%', padding: '.6rem .8rem', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>

          {/* Verdict */}
          <div>
            <div style={sectionTitleStyle}>
              <span>Verdict</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {(['conforme', 'surveiller', 'reformer'] as const).map((v) => {
                const on = verdict === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVerdict(v)}
                    disabled={readOnly}
                    style={{
                      ...verdictBtnStyle,
                      ...(on ? verdictBtnOnStyle(v) : {}),
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {CHECK_VERDICT_LABELS[v]}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {v === 'conforme' && 'RAS'}
                      {v === 'surveiller' && '< 12 mois'}
                      {v === 'reformer' && 'Remplacement'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* TODO photos : phase suivante */}
          <div style={photoTeaser}>
            <Camera size={14} strokeWidth={1.8} />
            Ajout de photos par unité — bientôt disponible.
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="mf out" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="mf prim"
            onClick={() => void handleSave()}
            disabled={saving || readOnly || verdict === 'non_verifie'}
          >
            {saving ? 'Enregistrement…' : verdict === 'non_verifie' ? 'Choisis un verdict' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MetaLine({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12.5 }}>
      <span style={{ color: 'var(--ink2)' }}>{k}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{v}</span>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────

function verdictColor(v: CheckVerdict): string {
  switch (v) {
    case 'conforme': return '#0E7A3F'
    case 'surveiller': return '#B36510'
    case 'reformer': return '#B02A1E'
    default: return 'var(--brd, #E1E5EA)'
  }
}
function verdictTileBg(v: CheckVerdict): string {
  switch (v) {
    case 'conforme': return '#E6F4EB'
    case 'surveiller': return '#FDF3E0'
    case 'reformer': return '#FDECEC'
    default: return 'var(--wht, #F8F9FB)'
  }
}

const unitListStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 8,
  padding: '0 4px 8px',
}

const unitTileStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  border: '1px solid var(--brd, #E1E5EA)',
  borderLeftWidth: 4,
  borderRadius: 8,
  background: 'var(--bg, #fff)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'transform .1s, box-shadow .1s',
}

const unitTileNumStyle: React.CSSProperties = {
  background: 'var(--acc-lt, #E8EEF8)',
  color: 'var(--acc, #3A5CA8)',
  fontWeight: 700,
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 12.5,
  fontVariantNumeric: 'tabular-nums',
  minWidth: 32,
  textAlign: 'center',
}

const unitTileTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ink)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const unitTileMetaStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--ink2)',
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function unitTileVerdictStyle(v: CheckVerdict): React.CSSProperties {
  return {
    fontSize: 11.5,
    fontWeight: 700,
    color: verdictColor(v),
    padding: '3px 8px',
    borderRadius: 999,
    background: v === 'non_verifie' ? 'transparent' : 'rgba(255,255,255,0.7)',
    whiteSpace: 'nowrap',
  }
}

const metaBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--wht, #F8F9FB)',
  border: '1px solid var(--brd, #E1E5EA)',
  borderRadius: 8,
}

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  marginBottom: 8,
}

const checkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  border: '1px solid var(--brd2, #EEF0F4)',
  borderRadius: 6,
  background: 'var(--bg, #fff)',
}

const btnPillStyle: React.CSSProperties = {
  padding: '5px 12px',
  border: '1.5px solid var(--brd, #E1E5EA)',
  background: 'var(--bg, #fff)',
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--ink2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'inherit',
}

const btnOkOnStyle: React.CSSProperties = {
  background: '#E6F4EB',
  borderColor: '#0E7A3F',
  color: '#0E7A3F',
}

const btnNaOnStyle: React.CSSProperties = {
  background: 'var(--acc-lt, #E8EEF8)',
  borderColor: 'var(--acc, #3A5CA8)',
  color: 'var(--acc, #3A5CA8)',
}

const verdictBtnStyle: React.CSSProperties = {
  padding: '10px 8px',
  border: '1.5px solid var(--brd, #E1E5EA)',
  background: 'var(--bg, #fff)',
  borderRadius: 8,
  textAlign: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function verdictBtnOnStyle(v: CheckVerdict): React.CSSProperties {
  return {
    background: verdictTileBg(v),
    borderColor: verdictColor(v),
    color: verdictColor(v),
  }
}

const photoTeaser: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--wht, #F8F9FB)',
  border: '1px dashed var(--brd, #E1E5EA)',
  borderRadius: 8,
  fontSize: 11.5,
  color: 'var(--ink3)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

