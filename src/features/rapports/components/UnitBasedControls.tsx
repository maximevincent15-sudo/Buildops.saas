import { AlertTriangle, Camera, Check, Plus, QrCode, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import {
  createAnomaly,
  listActiveAnomaliesForUnit,
  resolveAnomaly,
} from '../../anomalies/api'
import {
  ANOMALY_ACTIONS,
  ANOMALY_ACTION_LABELS,
  ANOMALY_PRIORITIES,
  ANOMALY_PRIORITY_LABELS,
} from '../../anomalies/schemas'
import type {
  Anomaly,
  AnomalyAction,
  AnomalyPriority,
} from '../../anomalies/schemas'
import {
  deleteUnitPhoto,
  findUnitsByQrCodes,
  getFamilyTemplate,
  getSite,
  listChecksByIntervention,
  listEquipmentUnits,
  listSites,
  listZones,
  updateEquipmentUnit,
} from '../../equipment/api'
import { QuickUnitSheet } from '../../equipment/components/QuickUnitSheet'
import { QrScanner } from '../../equipment/components/QrScanner'
import { UnitPhotoField } from '../../equipment/components/UnitPhotoField'
import { attributesSummary, compareUnitsByRound, unitLocation, unitRepere, unitTypeLine } from '../../equipment/identification'
import { upsertCheckSmart } from '../../equipment/offlineQueue'
import {
  CHECK_VERDICT_LABELS,
  EQUIPMENT_FAMILY_LABELS,
} from '../../equipment/schemas'
import type {
  CheckItemValue,
  CheckPhoto,
  CheckVerdict,
  EquipmentCheck,
  EquipmentUnit,
  FamilyTemplate,
  Zone,
} from '../../equipment/schemas'
import { deleteReportPhoto, uploadReportPhoto } from '../../../shared/lib/storage'
import { matchUnitByQr, qrRawParts } from '../../../shared/lib/qr'
import { normalizeSearch } from '../../../shared/lib/search'

/** Équipements affichés d'un coup (puis « Afficher plus ») : reste fluide sur les gros sites */
const UNITS_STEP = 120

type Props = {
  interventionId: string
  siteId: string | null
  /** Client du site (intervention) : nécessaire pour ajouter des équipements */
  clientId?: string | null
  organizationId: string
  technicianId: string | null
  technicianName: string | null
  readOnly?: boolean
  onProgressChange?: (checked: number, total: number) => void
  /** Verdicts des équipements contrôlés dans cette intervention (pour la conformité du rapport) */
  onVerdictsChange?: (items: UnitVerdictItem[]) => void
}

export type UnitVerdictItem = {
  unitId: string
  /** Ex. « Extincteur N°04 » */
  label: string
  verdict: CheckVerdict
  /** Heure du contrôle (pour le suivi du temps réel) */
  checkedAt: string | null
}

// Cache des templates par famille (partagé sur cette instance)
type TemplateCache = Map<string, FamilyTemplate>

export function UnitBasedControls({
  interventionId,
  siteId,
  clientId,
  organizationId,
  technicianId,
  technicianName,
  readOnly,
  onProgressChange,
  onVerdictsChange,
}: Props) {
  const [zones, setZones] = useState<Zone[]>([])
  const [units, setUnits] = useState<EquipmentUnit[]>([])
  const [checks, setChecks] = useState<EquipmentCheck[]>([])
  const [templateCache, setTemplateCache] = useState<TemplateCache>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeZoneId, setActiveZoneId] = useState<string | 'all'>('all')
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)

  // Gros sites : recherche, « reste à contrôler », affichage par tranches
  const [search, setSearch] = useState('')
  const [onlyRemaining, setOnlyRemaining] = useState(false)
  const [limit, setLimit] = useState(UNITS_STEP)

  // Scan des étiquettes QR
  const [scanOpen, setScanOpen] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [fromScan, setFromScan] = useState(false)
  const [chainScan, setChainScan] = useState(true)
  // Inventaire au scan : fiche d'ajout ouverte (qr = contenu de l'étiquette, null sans étiquette)
  const [addDraft, setAddDraft] = useState<{ qr: string | null } | null>(null)
  const [lastCreated, setLastCreated] = useState<EquipmentUnit | null>(null)
  const [siteClientId, setSiteClientId] = useState<string | null>(null)

  async function load() {
    if (!siteId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [z, u, c, site] = await Promise.all([
        listZones(siteId),
        listEquipmentUnits({ siteId }),
        listChecksByIntervention(interventionId),
        clientId ? Promise.resolve(null) : getSite(siteId).catch(() => null),
      ])
      setSiteClientId(site?.client_id ?? null)
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

  // Notifier les verdicts au parent (mêmes unités que le registre du PDF :
  // celles du site qui ont un contrôle dans cette intervention)
  useEffect(() => {
    if (!onVerdictsChange) return
    const unitsById = new Map(units.map((u) => [u.id, u]))
    const items: UnitVerdictItem[] = []
    for (const c of checks) {
      const u = unitsById.get(c.equipment_unit_id)
      if (!u) continue
      items.push({
        unitId: u.id,
        label: `${EQUIPMENT_FAMILY_LABELS[u.family]} N°${u.serial_number}`,
        verdict: c.verdict,
        checkedAt: c.checked_at ?? null,
      })
    }
    onVerdictsChange(items)
  }, [checks, units, onVerdictsChange])

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

  // Unités affichées : zone active, recherche, « reste à contrôler »
  const displayedUnits = useMemo(() => {
    const q = normalizeSearch(search)
    return units.filter((u) => {
      if (activeZoneId === 'unassigned' ? !!u.zone_id : activeZoneId !== 'all' && u.zone_id !== activeZoneId) return false
      if (onlyRemaining) {
        const c = checksByUnit.get(u.id)
        if (c && c.verdict !== 'non_verifie') return false
      }
      if (q) {
        const hay = normalizeSearch([
          u.serial_number, unitRepere(u), u.subtype ?? '', u.implantation ?? '', u.brand ?? '', u.model ?? '', u.qr_code ?? '',
          u.zone_id ? zonesById.get(u.zone_id)?.name ?? '' : '',
          attributesSummary(u.family, u.attributes),
        ].join(' '))
        if (!hay.includes(q)) return false
      }
      return true
    }).sort(compareUnitsByRound(zonesById))
  }, [units, activeZoneId, onlyRemaining, search, checksByUnit, zonesById])

  /** Équipement ajouté depuis la fiche courte : contrôle tout de suite, ou étiquette suivante */
  async function handleCreated(unit: EquipmentUnit, then: 'check' | 'next') {
    const scanned = addDraft?.qr != null
    setAddDraft(null)
    setUnits((prev) => [...prev, unit])
    setLastCreated(unit)
    setScanMessage({ tone: 'ok', text: `${unitRepere(unit)} (${EQUIPMENT_FAMILY_LABELS[unit.family]}) ajouté au site` })
    if (!templateCache.has(unit.family)) {
      const t = await getFamilyTemplate(unit.family).catch(() => null)
      if (t) setTemplateCache((prev) => new Map(prev).set(t.family, t))
    }
    if (then === 'check') {
      setFromScan(scanned)
      setEditingUnitId(unit.id)
    } else if (scanned && chainScan) {
      setScanOpen(true)
    }
  }

  /** Résultat d'un scan : ouvre le contrôle de l'équipement, ou propose de le créer */
  async function handleScan(text: string) {
    setScanOpen(false)
    const found = matchUnitByQr(units, text)
    if (found) {
      setFromScan(true)
      const where = unitLocation(found, found.zone_id ? zonesById.get(found.zone_id) : null)
      setScanMessage({ tone: 'ok', text: `${unitRepere(found)} trouvé${where ? ` · ${where}` : ''}` })
      setEditingUnitId(found.id)
      return
    }
    setFromScan(false)
    try {
      const elsewhere = await findUnitsByQrCodes(qrRawParts(text))
      const other = elsewhere.find((u) => u.site_id !== siteId)
      if (other) {
        const site = (await listSites(other.client_id).catch(() => [])).find((x) => x.id === other.site_id)
        setScanMessage({ tone: 'warn', text: `Ce QR code appartient à ${unitRepere(other)} (${EQUIPMENT_FAMILY_LABELS[other.family]})${site ? ` du site « ${site.name} »` : " d'un autre site"}, pas à ce site.` })
        return
      }
    } catch {
      // recherche impossible (réseau) : on propose quand même la création
    }
    setScanMessage({ tone: 'warn', text: 'Nouvelle étiquette : vérifie la fiche pour ajouter cet équipement au site.' })
    setAddDraft({ qr: text.trim() })
  }

  const editingUnit = useMemo(
    () => (editingUnitId ? units.find((u) => u.id === editingUnitId) ?? null : null),
    [units, editingUnitId],
  )

  async function handleSaveCheck(patch: {
    checklist: Record<string, CheckItemValue>
    observation: string | null
    verdict: CheckVerdict
    photos: CheckPhoto[]
  }) {
    if (!editingUnit) return
    try {
      const template = templateCache.get(editingUnit.family) ?? null
      const saved = await upsertCheckSmart(
        {
          intervention_id: interventionId,
          equipment_unit_id: editingUnit.id,
          family_template_id: template?.id ?? null,
          checklist: patch.checklist,
          observation: patch.observation,
          verdict: patch.verdict,
          photos: patch.photos,
        },
        organizationId,
        { technicianId, technicianName },
      )
      setChecks((prev) => {
        const filtered = prev.filter((c) => c.equipment_unit_id !== saved.equipment_unit_id)
        return [...filtered, saved]
      })
      setEditingUnitId(null)
      // Tournée au scanner : on rouvre la caméra pour l'équipement suivant
      if (fromScan && chainScan) setScanOpen(true)
      setFromScan(false)
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

  // Site sans parc : rien à afficher en lecture seule (rapport clos → ancien flow)
  if (units.length === 0 && readOnly) return null

  const effectiveClientId = clientId ?? siteClientId ?? units[0]?.client_id ?? null
  // Fiche pré-remplie avec le dernier appareil ajouté (ou le plus récent du site)
  const previousUnit = lastCreated
    ?? (units.length > 0 ? units.reduce((a, b) => (b.created_at > a.created_at ? b : a)) : null)

  function openManualAdd() {
    setScanMessage(null)
    setFromScan(false)
    setAddDraft({ qr: null })
  }

  const overlays = (
    <>
      {scanOpen && (
        <QrScanner
          onClose={() => { setScanOpen(false); setFromScan(false) }}
          onResult={(text) => { void handleScan(text) }}
        />
      )}

      {addDraft && effectiveClientId && (
        <QuickUnitSheet
          siteId={siteId}
          clientId={effectiveClientId}
          organizationId={organizationId}
          zones={zones}
          siteUnits={units}
          qrCode={addDraft.qr}
          previous={previousUnit}
          onZoneCreated={(z) => setZones((prev) => [...prev, z])}
          onCreated={(unit, then) => { void handleCreated(unit, then) }}
          onClose={() => { setAddDraft(null); setFromScan(false) }}
        />
      )}

      {editingUnit && (
        <UnitCheckModal
          unit={editingUnit}
          template={templateCache.get(editingUnit.family) ?? null}
          existing={checksByUnit.get(editingUnit.id) ?? null}
          onClose={() => setEditingUnitId(null)}
          onSave={handleSaveCheck}
          readOnly={readOnly}
          organizationId={organizationId}
          interventionId={interventionId}
          technicianName={technicianName}
          zone={editingUnit.zone_id ? zonesById.get(editingUnit.zone_id) ?? null : null}
          onUnitChange={(u) => setUnits((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
        />
      )}
    </>
  )

  const scanMessageBox = scanMessage && (
    <div style={{
      margin: '0 4px 10px', padding: '9px 12px', borderRadius: 10, fontSize: '.85rem',
      background: scanMessage.tone === 'ok' ? '#E6F4EB' : '#FDF1E7',
      color: scanMessage.tone === 'ok' ? '#0E7A3F' : '#8A3D0E',
      border: `1px solid ${scanMessage.tone === 'ok' ? '#B7DFC7' : '#F0C9A6'}`,
    }}>
      {scanMessage.text}
    </div>
  )

  if (units.length === 0) {
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Inventaire au scan</span>
        </div>
        <p className="text-ink-2 text-sm font-light" style={{ padding: '0 4px 12px', lineHeight: 1.5 }}>
          Ce site n'a pas encore d'équipements enregistrés. Scanne l'étiquette de chaque appareil :
          il est ajouté au parc du site, puis tu fais son contrôle. À la prochaine visite, un scan suffira pour le retrouver.
        </p>
        {error && (
          <p className="text-red text-sm" style={{ padding: '4px 12px' }}>
            Erreur : {error}
          </p>
        )}
        {!effectiveClientId && (
          <p className="text-red text-sm" style={{ padding: '4px 12px' }}>
            Ce site n'est rattaché à aucun client : impossible d'y ajouter des équipements.
          </p>
        )}
        {scanMessageBox}
        <button
          type="button"
          className="btn-sm acc"
          onClick={() => { setScanMessage(null); setScanOpen(true) }}
          disabled={!effectiveClientId}
          style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 16px', fontSize: '1rem', margin: '4px 0 8px' }}
        >
          <QrCode size={18} strokeWidth={2} /> Scanner la 1re étiquette
        </button>
        <button
          type="button"
          className="mf out"
          onClick={openManualAdd}
          disabled={!effectiveClientId}
          style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} strokeWidth={2} /> Ajouter sans étiquette
        </button>
        <p className="text-ink-3 text-xs font-light" style={{ padding: '10px 4px 0', textAlign: 'center' }}>
          Tu peux aussi remplir la checklist globale ci-dessous, sans faire l'inventaire.
        </p>
        {overlays}
      </div>
    )
  }

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

      {/* Scan des étiquettes + recherche (gros sites) */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, margin: '4px 0 10px' }}>
          <button
            type="button"
            className="btn-sm acc"
            onClick={() => { setScanMessage(null); setScanOpen(true) }}
            style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 16px', fontSize: '1rem' }}
          >
            <QrCode size={18} strokeWidth={2} /> Scanner une étiquette
          </button>
          {effectiveClientId && (
            <button
              type="button"
              className="mf out"
              onClick={openManualAdd}
              title="Ajouter un équipement sans étiquette"
              aria-label="Ajouter un équipement sans étiquette"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <Plus size={15} strokeWidth={2} /> Ajouter
            </button>
          )}
        </div>
      )}
      {scanMessageBox}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '0 4px 10px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} strokeWidth={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }} />
          <input
            className="input-sm"
            type="search"
            placeholder="Repère, emplacement, marque, QR…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimit(UNITS_STEP) }}
            style={{ paddingLeft: 30, width: '100%', display: 'block' }}
          />
        </div>
        <button
          type="button"
          className={`filter-pill${onlyRemaining ? ' on' : ''}`}
          onClick={() => { setOnlyRemaining((v) => !v); setLimit(UNITS_STEP) }}
        >
          Reste à contrôler ({Math.max(0, units.length - totalChecked)})
        </button>
        {!readOnly && (
          <label className="text-xs text-ink-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={chainScan} onChange={(e) => setChainScan(e.target.checked)} />
            Enchaîner les scans
          </label>
        )}
      </div>

      {/* Filtre par zone */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 4px 12px' }}>
        <button
          type="button"
          className={`filter-pill${activeZoneId === 'all' ? ' on' : ''}`}
          onClick={() => { setActiveZoneId('all'); setLimit(UNITS_STEP) }}
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
              onClick={() => { setActiveZoneId(z.id); setLimit(UNITS_STEP) }}
            >
              {z.name} ({c.done}/{c.total})
            </button>
          )
        })}
        {orphanCount > 0 && (
          <button
            type="button"
            className={`filter-pill${activeZoneId === 'unassigned' ? ' on' : ''}`}
            onClick={() => { setActiveZoneId('unassigned'); setLimit(UNITS_STEP) }}
          >
            Sans zone ({orphanDone}/{orphanCount})
          </button>
        )}
      </div>

      {/* Liste des unités */}
      <div style={unitListStyle}>
        {displayedUnits.slice(0, limit).map((u) => {
          const check = checksByUnit.get(u.id)
          const verdict: CheckVerdict = check?.verdict ?? 'non_verifie'
          const where = unitLocation(u, u.zone_id ? zonesById.get(u.zone_id) : null)
          const details = [
            EQUIPMENT_FAMILY_LABELS[u.family],
            unitTypeLine(u),
            u.brand,
            u.install_year,
          ].filter(Boolean).join(' · ')
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
              {u.photo_url && (
                <img src={u.photo_url} alt="" loading="lazy" style={unitTileThumbStyle} />
              )}
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={unitTileTitleStyle}>
                  <span style={unitTileNumStyle}>{unitRepere(u)}</span>
                  {where || <span style={{ color: 'var(--ink3)', fontWeight: 400, fontStyle: 'italic' }}>Emplacement non renseigné</span>}
                </div>
                <div style={unitTileMetaStyle}>{details}</div>
              </div>
              <div style={unitTileVerdictStyle(verdict)}>
                {verdict === 'non_verifie' ? '—' : CHECK_VERDICT_LABELS[verdict]}
              </div>
            </button>
          )
        })}
      </div>

      {displayedUnits.length === 0 && (
        <p className="text-ink-3 text-sm font-light" style={{ textAlign: 'center', padding: '14px 8px' }}>
          Aucun équipement ne correspond{onlyRemaining ? ' : tout est contrôlé ici' : ''}.
        </p>
      )}
      {displayedUnits.length > limit && (
        <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
          <button type="button" className="mf out" onClick={() => setLimit((n) => n + UNITS_STEP)}>
            Afficher plus ({displayedUnits.length - limit} restants)
          </button>
        </div>
      )}

      {overlays}
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
    photos: CheckPhoto[]
  }) => Promise<void> | void
  readOnly?: boolean
  organizationId: string
  interventionId: string
  technicianName?: string | null
  zone: Zone | null
  /** Photo de repérage ajoutée ou changée pendant le contrôle */
  onUnitChange: (unit: EquipmentUnit) => void
}

function UnitCheckModal({
  unit, template, existing, onClose, onSave, readOnly,
  organizationId, interventionId, technicianName, zone, onUnitChange,
}: ModalProps) {
  const [photoError, setPhotoError] = useState<string | null>(null)

  /** Photo de repérage enregistrée tout de suite sur l'équipement */
  async function handleUnitPhoto(p: { path: string; url: string } | null) {
    setPhotoError(null)
    try {
      const updated = await updateEquipmentUnit(unit.id, { photo_path: p?.path ?? null, photo_url: p?.url ?? null })
      if (unit.photo_path && unit.photo_path !== p?.path) void deleteUnitPhoto(unit.photo_path)
      onUnitChange(updated)
    } catch (e) {
      if (p) void deleteUnitPhoto(p.path)
      setPhotoError(e instanceof Error ? e.message : 'Photo non enregistrée. Vérifie ta connexion.')
    }
  }

  const [checklist, setChecklist] = useState<Record<string, CheckItemValue>>(
    existing?.checklist ?? {},
  )
  const [observation, setObservation] = useState(existing?.observation ?? '')
  const [verdict, setVerdict] = useState<CheckVerdict>(existing?.verdict ?? 'non_verifie')
  const [photos, setPhotos] = useState<CheckPhoto[]>(existing?.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Anomalies (Slice M3) ─────────────────────────────────
  // Historique d'anomalies actives sur cette unité (Ouverte / Planifiée)
  const [existingAnomalies, setExistingAnomalies] = useState<Anomaly[]>([])
  // Mini-formulaire d'anomalie affiché quand le verdict n'est pas conforme
  const [anomalyTitle, setAnomalyTitle] = useState('')
  const [anomalyAction, setAnomalyAction] = useState<AnomalyAction | ''>('')
  const [anomalyPriority, setAnomalyPriority] = useState<AnomalyPriority>('normal')
  const [anomalyDueDate, setAnomalyDueDate] = useState('')

  // Chargement des anomalies déjà ouvertes sur cette unité
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listActiveAnomaliesForUnit(unit.id)
        if (!cancelled) setExistingAnomalies(list)
      } catch {
        if (!cancelled) setExistingAnomalies([])
      }
    })()
    return () => { cancelled = true }
  }, [unit.id])

  // Défaut priorité selon verdict
  useEffect(() => {
    if (verdict === 'reformer') setAnomalyPriority('high')
    else if (verdict === 'surveiller') setAnomalyPriority('normal')
  }, [verdict])

  const needsAnomalyForm = verdict === 'surveiller' || verdict === 'reformer'
  const anomalyFormValid = !needsAnomalyForm
    || (anomalyTitle.trim().length >= 3 && anomalyAction !== '')

  // Slice M5 : quand le verdict est "conforme" ET qu'il y a des anomalies actives,
  // on propose de les résoudre automatiquement à l'enregistrement.
  const canResolveExisting =
    verdict === 'conforme' && existingAnomalies.length > 0
  const [resolveExistingOnSave, setResolveExistingOnSave] = useState(true)

  function toggleItem(itemId: string, val: CheckItemValue) {
    setChecklist((prev) => {
      const next = { ...prev }
      if (next[itemId] === val) delete next[itemId]
      else next[itemId] = val
      return next
    })
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)
    try {
      const uploaded: CheckPhoto[] = []
      for (const file of Array.from(files)) {
        const p = await uploadReportPhoto(file, organizationId, interventionId)
        uploaded.push(p)
      }
      setPhotos((prev) => [...prev, ...uploaded])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erreur upload photo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removePhoto(photo: CheckPhoto) {
    // Optimiste : retire tout de suite de l'UI, puis nettoie storage
    setPhotos((prev) => prev.filter((p) => p.path !== photo.path))
    try {
      await deleteReportPhoto(photo.path)
    } catch {
      // silent — orpheline pas critique
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        checklist,
        observation: observation.trim() || null,
        verdict,
        photos,
      })
      // Si le verdict signale une anomalie (surveiller/reformer),
      // on crée l'entité `anomalies` liée à l'unité + intervention.
      if (needsAnomalyForm && anomalyTitle.trim().length >= 3 && anomalyAction !== '') {
        try {
          await createAnomaly(
            {
              equipment_unit_id: unit.id,
              intervention_id: interventionId,
              equipment_check_id: null,
              title: anomalyTitle.trim(),
              description: observation.trim() || undefined,
              action: anomalyAction,
              priority: anomalyPriority,
              due_date: anomalyDueDate || null,
              photos,
              detected_by_name: technicianName ?? undefined,
            },
            organizationId,
            { name: technicianName ?? null },
          )
        } catch (err) {
          // Non bloquant : le check est déjà sauvegardé.
          // On log dans la console mais on ne bloque pas la fermeture.
          console.error('createAnomaly failed:', err)
        }
      }
      // Slice M5 : verdict conforme + case cochée + anomalies existantes actives
      //   → on les résout automatiquement.
      if (canResolveExisting && resolveExistingOnSave && existingAnomalies.length > 0) {
        const note = `Résolue automatiquement lors de l'intervention ${interventionId} (verdict conforme).`
        await Promise.allSettled(
          existingAnomalies.map((a) => resolveAnomaly(a.id, note)),
        )
      }
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
            {unitRepere(unit)} · {EQUIPMENT_FAMILY_LABELS[unit.family]}
            {unit.subtype ? ` · ${unit.subtype}` : ''}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem', padding: '.5rem 0' }}>
          {/* Où est l'appareil : emplacement en gros + photo de repérage */}
          <div style={locationBoxStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
              Emplacement
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35, margin: '2px 0 10px' }}>
              {unitLocation(unit, zone) || <span style={{ color: 'var(--ink3)', fontWeight: 400, fontStyle: 'italic' }}>Non renseigné</span>}
            </div>
            <UnitPhotoField
              organizationId={organizationId}
              value={unit.photo_path && unit.photo_url ? { path: unit.photo_path, url: unit.photo_url } : null}
              onChange={(p) => { void handleUnitPhoto(p) }}
              readOnly={readOnly}
              variant="large"
            />
            {photoError && <span className="ferr on">{photoError}</span>}
          </div>

          {/* Meta unité */}
          <div style={metaBoxStyle}>
            <MetaLine k="Marque" v={unit.brand ?? '—'} />
            {unit.model && <MetaLine k="Modèle" v={unit.model} />}
            <MetaLine k="Année" v={unit.install_year?.toString() ?? '—'} />
            {attributesSummary(unit.family, unit.attributes) && (
              <MetaLine k="Caractéristiques" v={attributesSummary(unit.family, unit.attributes)} />
            )}
          </div>

          {/* Anomalies déjà ouvertes sur cette unité (Slice M3 + M5) */}
          {existingAnomalies.length > 0 && (
            <div style={existingAnomaliesBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={14} strokeWidth={2.2} color="#B36510" />
                <span style={{ fontWeight: 700, color: '#B36510', fontSize: 12.5 }}>
                  {existingAnomalies.length} anomalie{existingAnomalies.length > 1 ? 's' : ''}{' '}
                  déjà ouverte{existingAnomalies.length > 1 ? 's' : ''} sur cette unité
                </span>
              </div>
              {existingAnomalies.slice(0, 3).map((a) => (
                <div key={a.id} style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                  • {a.title}
                  {a.action ? ` — ${ANOMALY_ACTION_LABELS[a.action]}` : ''}
                  {a.due_date ? ` · échéance ${a.due_date}` : ''}
                </div>
              ))}
              {existingAnomalies.length > 3 && (
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  + {existingAnomalies.length - 3} autre{existingAnomalies.length - 3 > 1 ? 's' : ''}
                </div>
              )}

              {/* Slice M5 — reprise auto quand verdict = conforme */}
              {canResolveExisting && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    padding: '8px 10px',
                    background: 'white',
                    border: '1px solid #E6E8EC',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--ink)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={resolveExistingOnSave}
                    onChange={(e) => setResolveExistingOnSave(e.target.checked)}
                  />
                  <span>
                    Marquer ces {existingAnomalies.length} anomalie{existingAnomalies.length > 1 ? 's' : ''}{' '}
                    comme <strong>résolue{existingAnomalies.length > 1 ? 's' : ''}</strong> (verdict conforme)
                  </span>
                </label>
              )}
            </div>
          )}

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

          {/* Détails de l'anomalie (obligatoire si verdict ≠ conforme) — Slice M3 */}
          {needsAnomalyForm && (
            <div style={anomalyFormBoxStyle}>
              <div style={{ ...sectionTitleStyle, color: '#B02A1E' }}>
                <span>⚠ Détails de l'anomalie</span>
                <span style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 500, textTransform: 'none' }}>
                  * champs obligatoires
                </span>
              </div>

              {/* Résumé */}
              <div style={{ marginBottom: 10 }}>
                <label style={anomalyLabelStyle}>Résumé de l'anomalie *</label>
                <input
                  type="text"
                  value={anomalyTitle}
                  onChange={(e) => setAnomalyTitle(e.target.value)}
                  placeholder="Ex : Manomètre proche zone rouge"
                  disabled={readOnly}
                  style={{ width: '100%', padding: '.55rem .8rem', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>

              {/* Action recommandée */}
              <div style={{ marginBottom: 10 }}>
                <label style={anomalyLabelStyle}>Action recommandée *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ANOMALY_ACTIONS.map((act) => (
                    <button
                      key={act}
                      type="button"
                      className={`filter-pill${anomalyAction === act ? ' on' : ''}`}
                      onClick={() => setAnomalyAction(act)}
                      disabled={readOnly}
                    >
                      {ANOMALY_ACTION_LABELS[act]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priorité */}
              <div style={{ marginBottom: 10 }}>
                <label style={anomalyLabelStyle}>Priorité</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  {ANOMALY_PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`filter-pill${anomalyPriority === p ? ' on' : ''}`}
                      onClick={() => setAnomalyPriority(p)}
                      disabled={readOnly}
                    >
                      {ANOMALY_PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Échéance */}
              <div>
                <label style={anomalyLabelStyle}>Échéance (optionnel)</label>
                <input
                  type="date"
                  value={anomalyDueDate}
                  onChange={(e) => setAnomalyDueDate(e.target.value)}
                  disabled={readOnly}
                  style={{ padding: '.5rem .7rem', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.5 }}>
                Cette anomalie sera enregistrée dans Firovia et suivie jusqu'à sa résolution.
                Elle apparaîtra automatiquement à la prochaine intervention sur cette unité.
              </div>
            </div>
          )}

          {/* Photos horodatées */}
          <div>
            <div style={sectionTitleStyle}>
              <span>Photos ({photos.length})</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>
                Preuves horodatées
              </span>
            </div>
            {photos.length > 0 && (
              <div style={photoGridStyle}>
                {photos.map((p) => (
                  <div key={p.path} style={photoThumbStyle}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <img
                        src={p.url}
                        alt=""
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                      />
                    </a>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => void removePhoto(p)}
                        style={photoRemoveStyle}
                        aria-label="Retirer la photo"
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={photoAddBtnStyle}
                >
                  <Camera size={14} strokeWidth={1.8} />
                  {uploading ? 'Envoi…' : photos.length === 0 ? 'Ajouter une photo' : '+ Ajouter'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => void handleFileChange(e)}
                />
                {uploadError && (
                  <div style={{ fontSize: 11.5, color: 'var(--red, #A83A3A)', marginTop: 4 }}>
                    ⚠ {uploadError}
                  </div>
                )}
              </>
            )}
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
            disabled={saving || readOnly || verdict === 'non_verifie' || !anomalyFormValid}
          >
            {saving
              ? 'Enregistrement…'
              : verdict === 'non_verifie'
                ? 'Choisis un verdict'
                : !anomalyFormValid
                  ? 'Complète les détails d\'anomalie'
                  : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MetaLine({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', fontSize: 12.5 }}>
      <span style={{ color: 'var(--ink2)', flexShrink: 0 }}>{k}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{v}</span>
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
  display: 'inline-block',
  background: 'var(--acc-lt, #E8EEF8)',
  color: 'var(--acc, #3A5CA8)',
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: 6,
  fontSize: 12,
  fontVariantNumeric: 'tabular-nums',
  marginRight: 8,
  verticalAlign: 'baseline',
}

const unitTileThumbStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  objectFit: 'cover',
  borderRadius: 6,
  flexShrink: 0,
  border: '1px solid var(--brd, #E1E5EA)',
}

const unitTileTitleStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--ink)',
  lineHeight: 1.35,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const locationBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  background: 'var(--acc-lt, #E8EEF8)',
  border: '1px solid rgba(58, 92, 168, .18)',
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

const photoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
  gap: 6,
  marginBottom: 8,
}

const photoThumbStyle: React.CSSProperties = {
  position: 'relative',
  aspectRatio: '1',
  borderRadius: 6,
  overflow: 'hidden',
  border: '1px solid var(--brd, #E1E5EA)',
}

const photoRemoveStyle: React.CSSProperties = {
  position: 'absolute',
  top: 3,
  right: 3,
  width: 20,
  height: 20,
  background: 'rgba(0, 0, 0, 0.6)',
  color: 'white',
  border: 0,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const photoAddBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--wht, #F8F9FB)',
  border: '1.5px dashed var(--brd, #E1E5EA)',
  borderRadius: 8,
  fontSize: 12.5,
  color: 'var(--ink2, #5A6070)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'inherit',
  fontWeight: 500,
}

// ─── Slice M3 — Styles anomalies ─────────────────────────

const existingAnomaliesBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: '#FDF3E0',
  border: '1px solid #F0D9A6',
  borderRadius: 8,
}

const anomalyFormBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  background: '#FDECEC',
  border: '1px solid #F0BFBF',
  borderRadius: 8,
}

const anomalyLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--ink2, #5A6070)',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

