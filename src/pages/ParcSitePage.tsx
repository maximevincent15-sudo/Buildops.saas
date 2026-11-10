import { ArrowLeft, ClipboardPaste, Plus, Trash2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent, MouseEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { listClients } from '../features/clients/api'
import type { Client } from '../features/clients/schemas'
import {
  batchCreateEquipmentUnits,
  createZone,
  listEquipmentUnits,
  listSites,
  listZones,
  updateEquipmentUnit,
} from '../features/equipment/api'
import { unitRepere } from '../features/equipment/identification'
import {
  PARC_FIELDS,
  PARC_FIELD_LABELS,
  IMPORT_KEY_TO_PARC,
  changeCount,
  cleanSerial,
  compareRows,
  computeChanges,
  emptyRow,
  findZone,
  guessColumns,
  isBlankRow,
  isEditable,
  mergePastedRecords,
  parseClipboardTable,
  parseYearLoose,
  pasteBlock,
  recordsFromTable,
  rowFamily,
  rowFromUnit,
  serialSlot,
  validateRows,
} from '../features/equipment/parc'
import type { ColumnMapping, ParcField, ParcRow } from '../features/equipment/parc'
import { EQUIPMENT_FAMILIES, EQUIPMENT_FAMILY_LABELS } from '../features/equipment/schemas'
import type { CreateEquipmentUnitInput, EquipmentFamily, EquipmentUnit, Site, Zone } from '../features/equipment/schemas'
import { equipmentsImportDefinition } from '../features/imports/definitions/equipmentsImport'
import { buildHeaderMap } from '../features/imports/parsers'

/** Intitulés reconnus dans la 1re ligne d'un tableau collé (les mêmes que l'import Excel) */
const HEADER_FIELDS = equipmentsImportDefinition.fields.filter((f) => f.key in IMPORT_KEY_TO_PARC)

/** Classes écrites en toutes lettres : la feuille de style ne garde que celles qu'elle trouve dans le code */
const TH_CLASS: Record<ParcField, string> = {
  serial: 'parc-th-serial', family: 'parc-th-family', subtype: 'parc-th-subtype', zone: 'parc-th-zone',
  implantation: 'parc-th-implantation', brand: 'parc-th-brand', year: 'parc-th-year',
}
const TD_CLASS: Record<ParcField, string> = {
  serial: 'parc-td-serial', family: 'parc-td-family', subtype: 'parc-td-subtype', zone: 'parc-td-zone',
  implantation: 'parc-td-implantation', brand: 'parc-td-brand', year: 'parc-td-year',
}

/** Lignes vides proposées pour un site sans appareil */
const START_ROWS = 5
/** Lignes ajoutées par « Ajouter des lignes » */
const ADD_ROWS = 10
/** Enregistrements lancés en même temps */
const WAVE = 6

/** `fix` : message « lignes à corriger », retiré dès qu'il n'y a plus rien à corriger */
type Notice = { tone: 'ok' | 'warn' | 'err'; text: string; fix?: boolean }

type ParcData = { units: EquipmentUnit[]; zones: Zone[] }

/** Parc d'un site, appareils retirés compris (leurs N° restent pris) */
async function fetchParc(siteId: string): Promise<ParcData> {
  const [units, zones] = await Promise.all([listEquipmentUnits({ siteId, includeRemoved: true }), listZones(siteId)])
  return { units, zones }
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

/**
 * Parc du site : le parc d'un site en tableau, à remplir au bureau avant la
 * première visite. Zone et emplacement des appareils déjà créés, lignes
 * nouvelles, et reprise d'un tableau copié dans un ancien rapport.
 */
export function ParcSitePage() {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const siteId = searchParams.get('site') ?? ''

  const [sites, setSites] = useState<Site[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [rows, setRows] = useState<ParcRow[]>([])
  const [original, setOriginal] = useState<Map<string, ParcRow>>(new Map())
  const [reserved, setReserved] = useState<Set<string>>(new Set())
  // Site dont le parc est chargé : tant qu'il diffère du site choisi, on charge
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkZone, setBulkZone] = useState('')
  const [familyFilter, setFamilyFilter] = useState<'all' | EquipmentFamily>('all')
  // « À compléter » : lignes sans zone ou sans emplacement au moment où l'on coche
  const [incompleteKeys, setIncompleteKeys] = useState<Set<string> | null>(null)
  const lastClicked = useRef<number | null>(null)
  const pendingFocus = useRef<{ index: number; field: ParcField } | null>(null)
  // Lignes affichées, lues par les gestionnaires d'événements (qui restent ainsi stables)
  const visibleRef = useRef<ParcRow[]>([])

  useEffect(() => {
    Promise.all([listSites(), listClients()])
      .then(([s, c]) => { setSites(s); setClients(c) })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Erreur inconnue'))
  }, [])

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const site = sites.find((s) => s.id === siteId) ?? null
  const sortedSites = useMemo(
    () => [...sites].sort((a, b) =>
      (clientsById.get(a.client_id)?.name ?? '').localeCompare(clientsById.get(b.client_id)?.name ?? '', 'fr')
      || a.name.localeCompare(b.name, 'fr')),
    [sites, clientsById],
  )

  /** Place le parc lu dans le tableau ; `keep` : lignes gardées telles quelles (enregistrement en échec) */
  const applyParc = useCallback((id: string, data: ParcData, keep: ParcRow[] = []) => {
    const { units, zones: z } = data
    const zonesById = new Map(z.map((x) => [x.id, x]))
    const active = units.filter((u) => u.status !== 'removed')
    const fresh = active.map((u) => rowFromUnit(u, zonesById)).sort(compareRows)
    const keepByKey = new Map(keep.map((r) => [r.key, r]))
    const merged = fresh.map((r) => keepByKey.get(r.key) ?? r)
    const keptNew = keep.filter((r) => r.unitId === null)
    setLoadError(null)
    setZones(z)
    setOriginal(new Map(fresh.map((r) => [r.key, r])))
    setReserved(new Set(units.filter((u) => u.status === 'removed').map((u) => serialSlot(u.family, u.serial_number))))
    const lastFam = fresh.length > 0 ? fresh[fresh.length - 1]!.family : ''
    setRows(merged.length + keptNew.length > 0
      ? [...merged, ...keptNew]
      : Array.from({ length: START_ROWS }, () => emptyRow(lastFam)))
    setSelected(new Set())
    setIncompleteKeys(null)
    setLoadedFor(id)
  }, [])

  const loadSite = useCallback(async (id: string, keep: ParcRow[] = []) => {
    try {
      applyParc(id, await fetchParc(id), keep)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur inconnue')
      setLoadedFor(id)
    }
  }, [applyParc])

  useEffect(() => {
    if (!siteId) return
    let alive = true
    fetchParc(siteId)
      .then((data) => { if (alive) applyParc(siteId, data) })
      .catch((e) => {
        if (!alive) return
        setLoadError(e instanceof Error ? e.message : 'Erreur inconnue')
        setLoadedFor(siteId)
      })
    return () => { alive = false }
  }, [siteId, applyParc])

  const loading = !!siteId && loadedFor !== siteId


  const errors = useMemo(() => validateRows(rows, reserved), [rows, reserved])
  const changes = useMemo(() => computeChanges(rows, original, zones), [rows, original, zones])
  const dirty = changeCount(changes) > 0

  // Fermer l'onglet ou recharger avec des modifications non enregistrées
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const confirmLeave = () =>
    !dirty || window.confirm('Quitter sans enregistrer ?\n\nLes modifications du tableau seront perdues.')

  const families = useMemo(() => EQUIPMENT_FAMILIES.filter((f) => rows.some((r) => rowFamily(r) === f)), [rows])

  const visibleRows = useMemo(() => rows.filter((r) => {
    if (familyFilter !== 'all' && r.unitId !== null && r.family !== familyFilter) return false
    if (incompleteKeys && r.unitId !== null && !incompleteKeys.has(r.key)) return false
    return true
  }), [rows, familyFilter, incompleteKeys])

  const zoneNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const z of zones) names.set(z.name.trim().toLowerCase(), z.name)
    for (const r of rows) if (r.zone.trim()) names.set(r.zone.trim().toLowerCase(), r.zone.trim())
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  }, [zones, rows])

  const lastFamily = useCallback((list: ParcRow[]) => [...list].reverse().find((r) => r.family)?.family ?? '', [])

  // Curseur placé après l'ajout d'une ligne (Entrée sur la dernière ligne)
  useEffect(() => {
    visibleRef.current = visibleRows
    const f = pendingFocus.current
    if (!f) return
    pendingFocus.current = null
    focusCell(f.index, f.field)
  }, [visibleRows])

  const updateCell = useCallback((key: string, field: ParcField, value: string) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }, [])

  const onCellKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, index: number, field: ParcField) => {
    const isSelect = e.currentTarget.tagName === 'SELECT'
    let target: number | null = null
    if (e.key === 'Enter') target = e.shiftKey ? index - 1 : index + 1
    else if (!isSelect && field !== 'zone' && e.key === 'ArrowDown') target = index + 1
    else if (!isSelect && field !== 'zone' && e.key === 'ArrowUp') target = index - 1
    if (target === null) return
    e.preventDefault()
    if (target < 0) return
    if (target >= visibleRef.current.length) {
      if (e.key !== 'Enter') return
      // Entrée sur la dernière ligne : une ligne de plus, comme dans un tableur
      pendingFocus.current = { index: target, field }
      setRows((list) => [...list, emptyRow(lastFamily(list))])
      return
    }
    focusCell(target, field)
  }, [lastFamily])

  const onCellPaste = useCallback((e: ClipboardEvent<HTMLInputElement>, index: number, field: ParcField) => {
    const text = e.clipboardData.getData('text/plain')
    // Une seule valeur : collage normal dans la cellule
    if (!/[\t\n]/.test(text.replace(/\s+$/, ''))) return
    e.preventDefault()
    const block = parseClipboardTable(text)
    if (block.length === 0) return
    const visibleKeys = new Set(visibleRef.current.map((r) => r.key))
    setRows((list) => {
      const visible = list.filter((r) => visibleKeys.has(r.key))
      const pasted = pasteBlock(visible, index, field, block, PARC_FIELDS)
      const byKey = new Map(pasted.map((r) => [r.key, r]))
      const added = pasted.filter((r) => !list.some((x) => x.key === r.key))
      return [...list.map((r) => byKey.get(r.key) ?? r), ...added]
    })
    setNotice({ tone: 'ok', text: `${plural(block.length, 'ligne collée', 'lignes collées')}. Vérifiez puis enregistrez.` })
  }, [])

  const toggleRow = useCallback((key: string, index: number, shift: boolean) => {
    // Lu avant la mise à jour : le calcul de la sélection se fait plus tard
    const from = shift ? lastClicked.current : null
    setSelected((prev) => {
      const next = new Set(prev)
      const on = !prev.has(key)
      if (from !== null) {
        const [a, b] = [Math.min(from, index), Math.max(from, index)]
        for (let i = a; i <= b; i++) {
          const k = visibleRef.current[i]?.key
          if (k) { if (on) next.add(k); else next.delete(k) }
        }
      } else if (on) next.add(key)
      else next.delete(key)
      return next
    })
    lastClicked.current = index
  }, [])

  const removeRow = useCallback((key: string) => {
    setRows((list) => list.filter((r) => r.key !== key || r.unitId !== null))
    setSelected((prev) => { const n = new Set(prev); n.delete(key); return n })
  }, [])

  function applyBulkZone() {
    const name = bulkZone.trim()
    setRows((list) => list.map((r) => (selected.has(r.key) ? { ...r, zone: name } : r)))
    setNotice({ tone: 'ok', text: name
      ? `Zone « ${name} » mise sur ${plural(selected.size, 'ligne', 'lignes')}. Vérifiez puis enregistrez.`
      : `Zone retirée de ${plural(selected.size, 'ligne', 'lignes')}. Vérifiez puis enregistrez.` })
    setSelected(new Set())
    setBulkZone('')
  }

  function removeSelectedNew() {
    const removable = rows.filter((r) => selected.has(r.key) && r.unitId === null).length
    setRows((list) => list.filter((r) => !(selected.has(r.key) && r.unitId === null)))
    setSelected(new Set())
    setNotice({ tone: 'ok', text: `${plural(removable, 'ligne nouvelle retirée', 'lignes nouvelles retirées')}. Les appareils déjà enregistrés se retirent depuis leur fiche.` })
  }

  function addRows() {
    pendingFocus.current = { index: visibleRows.length, field: 'serial' }
    setRows((list) => [...list, ...Array.from({ length: ADD_ROWS }, () => emptyRow(lastFamily(list)))])
  }

  function changeSite(id: string) {
    if (id === siteId || !confirmLeave()) return
    setNotice(null)
    setPasteOpen(false)
    setSearchParams(id ? { site: id } : {}, { replace: false })
  }

  function cancelChanges() {
    if (!window.confirm('Annuler toutes les modifications du tableau ?')) return
    void loadSite(siteId)
    setNotice(null)
  }

  async function save() {
    if (!site || !profile?.organization_id || saving) return
    if (errors.size > 0) {
      setNotice({ tone: 'err', fix: true, text: `${plural(errors.size, 'ligne à corriger', 'lignes à corriger')} avant d'enregistrer (en rouge).` })
      const firstKey = rows.find((r) => errors.has(r.key))?.key
      const idx = visibleRows.findIndex((r) => r.key === firstKey)
      if (idx >= 0) focusCell(idx, 'serial')
      return
    }
    setSaving(true)
    setNotice(null)
    const orgId = profile.organization_id
    const failed: ParcRow[] = []
    let createdZones = 0
    let updated = 0
    let created = 0
    try {
      // 1) Zones nouvelles, dans l'ordre du tableau (ordre de passage)
      const allZones = [...zones]
      let order = zones.reduce((m, z) => Math.max(m, z.display_order), -1) + 1
      for (const name of changes.newZones) {
        const z = await createZone({ site_id: site.id, name, display_order: order++ }, orgId)
        allZones.push(z)
        createdZones++
      }
      const zoneIdFor = (name: string) => (name.trim() ? findZone(allZones, name)?.id ?? null : null)
      const rowByKey = new Map(rows.map((r) => [r.key, r]))

      // 2) Appareils existants
      for (const wave of chunk(changes.updates, WAVE)) {
        await Promise.all(wave.map(async (u) => {
          const patch: Record<string, unknown> = { ...u.patch }
          if (u.zoneName !== undefined) patch.zone_id = zoneIdFor(u.zoneName)
          try {
            await updateEquipmentUnit(u.unitId, patch as Partial<CreateEquipmentUnitInput>)
            updated++
          } catch {
            const r = rowByKey.get(u.key)
            if (r) failed.push(r)
          }
        }))
      }

      // 3) Lignes nouvelles
      const inputs = changes.creates.map((r) => {
        const family = rowFamily(r) as EquipmentFamily
        return {
          row: r,
          input: {
            client_id: site.client_id,
            site_id: site.id,
            zone_id: zoneIdFor(r.zone) ?? undefined,
            family,
            subtype: r.subtype.trim() || undefined,
            serial_number: cleanSerial(family, r.serial),
            implantation: r.implantation.trim() || undefined,
            brand: r.brand.trim() || undefined,
            install_year: parseYearLoose(r.year) ?? undefined,
            status: 'active',
          } satisfies CreateEquipmentUnitInput,
        }
      })
      for (const part of chunk(inputs, 200)) {
        try {
          await batchCreateEquipmentUnits(part.map((x) => x.input), orgId)
          created += part.length
        } catch {
          // Paquet refusé : une par une, pour n'écarter que la ligne fautive
          for (const x of part) {
            try {
              await batchCreateEquipmentUnits([x.input], orgId)
              created++
            } catch {
              failed.push(x.row)
            }
          }
        }
      }
    } catch (e) {
      setNotice({ tone: 'err', text: `Enregistrement interrompu : ${e instanceof Error ? e.message : 'erreur inconnue'}. Rien n'est perdu dans le tableau, réessayez.` })
      setSaving(false)
      await loadSite(site.id, rows.filter((r) => !isBlankRow(r)))
      return
    }
    setSaving(false)
    await loadSite(site.id, failed)
    const done = [
      updated > 0 ? plural(updated, 'appareil mis à jour', 'appareils mis à jour') : '',
      created > 0 ? plural(created, 'appareil ajouté', 'appareils ajoutés') : '',
      createdZones > 0 ? plural(createdZones, 'zone créée', 'zones créées') : '',
    ].filter(Boolean).join(', ')
    setNotice(failed.length > 0
      ? { tone: 'warn', text: `${done ? `Enregistré : ${done}. ` : ''}${plural(failed.length, 'ligne n\'a', 'lignes n\'ont')} pas pu être enregistrées : elles sont restées dans le tableau, réessayez.` }
      : { tone: 'ok', text: `Enregistré : ${done || 'aucune modification'}.` })
  }

  const clientName = site ? clientsById.get(site.client_id)?.name ?? '' : ''
  const siteLabel = site ? (clientName && clientName !== site.name ? `${clientName} · ${site.name}` : site.name) : ''
  const selectedCount = selected.size
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.key))
  const unitCount = rows.filter((r) => r.unitId !== null).length

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Parc du site</div>
          <div className="dash-sub">
            {site ? `${siteLabel} · ${plural(unitCount, 'appareil', 'appareils')}` : 'Choisissez un site pour remplir son parc'}
          </div>
        </div>
        <div className="dash-acts">
          <Link
            to={siteId ? `/equipements?site=${siteId}` : '/equipements'}
            className="btn-sm"
            onClick={(e) => { if (!confirmLeave()) e.preventDefault() }}
          >
            <ArrowLeft size={13} strokeWidth={2} />
            Inventaire
          </Link>
        </div>
      </div>

      <div className="parc-top">
        <select className="parc-site" value={siteId} onChange={(e) => changeSite(e.target.value)} aria-label="Site">
          <option value="">— Choisir un site —</option>
          {sortedSites.map((s) => {
            const clientName = clientsById.get(s.client_id)?.name
            return (
              <option key={s.id} value={s.id}>
                {clientName && clientName !== s.name ? `${clientName} · ${s.name}` : s.name}
                {s.dossier_number ? ` · ${s.dossier_number}` : ''}
              </option>
            )
          })}
        </select>
        {site && !loading && (
          <>
            <button type="button" className="btn-sm" onClick={() => setPasteOpen((v) => !v)}>
              <ClipboardPaste size={13} strokeWidth={2} />
              Coller un tableau
            </button>
            <button type="button" className="btn-sm" onClick={addRows}>
              <Plus size={13} strokeWidth={2} />
              Ajouter des lignes
            </button>
            {families.length > 1 && (
              <select className="parc-filter" value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value as 'all' | EquipmentFamily)} aria-label="Famille">
                <option value="all">Toutes les familles</option>
                {families.map((f) => <option key={f} value={f}>{EQUIPMENT_FAMILY_LABELS[f]}</option>)}
              </select>
            )}
            <label className="parc-check">
              <input
                type="checkbox"
                checked={incompleteKeys !== null}
                onChange={(e) => setIncompleteKeys(e.target.checked
                  ? new Set(rows.filter((r) => !r.zone.trim() || !r.implantation.trim()).map((r) => r.key))
                  : null)}
              />
              Seulement les appareils à compléter
            </label>
          </>
        )}
      </div>

      {!siteId && (
        <div className="card parc-intro">
          <p><strong>Remplissez le parc d'un site au bureau, avant la première visite.</strong></p>
          <p>Le tableau se remplit comme un tableur : la touche Entrée passe à la ligne du dessous. Pour reprendre un ancien rapport, copiez son tableau (Word, PDF ou Excel) et collez-le, ou collez une colonne entière dans la première case d'une colonne.</p>
          <p>Sur place, le technicien trouve ensuite la liste prête : il contrôle, et ne crée que les appareils nouveaux.</p>
        </div>
      )}

      {loadError && <p className="text-red text-sm" style={{ marginBottom: 12 }}>Erreur : {loadError}</p>}
      {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

      {site && !loading && (
        <>
          <p className="parc-help">
            Entrée : ligne du dessous. Collez une colonne copiée dans la première case pour remplir toutes les lignes d'un coup.
            Le N° et la famille d'un appareil déjà enregistré se changent dans sa fiche.
          </p>

          {pasteOpen && (
            <PastePanel
              rows={rows}
              defaultFamily={lastFamily(rows)}
              onClose={() => setPasteOpen(false)}
              onApply={(next, summary) => {
                setRows(next)
                setPasteOpen(false)
                setNotice({ tone: 'ok', text: `${summary} Vérifiez puis enregistrez.` })
              }}
            />
          )}

          {notice && !(notice.fix && errors.size === 0) && (
            <div className={`parc-notice ${notice.tone}`} role="status">
              <span>{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Fermer"><X size={14} /></button>
            </div>
          )}

          {selectedCount > 0 && (
            <div className="parc-bulk">
              <strong>{plural(selectedCount, 'ligne sélectionnée', 'lignes sélectionnées')}</strong>
              <input
                list="parc-zones"
                className="parc-bulk-input"
                placeholder="Zone (ex : Bâtiment B)"
                value={bulkZone}
                onChange={(e) => setBulkZone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBulkZone() } }}
              />
              <button type="button" className="btn-sm acc" onClick={applyBulkZone}>Mettre dans cette zone</button>
              {rows.some((r) => selected.has(r.key) && r.unitId === null) && (
                <button type="button" className="btn-sm" onClick={removeSelectedNew}>
                  <Trash2 size={13} strokeWidth={2} />
                  Retirer les lignes nouvelles
                </button>
              )}
              <button type="button" className="btn-sm" onClick={() => setSelected(new Set())}>Désélectionner</button>
            </div>
          )}

          <datalist id="parc-zones">
            {zoneNames.map((n) => <option key={n} value={n} />)}
          </datalist>

          <div className="card parc-card">
            <div className="parc-wrap">
              <table className="parc-tbl">
                <thead>
                  <tr>
                    <th className="parc-sel">
                      <input
                        type="checkbox"
                        aria-label="Tout sélectionner"
                        checked={allVisibleSelected}
                        onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleRows.map((r) => r.key)))}
                      />
                    </th>
                    {PARC_FIELDS.map((f) => <th key={f} className={TH_CLASS[f]}>{PARC_FIELD_LABELS[f]}</th>)}
                    <th className="parc-th-status" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => (
                    <ParcRowView
                      key={r.key}
                      row={r}
                      index={i}
                      original={r.unitId ? original.get(r.unitId) : undefined}
                      error={errors.get(r.key)}
                      selected={selected.has(r.key)}
                      onChange={updateCell}
                      onKeyDown={onCellKeyDown}
                      onPaste={onCellPaste}
                      onToggle={toggleRow}
                      onRemove={removeRow}
                    />
                  ))}
                </tbody>
              </table>
              {visibleRows.length === 0 && (
                <p className="parc-empty">{incompleteKeys ? 'Tous les appareils ont une zone et un emplacement.' : 'Aucune ligne.'}</p>
              )}
            </div>
          </div>

          <div className={`parc-savebar${dirty ? ' on' : ''}`}>
            <span>
              {dirty
                ? [
                    changes.updates.length > 0 ? plural(changes.updates.length, 'appareil modifié', 'appareils modifiés') : '',
                    changes.creates.length > 0 ? plural(changes.creates.length, 'appareil à ajouter', 'appareils à ajouter') : '',
                    changes.newZones.length > 0 ? plural(changes.newZones.length, 'zone nouvelle', 'zones nouvelles') : '',
                  ].filter(Boolean).join(' · ')
                : 'Aucune modification'}
              {errors.size > 0 && <em> · {plural(errors.size, 'ligne à corriger', 'lignes à corriger')}</em>}
            </span>
            <button type="button" className="btn-sm" onClick={cancelChanges} disabled={!dirty || saving}>Annuler les modifications</button>
            <button type="button" className="btn-sm acc" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
      {!site && siteId && !loading && sites.length > 0 && (
        <p className="text-ink-2 text-sm">Ce site n'existe plus. <button type="button" className="btn-sm" onClick={() => navigate('/equipements/parc')}>Choisir un site</button></p>
      )}
    </>
  )
}

function focusCell(index: number, field: ParcField) {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-parc="${index}:${field}"]`)
    ?? document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-parc="${index}:implantation"]`)
  if (!el) return
  el.focus()
  if (el instanceof HTMLInputElement) el.select()
}

// ─── Ligne du tableau ────────────────────────────────────

type RowProps = {
  row: ParcRow
  index: number
  original: ParcRow | undefined
  error: string | undefined
  selected: boolean
  onChange: (key: string, field: ParcField, value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, index: number, field: ParcField) => void
  onPaste: (e: ClipboardEvent<HTMLInputElement>, index: number, field: ParcField) => void
  onToggle: (key: string, index: number, shift: boolean) => void
  onRemove: (key: string) => void
}

const PLACEHOLDERS: Partial<Record<ParcField, string>> = {
  serial: 'N°',
  subtype: 'Ex : EP6, CO2 2 kg',
  zone: 'Ex : Bâtiment B',
  implantation: 'Ex : Hall, à droite de la porte',
  brand: 'Marque',
  year: 'Année',
}

const ParcRowView = memo(function ParcRowView({ row, index, original, error, selected, onChange, onKeyDown, onPaste, onToggle, onRemove }: RowProps) {
  const isNew = row.unitId === null
  const changed = (f: ParcField) => !!original && original[f].trim() !== row[f].trim()
  const anyChange = !!original && PARC_FIELDS.some(changed)
  const cls = [isNew && !isBlankRow(row) ? 'is-new' : '', error ? 'has-err' : '', selected ? 'is-sel' : ''].filter(Boolean).join(' ')

  return (
    <tr className={cls}>
      <td className="parc-sel">
        <input
          type="checkbox"
          aria-label="Sélectionner la ligne"
          checked={selected}
          onChange={() => undefined}
          onClick={(e: MouseEvent<HTMLInputElement>) => onToggle(row.key, index, e.shiftKey)}
        />
      </td>
      {PARC_FIELDS.map((f) => {
        if (!isEditable(row, f)) {
          return (
            <td key={f} className={TD_CLASS[f]}>
              <span className="parc-ro">{f === 'serial' ? unitRepere({ family: row.family as EquipmentFamily, serial_number: row.serial }) : row.family ? EQUIPMENT_FAMILY_LABELS[row.family] : ''}</span>
            </td>
          )
        }
        if (f === 'family') {
          return (
            <td key={f} className="parc-td-family">
              <select
                className="parc-cell"
                data-parc={`${index}:family`}
                value={row.family}
                onChange={(e) => onChange(row.key, 'family', e.target.value)}
                onKeyDown={(e) => onKeyDown(e, index, 'family')}
                aria-label="Famille"
              >
                <option value="">—</option>
                {EQUIPMENT_FAMILIES.map((fam) => <option key={fam} value={fam}>{EQUIPMENT_FAMILY_LABELS[fam]}</option>)}
              </select>
            </td>
          )
        }
        return (
          <td key={f} className={TD_CLASS[f]}>
            <input
              className={`parc-cell${changed(f) ? ' changed' : ''}`}
              data-parc={`${index}:${f}`}
              value={row[f]}
              placeholder={PLACEHOLDERS[f]}
              list={f === 'zone' ? 'parc-zones' : undefined}
              inputMode={f === 'year' ? 'numeric' : undefined}
              onChange={(e) => onChange(row.key, f, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, index, f)}
              onPaste={(e) => onPaste(e, index, f)}
              aria-label={PARC_FIELD_LABELS[f]}
            />
          </td>
        )
      })}
      <td className="parc-status">
        {error
          ? <span className="parc-err">{error}</span>
          : isNew && !isBlankRow(row)
            ? <span className="badge b-blu">Nouveau</span>
            : anyChange ? <span className="badge b-org">Modifié</span> : null}
        {isNew && (
          <button type="button" className="parc-del" onClick={() => onRemove(row.key)} aria-label="Retirer la ligne" title="Retirer la ligne">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  )
})

// ─── Coller un tableau ───────────────────────────────────

const FIELD_CHOICES: Array<{ value: ParcField | ''; label: string }> = [
  { value: '', label: '— Ignorer —' },
  ...(['serial', 'family', 'subtype', 'zone', 'implantation', 'brand', 'year'] as ParcField[]).map((f) => ({ value: f, label: PARC_FIELD_LABELS[f] })),
]

function headerMapping(header: string[], next: string[] = []): ColumnMapping | null {
  const map = buildHeaderMap(header, HEADER_FIELDS)
  const textOnly = !header.some((c) => /\d/.test(c)) && next.some((c) => /\d/.test(c))
  if (map.size === 0 || (map.size === 1 && header.length > 1 && !textOnly)) return null
  return header.map((_, c) => {
    const key = map.get(c)
    return key ? IMPORT_KEY_TO_PARC[key] ?? null : null
  })
}

function PastePanel({ rows, defaultFamily, onClose, onApply }: {
  rows: ParcRow[]
  defaultFamily: EquipmentFamily | ''
  onClose: () => void
  onApply: (rows: ParcRow[], summary: string) => void
}) {
  const [text, setText] = useState('')
  const [hasHeader, setHasHeader] = useState(false)
  const [mapping, setMapping] = useState<ColumnMapping>([])
  const [family, setFamily] = useState<EquipmentFamily | ''>(defaultFamily)
  const [autoNumber, setAutoNumber] = useState(true)

  const table = useMemo(() => parseClipboardTable(text), [text])
  const body = hasHeader ? table.slice(1) : table
  const width = Math.max(0, ...table.map((r) => r.length))

  function readText(value: string) {
    setText(value)
    const t = parseClipboardTable(value)
    if (t.length === 0) { setMapping([]); return }
    const fromHeader = t.length > 1 ? headerMapping(t[0]!, t[1]) : null
    setHasHeader(!!fromHeader)
    setMapping(fromHeader ?? guessColumns(t))
  }

  function toggleHeader(on: boolean) {
    setHasHeader(on)
    setMapping(on ? headerMapping(table[0] ?? [], table[1]) ?? guessColumns(table.slice(1)) : guessColumns(table))
  }

  const records = useMemo(() => recordsFromTable(body, mapping), [body, mapping])
  const result = useMemo(() => mergePastedRecords(rows, records, { defaultFamily: family, autoNumber }), [rows, records, family, autoNumber])
  const hasSerial = mapping.includes('serial')
  const hasFamilyHint = mapping.includes('family') || mapping.includes('subtype')
  const summary = [
    result.completed > 0 ? plural(result.completed, 'appareil déjà dans le tableau sera complété', 'appareils déjà dans le tableau seront complétés') : '',
    result.added > 0 ? plural(result.added, 'ligne sera ajoutée', 'lignes seront ajoutées') : '',
  ].filter(Boolean).join(', ')
  const doneSummary = [
    result.completed > 0 ? plural(result.completed, 'appareil complété', 'appareils complétés') : '',
    result.added > 0 ? plural(result.added, 'ligne ajoutée', 'lignes ajoutées') : '',
  ].filter(Boolean).join(', ')

  return (
    <div className="card parc-paste">
      <div className="parc-paste-head">
        <strong>Coller un tableau</strong>
        <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <p className="parc-paste-hint">
        Dans l'ancien rapport (Word, PDF ou Excel), sélectionnez les lignes du tableau des appareils, copiez-les (⌘C ou Ctrl+C), puis collez-les ici.
        Un appareil déjà présent (même N°, même famille) est complété ; les autres lignes sont ajoutées. Rien n'est enregistré avant « Enregistrer ».
      </p>
      <textarea
        className="parc-paste-area"
        rows={table.length > 0 ? 3 : 6}
        placeholder="Collez ici les lignes copiées"
        value={text}
        onChange={(e) => readText(e.target.value)}
        autoFocus
      />

      {table.length > 0 && (
        <>
          <div className="parc-paste-opts">
            <label className="parc-check">
              <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
              La première ligne contient les titres des colonnes
            </label>
            {!hasSerial && (
              <label className="parc-check">
                <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} />
                Numéroter à la suite les lignes sans N°
              </label>
            )}
            <label className="parc-check">
              Famille si elle n'est pas indiquée :
              <select value={family} onChange={(e) => setFamily(e.target.value as EquipmentFamily | '')}>
                <option value="">—</option>
                {EQUIPMENT_FAMILIES.map((f) => <option key={f} value={f}>{EQUIPMENT_FAMILY_LABELS[f]}</option>)}
              </select>
            </label>
          </div>

          <div className="parc-wrap">
            <table className="parc-preview">
              <thead>
                <tr>
                  {Array.from({ length: width }, (_, c) => (
                    <th key={c}>
                      <select
                        value={mapping[c] ?? ''}
                        onChange={(e) => {
                          const v = (e.target.value || null) as ParcField | null
                          setMapping((m) => {
                            const next = Array.from({ length: width }, (_, i) => m[i] ?? null)
                            next[c] = v
                            return next
                          })
                        }}
                        aria-label={`Colonne ${c + 1}`}
                      >
                        {FIELD_CHOICES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
                {hasHeader && table[0] && (
                  <tr className="parc-preview-titles">
                    {Array.from({ length: width }, (_, c) => <th key={c}>{table[0]![c] ?? ''}</th>)}
                  </tr>
                )}
              </thead>
              <tbody>
                {body.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {Array.from({ length: width }, (_, c) => <td key={c} className={mapping[c] ? '' : 'off'}>{r[c] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {body.length > 5 && <p className="parc-paste-more">… et {plural(body.length - 5, 'autre ligne', 'autres lignes')}</p>}

          {!hasFamilyHint && !family && (
            <p className="parc-paste-warn">Choisissez la famille des appareils (aucune colonne ne l'indique).</p>
          )}
          {!hasSerial && !autoNumber && (
            <p className="parc-paste-warn">Sans N°, les lignes ajoutées seront à numéroter dans le tableau.</p>
          )}

          <div className="parc-paste-foot">
            <span>{summary || 'Aucune ligne reconnue.'}</span>
            <button type="button" className="btn-sm" onClick={onClose}>Annuler</button>
            <button
              type="button"
              className="btn-sm acc"
              disabled={records.length === 0}
              onClick={() => onApply(result.rows, `${doneSummary.charAt(0).toUpperCase()}${doneSummary.slice(1)}.`)}
            >
              Ajouter au tableau
            </button>
          </div>
        </>
      )}
    </div>
  )
}
