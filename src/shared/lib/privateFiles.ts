import { supabase } from './supabase'

/**
 * Fichiers en accès privé : PDF des rapports, devis et factures, documents
 * des dossiers, archives (bucket « documents »), justificatifs de dépenses
 * et photos de visite (bucket « report-photos »). La base garde une adresse
 * de référence ; pour ouvrir le fichier, on demande un lien temporaire signé,
 * valable une heure, réservé aux membres de l'entreprise (règles du stockage).
 */

export const PRIVATE_BUCKET = 'documents'
const PRIVATE_BUCKETS = new Set([PRIVATE_BUCKET, 'expense-receipts', 'report-photos'])
const SIGNED_TTL_SECONDS = 3600

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

/** Adresse de référence d'un fichier privé (enregistrée en base) */
export function privateFileUrl(path: string, bucket = PRIVATE_BUCKET): string {
  return `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`
}

/** Bucket et chemin d'une adresse du stockage Supabase, null sinon */
export function storageLocation(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null
  const m = /\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/([^?#]+)/.exec(url)
  if (!m) return null
  return { bucket: m[1]!, path: decodeURIComponent(m[2]!) }
}

/** Fichier rangé dans un bucket privé (il faut un lien temporaire pour l'ouvrir) */
export function isPrivateFile(url: string | null | undefined): boolean {
  const loc = storageLocation(url)
  return !!loc && PRIVATE_BUCKETS.has(loc.bucket)
}

export async function uploadPrivateFile(
  path: string,
  body: Blob | File,
  options: { contentType: string; upsert?: boolean },
): Promise<{ path: string; url: string }> {
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, body, {
    contentType: options.contentType,
    upsert: options.upsert ?? false,
    cacheControl: '3600',
  })
  if (error) throw error
  return { path, url: privateFileUrl(path) }
}

/** Supprime un fichier d'après son adresse (bucket privé ou ancien bucket public) */
export async function removeStoredFile(url: string | null | undefined, fallbackPath?: string | null): Promise<void> {
  const loc = storageLocation(url) ?? (fallbackPath ? { bucket: 'report-photos', path: fallbackPath } : null)
  if (!loc) return
  const { error } = await supabase.storage.from(loc.bucket).remove([loc.path])
  if (error) throw error
}

// ─── Liens temporaires (avec cache) ──────────────────────

const cache = new Map<string, { url: string; expires: number }>()

function cached(url: string): string | null {
  const hit = cache.get(url)
  return hit && hit.expires > Date.now() + 60_000 ? hit.url : null
}

// Demandes du même instant regroupées (une page de vignettes = une requête)
let pending: Array<{ url: string; resolve: (u: string) => void; reject: (e: unknown) => void }> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushPending() {
  const batch = pending
  pending = []
  flushTimer = null
  try {
    const links = await signMany(batch.map((b) => b.url))
    for (const b of batch) {
      const signed = links.get(b.url)
      if (signed) b.resolve(signed)
      else b.reject(new Error('Lien du fichier indisponible'))
    }
  } catch (e) {
    for (const b of batch) b.reject(e)
  }
}

/** Lien utilisable tout de suite : temporaire pour un fichier privé, l'adresse elle-même sinon */
export async function openableUrl(url: string): Promise<string> {
  if (!isPrivateFile(url)) return url
  const hit = cached(url)
  if (hit) return hit
  return new Promise<string>((resolve, reject) => {
    pending.push({ url, resolve, reject })
    if (!flushTimer) flushTimer = setTimeout(() => void flushPending(), 0)
  })
}

/** Signe des fichiers privés par lots ; seuls ceux réellement signés sont renvoyés */
async function signMany(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const byBucket = new Map<string, string[]>()
  for (const url of new Set(urls)) {
    const hit = cached(url)
    if (hit) { out.set(url, hit); continue }
    const loc = storageLocation(url)!
    byBucket.set(loc.bucket, [...(byBucket.get(loc.bucket) ?? []), url])
  }
  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100)
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(chunk.map((u) => storageLocation(u)!.path), SIGNED_TTL_SECONDS)
      if (error) throw error
      chunk.forEach((u, j) => {
        const signed = data?.[j]?.signedUrl
        if (!signed) return
        cache.set(u, { url: signed, expires: Date.now() + SIGNED_TTL_SECONDS * 1000 })
        out.set(u, signed)
      })
    }
  }
  return out
}

/**
 * Image d'un PDF : le moteur PDF va chercher lui-même l'image ; pour une
 * photo privée, on lui donne une fonction qui fournit le lien temporaire.
 */
export function pdfImageSrc(url: string): string | (() => Promise<string>) {
  return isPrivateFile(url) ? () => openableUrl(url).catch(() => url) : url
}

/**
 * Plusieurs liens d'un coup (ZIP, export) ; un fichier introuvable garde son
 * adresse. ttlSeconds : durée de validité (par défaut une heure ; un export
 * remis au comptable a des liens valables plusieurs jours).
 */
export async function openableUrls(urls: string[], ttlSeconds = SIGNED_TTL_SECONDS): Promise<Map<string, string>> {
  const useCache = ttlSeconds === SIGNED_TTL_SECONDS
  const out = new Map<string, string>()
  const byBucket = new Map<string, string[]>()
  for (const url of new Set(urls)) {
    const hit = isPrivateFile(url) ? (useCache ? cached(url) : null) : url
    if (hit) { out.set(url, hit); continue }
    const loc = storageLocation(url)!
    byBucket.set(loc.bucket, [...(byBucket.get(loc.bucket) ?? []), url])
  }
  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100)
      const { data } = await supabase.storage.from(bucket).createSignedUrls(chunk.map((u) => storageLocation(u)!.path), ttlSeconds)
      chunk.forEach((u, j) => {
        const signed = data?.[j]?.signedUrl
        if (signed && useCache) cache.set(u, { url: signed, expires: Date.now() + ttlSeconds * 1000 })
        out.set(u, signed ?? u)
      })
    }
  }
  return out
}

/**
 * Ouvre un fichier dans un nouvel onglet. L'onglet est ouvert tout de suite
 * (au clic) pour ne pas être bloqué, puis reçoit le lien temporaire.
 */
export async function openStoredFile(url: string): Promise<void> {
  if (!isPrivateFile(url)) {
    window.open(url, '_blank', 'noopener')
    return
  }
  const tab = window.open('', '_blank')
  try {
    const signed = await openableUrl(url)
    if (tab) tab.location.href = signed
    else window.location.href = signed
  } catch (e) {
    tab?.close()
    throw e
  }
}
