import { Download, ExternalLink, Loader2, Printer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import type { Client } from '../../clients/schemas'
import { getInvoicingSettings } from '../../parametres/api'
import { listZones, updateEquipmentUnit } from '../api'
import { compareUnitsByRound, unitLocation, unitRepere } from '../identification'
import { LABEL_FORMATS, labelUrl, newLabelCode } from '../labels'
import { EQUIPMENT_FAMILIES, EQUIPMENT_FAMILY_LABELS } from '../schemas'
import type { EquipmentFamily, EquipmentUnit, Site, Zone } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  /** Codes attribués aux équipements : la liste est à recharger */
  onChanged?: () => void
  units: EquipmentUnit[]
  sites: Site[]
  clients: Client[]
  defaultSiteId?: string
}

type Mode = 'site' | 'blank'

const BLANK_COUNTS = [24, 48, 72, 96, 120, 240]

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Impression d'étiquettes QR sur planches A4 : pour les équipements d'un site
 * (repère + emplacement), ou vierges pré-numérotées à associer au premier scan.
 */
export function LabelsModal({ open, onClose, onChanged, units, sites, clients, defaultSiteId }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [mode, setMode] = useState<Mode>('site')
  // Monté à chaque ouverture (rendu conditionnel par le parent) : état neuf
  const [siteId, setSiteId] = useState(defaultSiteId && defaultSiteId !== 'all' ? defaultSiteId : '')
  const [family, setFamily] = useState<EquipmentFamily | 'all'>('all')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [blankCount, setBlankCount] = useState(24)
  const [formatId, setFormatId] = useState(LABEL_FORMATS[0]!.id)
  const [startAt, setStartAt] = useState(1)
  const [borders, setBorders] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; count: number; pages: number } | null>(null)

  // Libère le PDF généré à la fermeture
  const resultUrl = useRef<string | null>(null)
  useEffect(() => {
    resultUrl.current = result?.url ?? null
  }, [result])
  useEffect(() => () => { if (resultUrl.current) URL.revokeObjectURL(resultUrl.current) }, [])

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const sortedSites = useMemo(
    () => [...sites].sort((a, b) =>
      (clientsById.get(a.client_id)?.name ?? '').localeCompare(clientsById.get(b.client_id)?.name ?? '', 'fr')
      || a.name.localeCompare(b.name, 'fr')),
    [sites, clientsById],
  )

  const siteUnits = useMemo(
    () => units.filter((u) => u.site_id === siteId && (family === 'all' || u.family === family)),
    [units, siteId, family],
  )
  const selected = onlyMissing ? siteUnits.filter((u) => !u.qr_code) : siteUnits
  const missingCount = selected.filter((u) => !u.qr_code).length
  const format = LABEL_FORMATS.find((f) => f.id === formatId) ?? LABEL_FORMATS[0]!
  const perPage = format.cols * format.rows
  const count = mode === 'site' ? selected.length : blankCount

  async function generate() {
    if (!profile?.organization_id) return
    if (count === 0) {
      setError(mode === 'site' ? 'Aucun équipement à étiqueter avec ces critères.' : 'Choisis un nombre d\'étiquettes.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Libellés : repère + emplacement (site), ou code vierge
      let items: { qr: string; title: string; lines: string[] }[]
      if (mode === 'site') {
        const zones: Zone[] = await listZones(siteId)
        const zonesById = new Map(zones.map((z) => [z.id, z]))
        const ordered = [...selected].sort(compareUnitsByRound(zonesById))
        // Équipements sans code : un code Firovia leur est attribué et enregistré
        const withCodes: EquipmentUnit[] = []
        for (let i = 0; i < ordered.length; i += 6) {
          const chunk = ordered.slice(i, i + 6)
          withCodes.push(...await Promise.all(chunk.map((u) =>
            u.qr_code ? Promise.resolve(u) : updateEquipmentUnit(u.id, { qr_code: labelUrl(newLabelCode()) }),
          )))
        }
        if (missingCount > 0) onChanged?.()
        const site = sites.find((s) => s.id === siteId)
        items = withCodes.map((u) => ({
          qr: u.qr_code!,
          title: unitRepere(u),
          lines: [
            cut(unitLocation(u, u.zone_id ? zonesById.get(u.zone_id) : null) || EQUIPMENT_FAMILY_LABELS[u.family], 70),
            cut(site?.name ?? '', 40),
          ].filter(Boolean),
        }))
      } else {
        items = Array.from({ length: blankCount }, () => {
          const code = newLabelCode()
          return { qr: labelUrl(code), title: code, lines: ['À associer au', 'premier scan'] }
        })
      }

      const [{ default: QRCode }, { pdf }, { LabelsPdf }, settings] = await Promise.all([
        import('qrcode'),
        import('@react-pdf/renderer'),
        import('../pdf/LabelsPdf'),
        getInvoicingSettings(profile.organization_id).catch(() => null),
      ])
      const labels = await Promise.all(items.map(async (it) => ({
        qrDataUrl: await QRCode.toDataURL(it.qr, { errorCorrectionLevel: 'M', margin: 1, width: 320 }),
        title: it.title,
        lines: it.lines,
      })))
      const blob = await pdf(
        <LabelsPdf
          format={format}
          labels={labels}
          organizationName={profile.organizations?.name ?? ''}
          phone={settings?.legal_phone ?? null}
          startAt={startAt}
          showBorders={borders}
        />,
      ).toBlob()
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url: URL.createObjectURL(blob), count: labels.length, pages: Math.ceil((labels.length + startAt - 1) / perPage) }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Génération impossible.')
    } finally {
      setBusy(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !busy) onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <span className="modal-title">Étiquettes QR</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`filter-pill${mode === 'site' ? ' on' : ''}`} onClick={() => { setMode('site'); setResult(null) }}>
              Équipements d'un site
            </button>
            <button type="button" className={`filter-pill${mode === 'blank' ? ' on' : ''}`} onClick={() => { setMode('blank'); setResult(null) }}>
              Étiquettes vierges
            </button>
          </div>

          {mode === 'site' ? (
            <>
              <div className="fg">
                <label>Site</label>
                <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setResult(null) }}>
                  <option value="">— Choisir un site —</option>
                  {sortedSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {clientsById.get(s.client_id)?.name ? `${clientsById.get(s.client_id)!.name} · ` : ''}{s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label>Type d'équipement</label>
                <select value={family} onChange={(e) => { setFamily(e.target.value as EquipmentFamily | 'all'); setResult(null) }}>
                  <option value="all">Tous</option>
                  {EQUIPMENT_FAMILIES.map((f) => (
                    <option key={f} value={f}>{EQUIPMENT_FAMILY_LABELS[f]}</option>
                  ))}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyMissing} onChange={(e) => { setOnlyMissing(e.target.checked); setResult(null) }} />
                Seulement les équipements qui n'ont pas encore d'étiquette QR
              </label>
              {siteId && (
                <p className="text-ink-2 text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
                  <strong>{selected.length}</strong> étiquette{selected.length > 1 ? 's' : ''}, dans l'ordre de passage.
                  {missingCount > 0 && ` ${missingCount} équipement${missingCount > 1 ? 's' : ''} sans code : un code Firovia ${missingCount > 1 ? 'leur' : 'lui'} sera attribué et enregistré.`}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="fg">
                <label>Nombre d'étiquettes</label>
                <select value={blankCount} onChange={(e) => { setBlankCount(Number(e.target.value)); setResult(null) }}>
                  {BLANK_COUNTS.map((n) => (
                    <option key={n} value={n}>{n} ({n / perPage} planche{n / perPage > 1 ? 's' : ''})</option>
                  ))}
                </select>
              </div>
              <p className="text-ink-2 text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
                Pour un site pas encore saisi : le technicien colle une étiquette sur chaque appareil, puis la scanne
                dans le rapport (« Scanner une étiquette »). L'appareil est créé avec ce code.
              </p>
            </>
          )}

          <div className="mrow">
            <div className="fg">
              <label>Format des planches</label>
              <select value={formatId} onChange={(e) => { setFormatId(e.target.value); setResult(null) }}>
                {LABEL_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>Commencer à la case</label>
              <input type="number" min={1} max={perPage} value={startAt}
                onChange={(e) => { setStartAt(Math.min(perPage, Math.max(1, Number(e.target.value) || 1))); setResult(null) }} />
              <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>Pour finir une planche entamée (1 = en haut à gauche)</span>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={borders} onChange={(e) => { setBorders(e.target.checked); setResult(null) }} />
            Afficher les contours (pour un essai sur papier ordinaire)
          </label>

          {error && <span className="ferr on">{error}</span>}

          {result ? (
            <div style={{ background: 'var(--bg)', border: '.5px solid var(--brd)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13.5 }}>
                PDF prêt : <strong>{result.count} étiquette{result.count > 1 ? 's' : ''}</strong> sur {result.pages} planche{result.pages > 1 ? 's' : ''}.
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="mf prim" href={result.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                  <ExternalLink size={14} /> Ouvrir le PDF
                </a>
                <a className="mf out" href={result.url} download="etiquettes-qr-firovia.pdf" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                  <Download size={14} /> Télécharger
                </a>
              </div>
              <span className="text-ink-3 text-xs" style={{ lineHeight: 1.5 }}>
                À l'impression, choisissez <strong>« Taille réelle » (100 %)</strong>, sans « Ajuster à la page ».
                Faites un premier essai sur papier ordinaire pour vérifier l'alignement.
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="mf prim"
              onClick={() => void generate()}
              disabled={busy || (mode === 'site' && !siteId)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {busy ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
              {busy ? 'Préparation…' : `Préparer ${count > 0 ? count : ''} étiquette${count > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
