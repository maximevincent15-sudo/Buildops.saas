import { supabase } from '../../../shared/lib/supabase'
import { openableUrls } from '../../../shared/lib/privateFiles'
import { unitRepere, zoneLabel } from '../../equipment/identification'
import type { EquipmentFamily } from '../../equipment/schemas'
import { EQUIPMENT_FAMILY_LABELS } from '../../equipment/schemas'
import type { FullPhoto, FullPhotoGroup } from './FullPhotosPages'

type PhotoRef = { url?: string | null }
type CheckRow = { equipment_unit_id: string; photos: PhotoRef[] | null }
type UnitRow = { id: string; serial_number: string; family: EquipmentFamily; subtype: string | null; zone_id: string | null; implantation: string | null; photo_url: string | null }
type ZoneRow = { id: string; name: string; parent_zone: string | null }
type AnomalyRow = { equipment_unit_id: string | null; title: string; photos: PhotoRef[] | null }

/** Taille des photos dans le PDF complet : lisibles, sans faire un fichier énorme */
const MAX_DIM = 900
const QUALITY = 0.68
const CONCURRENCY = 4

/** Photo réduite en JPEG (data URL) ; null si elle ne se charge pas */
async function shrink(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', QUALITY)
  } catch {
    return null
  }
}

const serialOrder = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : Number.MAX_SAFE_INTEGER)

/**
 * Toutes les photos d'une visite, rangées par équipement contrôlé (repérage,
 * contrôle, anomalies), puis celles du site. Les photos sont téléchargées et
 * réduites dans le navigateur avant d'aller dans le PDF.
 */
export async function loadFullReportPhotos(
  interventionId: string,
  siteId: string | null | undefined,
  onProgress?: (done: number, total: number) => void,
): Promise<FullPhotoGroup[]> {
  const [checksRes, anomaliesRes, reportRes] = await Promise.all([
    supabase.from('equipment_checks').select('equipment_unit_id, photos').eq('intervention_id', interventionId),
    supabase.from('anomalies').select('equipment_unit_id, title, photos').eq('intervention_id', interventionId),
    supabase.from('reports').select('photos').eq('intervention_id', interventionId).maybeSingle(),
  ])
  if (checksRes.error) throw checksRes.error
  const checks = (checksRes.data ?? []) as CheckRow[]
  const anomalies = (anomaliesRes.data ?? []) as AnomalyRow[]
  const reportPhotos = ((reportRes.data as { photos: PhotoRef[] | null } | null)?.photos ?? []) as PhotoRef[]

  const unitIds = [...new Set([...checks.map((c) => c.equipment_unit_id), ...anomalies.map((a) => a.equipment_unit_id).filter((x): x is string => !!x)])]
  const [unitsRes, zonesRes] = await Promise.all([
    unitIds.length
      ? supabase.from('equipment_units').select('id, serial_number, family, subtype, zone_id, implantation, photo_url').in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    siteId ? supabase.from('zones').select('id, name, parent_zone').eq('site_id', siteId) : Promise.resolve({ data: [], error: null }),
  ])
  const units = ((unitsRes.data ?? []) as UnitRow[])
    .sort((a, b) => serialOrder(a.serial_number) - serialOrder(b.serial_number) || a.serial_number.localeCompare(b.serial_number, 'fr'))
  const zoneById = new Map(((zonesRes.data ?? []) as ZoneRow[]).map((z) => [z.id, z]))

  // ─── Photos à placer, avant réduction ─────────────────
  type Pending = { url: string; caption: string }
  const draft: Array<{ key: string; title: string; subtitle: string | null; photos: Pending[] }> = []
  // Une photo n'apparaît qu'une fois, même si elle est rattachée au contrôle
  // et à une ou plusieurs anomalies (contrôle réenregistré, doublons fermés)
  const placed = new Set<string>()
  const add = (list: Pending[], url: string, caption: string) => {
    if (placed.has(url)) return
    placed.add(url)
    list.push({ url, caption })
  }
  for (const u of units) {
    const photos: Pending[] = []
    if (u.photo_url) add(photos, u.photo_url, 'Repérage')
    const checkPhotos = [...new Set(checks.filter((c) => c.equipment_unit_id === u.id).flatMap((c) => c.photos ?? []).map((p) => p.url).filter((x): x is string => !!x))]
    checkPhotos.forEach((url, i) => add(photos, url, checkPhotos.length > 1 ? `Contrôle ${i + 1}` : 'Contrôle'))
    for (const a of anomalies.filter((x) => x.equipment_unit_id === u.id)) {
      for (const p of (a.photos ?? []).filter((x) => x.url)) add(photos, p.url!, `Anomalie : ${a.title}`)
    }
    if (photos.length === 0) continue
    const zone = u.zone_id ? zoneById.get(u.zone_id) : null
    draft.push({
      key: u.id,
      title: `${unitRepere(u)} · ${EQUIPMENT_FAMILY_LABELS[u.family]}`,
      subtitle: [zone ? zoneLabel(zone) : null, u.implantation, u.subtype].filter(Boolean).join(' · ') || null,
      photos,
    })
  }
  const sitePhotos: Pending[] = []
  reportPhotos.filter((p) => p.url).forEach((p, i) => add(sitePhotos, p.url!, `Photo du site ${i + 1}`))
  for (const a of anomalies.filter((x) => !x.equipment_unit_id)) {
    for (const p of (a.photos ?? []).filter((x) => x.url)) add(sitePhotos, p.url!, `Anomalie : ${a.title}`)
  }
  if (sitePhotos.length > 0) draft.push({ key: 'site', title: 'Site', subtitle: null, photos: sitePhotos })

  // ─── Téléchargement et réduction, quelques photos à la fois ───
  const all = draft.flatMap((g) => g.photos)
  const links = await openableUrls(all.map((p) => p.url))
  const shrunk = new Map<string, string | null>()
  const queue = [...new Set(all.map((p) => p.url))]
  const total = queue.length
  let done = 0
  onProgress?.(0, total)
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      shrunk.set(url, await shrink(links.get(url) ?? url))
      done++
      onProgress?.(done, total)
    }
  }))

  return draft
    .map((g) => ({
      key: g.key,
      title: g.title,
      subtitle: g.subtitle,
      photos: g.photos
        .map((p): FullPhoto | null => {
          const src = shrunk.get(p.url)
          return src ? { src, caption: p.caption } : null
        })
        .filter((p): p is FullPhoto => !!p),
    }))
    .filter((g) => g.photos.length > 0)
}
