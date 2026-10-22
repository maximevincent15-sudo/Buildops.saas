import { CheckCircle2, QrCode } from 'lucide-react'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { createEquipmentUnit, createZone, deleteUnitPhoto } from '../api'
import { normalize } from '../familyResolver'
import { cleanAttributes, unitRepere } from '../identification'
import { nextSerial, parseLabelQr, shortCodeFromQr } from '../inventory'
import type { LabelQrFields } from '../inventory'
import { EQUIPMENT_FAMILIES, EQUIPMENT_FAMILY_LABELS } from '../schemas'
import type { EquipmentFamily, EquipmentUnit, Zone } from '../schemas'
import { UnitAttributesFields } from './UnitAttributesFields'
import { UnitPhotoField } from './UnitPhotoField'
import type { UnitPhoto } from './UnitPhotoField'

type Props = {
  siteId: string
  clientId: string
  organizationId: string
  zones: Zone[]
  /** Équipements déjà sur le site (pour la numérotation et les doublons) */
  siteUnits: Pick<EquipmentUnit, 'family' | 'serial_number'>[]
  /** Contenu de l'étiquette scannée (null : ajout sans étiquette) */
  qrCode: string | null
  /** Dernier appareil ajouté ou existant : sert à pré-remplir la fiche */
  previous: Pick<EquipmentUnit, 'family' | 'subtype' | 'brand' | 'zone_id' | 'serial_number' | 'attributes'> | null
  onZoneCreated: (zone: Zone) => void
  /** then = 'check' : ouvrir le contrôle ; 'next' : passer à l'étiquette suivante */
  onCreated: (unit: EquipmentUnit, then: 'check' | 'next') => void
  onClose: () => void
}

const sameSerial = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Fiche courte d'ajout d'un équipement pendant la visite (inventaire au scan) :
 * remplie depuis le QR code quand il contient des informations, sinon avec
 * l'appareil précédent. Un appui suffit en général.
 */
export function QuickUnitSheet({
  siteId, clientId, organizationId, zones, siteUnits, qrCode, previous, onZoneCreated, onCreated, onClose,
}: Props) {
  const [initial] = useState(() => {
    const parsed: LabelQrFields = qrCode ? parseLabelQr(qrCode) : { filled: [] }
    const family: EquipmentFamily = parsed.family ?? previous?.family ?? 'extincteurs'
    const familySerials = siteUnits.filter((u) => u.family === family).map((u) => u.serial_number)
    const lastSerial = previous?.family === family ? previous.serial_number : null
    const qrShort = qrCode && parsed.filled.length === 0 ? shortCodeFromQr(qrCode) : null
    const fixedSerial = parsed.serial
      || (qrShort && !familySerials.some((s) => sameSerial(s, qrShort)) ? qrShort : null)
    const serial = fixedSerial || nextSerial(familySerials, lastSerial)
    const zoneName = parsed.zoneName
    const zoneMatch = zoneName ? zones.find((z) => normalize(z.name) === normalize(zoneName)) : undefined
    return {
      parsed,
      family,
      serial,
      /** N° proposé par la numérotation (et non lu sur l'étiquette) : suit la famille choisie */
      serialAuto: !fixedSerial,
      subtype: parsed.subtype ?? (previous?.family === family ? previous.subtype ?? '' : ''),
      brand: parsed.brand ?? previous?.brand ?? '',
      model: parsed.model ?? '',
      zoneId: zoneMatch?.id ?? (zoneName ? '' : previous?.zone_id ?? ''),
      newZone: zoneName && !zoneMatch ? zoneName : '',
      implantation: parsed.implantation ?? '',
      year: parsed.installYear ? String(parsed.installYear) : '',
      notes: parsed.manufacturerSerial ? `N° série fabricant : ${parsed.manufacturerSerial}` : '',
      attributes: previous?.family === family ? { ...(previous.attributes ?? {}) } : {},
    }
  })

  const [family, setFamily] = useState<EquipmentFamily>(initial.family)
  const [serial, setSerial] = useState(initial.serial)
  const [serialTouched, setSerialTouched] = useState(false)
  const [subtype, setSubtype] = useState(initial.subtype)
  const [brand, setBrand] = useState(initial.brand)
  const [zoneId, setZoneId] = useState(initial.zoneId)
  const [newZone, setNewZone] = useState(initial.newZone)
  const [implantation, setImplantation] = useState(initial.implantation)
  const [year, setYear] = useState(initial.year)
  const [attrs, setAttrs] = useState<Record<string, string>>(initial.attributes)
  const [photo, setPhoto] = useState<UnitPhoto | null>(null)
  const [saving, setSaving] = useState<'check' | 'next' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const duplicate = siteUnits.some((u) => u.family === family && sameSerial(u.serial_number, serial))
  const yearNum = year.trim() ? Number(year) : undefined
  const yearInvalid = yearNum !== undefined && (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100)

  const info = initial.parsed.filled.length > 0
    ? `Rempli depuis le QR code : ${initial.parsed.filled.join(', ')}. Vérifie avant d'ajouter.`
    : previous
      ? 'Pré-rempli avec l\'appareil précédent : vérifie le N° et l\'emplacement.'
      : null

  function changeFamily(f: EquipmentFamily) {
    setFamily(f)
    setAttrs(previous?.family === f ? { ...(previous.attributes ?? {}) } : {})
    if (initial.serialAuto && !serialTouched) {
      const serials = siteUnits.filter((u) => u.family === f).map((u) => u.serial_number)
      setSerial(nextSerial(serials, previous?.family === f ? previous.serial_number : null))
    }
  }

  async function submit(then: 'check' | 'next') {
    if (!serial.trim()) { setError('Indique le N° de l\'équipement.'); return }
    if (duplicate) { setError(`Le N° ${serial.trim()} existe déjà pour cette famille sur ce site.`); return }
    if (yearInvalid) { setError('Année invalide.'); return }
    setSaving(then)
    setError(null)
    try {
      let zone = zoneId || undefined
      if (!zone && newZone.trim()) {
        const z = await createZone({ site_id: siteId, name: newZone.trim(), display_order: zones.length }, organizationId)
        onZoneCreated(z)
        zone = z.id
      }
      const unit = await createEquipmentUnit({
        client_id: clientId,
        site_id: siteId,
        zone_id: zone,
        family,
        subtype: subtype.trim() || undefined,
        serial_number: serial.trim(),
        implantation: implantation.trim() || undefined,
        brand: brand.trim() || undefined,
        model: initial.model || undefined,
        install_year: yearNum,
        qr_code: qrCode?.trim() || undefined,
        status: 'active',
        notes: initial.notes || undefined,
        photo_path: photo?.path ?? null,
        photo_url: photo?.url ?? null,
        attributes: cleanAttributes(family, attrs),
      }, organizationId)
      onCreated(unit, then)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(/duplicate|unique/i.test(msg)
        ? `Le N° ${serial.trim()} existe déjà sur ce site (peut-être un équipement retiré). Choisis un autre N°.`
        : msg || 'Ajout impossible. Vérifie ta connexion et réessaie.')
      setSaving(null)
    }
  }

  /** Fermeture sans ajout : la photo déjà envoyée est supprimée */
  function handleCancel() {
    if (photo) void deleteUnitPhoto(photo.path)
    onClose()
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !saving) handleCancel()
  }

  return (
    <div className="overlay open" onClick={handleBackdropClick}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">Nouvel équipement sur le site</span>
          <button type="button" className="modal-x" onClick={handleCancel} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', padding: '.25rem 0' }}>
          {qrCode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)', background: 'var(--wht)', border: '1px solid var(--bd, #E6E8EC)', borderRadius: 8, padding: '7px 10px', minWidth: 0 }}>
              <QrCode size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Étiquette : {qrCode.trim()}</span>
            </div>
          )}
          {info && (
            <div style={{ display: 'flex', gap: 6, fontSize: 12.5, color: 'var(--grn)', lineHeight: 1.4 }}>
              <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{info}</span>
            </div>
          )}

          <div className="mrow">
            <div className="fg">
              <label>Famille</label>
              <select value={family} onChange={(e) => changeFamily(e.target.value as EquipmentFamily)}>
                {EQUIPMENT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{EQUIPMENT_FAMILY_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>N° de repère</label>
              <input type="text" value={serial} onChange={(e) => { setSerial(e.target.value); setSerialTouched(true) }} placeholder="Ex : 0452" />
              {duplicate ? (
                <span className="ferr on">Déjà utilisé pour cette famille sur ce site</span>
              ) : serial.trim() ? (
                <span className="text-ink-3" style={{ fontSize: 11.5, marginTop: 4 }}>
                  Affiché : <strong>{unitRepere({ family, serial_number: serial })}</strong>
                </span>
              ) : null}
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Type</label>
              <input type="text" value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="Ex : EP6 ABC, CO² 5 kg" />
            </div>
            <div className="fg">
              <label>Marque</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex : Sicli" />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Zone</label>
              <select value={zoneId} onChange={(e) => { setZoneId(e.target.value); if (e.target.value) setNewZone('') }}>
                <option value="">{newZone.trim() ? `Nouvelle : ${newZone.trim()}` : '— Aucune zone —'}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.parent_zone ? `${z.parent_zone} · ${z.name}` : z.name}</option>
                ))}
              </select>
              {!zoneId && (
                <input type="text" value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder="+ Nouvelle zone (ex : Bâtiment B)" style={{ marginTop: 6, fontSize: 12.5 }} />
              )}
            </div>
            <div className="fg">
              <label>Année</label>
              <input type="number" inputMode="numeric" min={1900} max={2100} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" />
              {yearInvalid && <span className="ferr on">Année invalide</span>}
            </div>
          </div>

          <div className="fg">
            <label>Emplacement précis</label>
            <input type="text" value={implantation} onChange={(e) => setImplantation(e.target.value)} placeholder="Ex : Hall d'accueil, à droite de l'ascenseur" />
          </div>

          <UnitAttributesFields family={family} value={attrs} onChange={setAttrs} />

          <div className="fg">
            <label>Photo de repérage <span className="text-ink-3 text-xs font-light">(conseillée)</span></label>
            <UnitPhotoField organizationId={organizationId} value={photo} onChange={(p) => { if (photo && photo.path !== p?.path) void deleteUnitPhoto(photo.path); setPhoto(p) }} variant="compact" />
          </div>

          {error && <span className="ferr on">{error}</span>}

          {/* Boutons toujours visibles, même quand la fiche défile sur téléphone */}
          <div style={{ position: 'sticky', bottom: -20, background: 'var(--wht)', padding: '10px 0 20px', marginBottom: -20, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 -8px 12px -10px rgba(0,0,0,.25)' }}>
            <button type="button" className="mf prim" onClick={() => void submit('check')} disabled={!!saving}
              style={{ width: '100%', padding: '12px 16px', fontSize: '1rem' }}>
              {saving === 'check' ? 'Ajout…' : 'Ajouter et contrôler'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="mf out" onClick={handleCancel} disabled={!!saving} style={{ flex: 1 }}>
                Annuler
              </button>
              <button type="button" className="mf out" onClick={() => void submit('next')} disabled={!!saving} style={{ flex: 1 }}>
                {saving === 'next' ? 'Ajout…' : 'Ajouter seulement'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
