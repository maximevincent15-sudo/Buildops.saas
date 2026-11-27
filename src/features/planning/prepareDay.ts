import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { supabase } from '../../shared/lib/supabase'
import { getFile, prunePrefetchedFiles, putFile } from '../../shared/lib/offline/db'
import { fetchActivity } from '../../shared/lib/offline/fetch'
import { getOfflineUser } from '../../shared/lib/offline/state'
import { openableUrls, storageLocation } from '../../shared/lib/privateFiles'
import type { Intervention } from './schemas'
import { normalizeIntervention } from './schemas'

/**
 * « Préparer ma journée » : avant de partir, chaque rapport du jour est
 * ouvert dans une zone invisible, exactement comme si le technicien
 * l'ouvrait. Tout ce qu'il charge (visite, appareils, contrôles, listes,
 * historique) est gardé sur l'appareil par la couche hors ligne, puis
 * resservi sans réseau. Les photos de repérage des appareils sont aussi
 * copiées sur l'appareil. Rien n'est écrit en base.
 */

const STORAGE_KEY = 'firovia_day_prepared'
const PHOTO_CONCURRENCY = 4

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Visites à préparer : en cours, aujourd'hui et demain (pas les terminées) */
export async function listVisitsToPrepare(technicianId: string | null): Promise<Intervention[]> {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const when = `status.eq.en_cours,and(scheduled_date.gte.${isoDay(today)},scheduled_date.lte.${isoDay(tomorrow)})`
  // Un technicien : ses visites comme principal ou comme équipier (binôme)
  const filter = technicianId
    ? `and(technician_id.eq.${technicianId},or(${when})),and(co_technician_id.eq.${technicianId},or(${when}))`
    : when
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .or(filter)
    .neq('status', 'terminee')
    .order('scheduled_date', { ascending: true, nullsFirst: true })
    .order('start_time', { ascending: true, nullsFirst: false })
  if (error) throw error
  return ((data ?? []) as Intervention[]).map(normalizeIntervention)
}

/** Attend que l'écran ait fini de charger (plus de requête depuis un moment) */
async function waitForIdle(minMs = 2500, quietMs = 1500, maxMs = 45_000): Promise<void> {
  const start = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 250))
    const { inflight, lastActivity } = fetchActivity()
    const elapsed = Date.now() - start
    if (elapsed >= maxMs) return
    if (elapsed >= minMs && inflight === 0 && Date.now() - lastActivity >= quietMs) return
  }
}

/** Ouvre le rapport d'une visite dans une zone invisible, le temps qu'il charge tout */
export async function prefetchReport(interventionId: string): Promise<void> {
  const { RapportEditorPage } = await import('../../pages/RapportEditorPage')
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:800px;overflow:hidden;visibility:hidden;pointer-events:none;'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(
      createElement(MemoryRouter, { initialEntries: [`/rapports/${interventionId}`] },
        createElement(Routes, null,
          createElement(Route, { path: '/rapports/:interventionId', element: createElement(RapportEditorPage) }),
          createElement(Route, { path: '*', element: null }),
        ),
      ),
    )
    await waitForIdle()
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Copie sur l'appareil les photos de repérage des appareils des sites ; renvoie le nombre copié */
export async function prefetchUnitPhotos(siteIds: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const userId = getOfflineUser()
  if (!userId || siteIds.length === 0) return 0
  // Ménage : copies de plus de 7 jours
  await prunePrefetchedFiles(7 * 86_400_000).catch(() => {})
  const urls: string[] = []
  for (let i = 0; i < siteIds.length; i += 20) {
    const { data, error } = await supabase
      .from('equipment_units')
      .select('photo_url')
      .in('site_id', siteIds.slice(i, i + 20))
      .not('photo_url', 'is', null)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ photo_url: string | null }>) if (r.photo_url) urls.push(r.photo_url)
  }
  // Seulement celles qui ne sont pas déjà sur l'appareil
  const missing: string[] = []
  for (const url of new Set(urls)) {
    const loc = storageLocation(url)
    if (!loc) continue
    const have = await getFile(`${loc.bucket}/${loc.path}`).catch(() => undefined)
    if (!have) missing.push(url)
  }
  const total = missing.length
  onProgress?.(0, total)
  if (total === 0) return 0
  const links = await openableUrls(missing)
  let done = 0
  let saved = 0
  let next = 0
  async function worker() {
    while (next < missing.length) {
      const url = missing[next++]!
      try {
        const res = await fetch(links.get(url) ?? url)
        if (res.ok) {
          const blob = await res.blob()
          const loc = storageLocation(url)!
          await putFile({ path: `${loc.bucket}/${loc.path}`, userId: userId!, blob, contentType: blob.type || 'image/jpeg', savedAt: Date.now(), prefetched: true })
          saved += 1
        }
      } catch { /* photo manquée : elle s'affichera avec du réseau */ }
      done += 1
      onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PHOTO_CONCURRENCY, total) }, () => worker()))
  return saved
}

export type PreparedInfo = { at: string; ids: string[] }

/** Dernière préparation faite sur cet appareil */
export function lastPrepared(): PreparedInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PreparedInfo) : null
  } catch {
    return null
  }
}

export function savePrepared(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: new Date().toISOString(), ids }))
  } catch { /* stockage indisponible : simple confort */ }
}

/** Demande au navigateur de ne pas effacer les données gardées (si possible) */
export async function askPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch { /* non pris en charge */ }
}
