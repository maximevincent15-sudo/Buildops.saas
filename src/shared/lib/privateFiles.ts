import { supabase } from './supabase'

/**
 * Fichiers en accès privé : PDF des rapports, devis et factures, documents
 * des dossiers, archives (bucket « documents ») et justificatifs de dépenses.
 * La base garde une adresse de référence ; pour ouvrir le fichier, on
 * demande un lien temporaire signé, valable une heure, réservé aux membres
 * de l'entreprise (règles du stockage). Les autres fichiers (photos) gardent
 * leur lien public, renvoyé tel quel.
 */

export const PRIVATE_BUCKET = 'documents'
const PRIVATE_BUCKETS = new Set([PRIVATE_BUCKET, 'expense-receipts'])
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

/** Lien utilisable tout de suite : temporaire pour un fichier privé, l'adresse elle-même sinon */
export async function openableUrl(url: string): Promise<string> {
  if (!isPrivateFile(url)) return url
  const hit = cached(url)
  if (hit) return hit
  const loc = storageLocation(url)!
  const { data, error } = await supabase.storage.from(loc.bucket).createSignedUrl(loc.path, SIGNED_TTL_SECONDS)
  if (error || !data?.signedUrl) throw error ?? new Error('Lien du fichier indisponible')
  cache.set(url, { url: data.signedUrl, expires: Date.now() + SIGNED_TTL_SECONDS * 1000 })
  return data.signedUrl
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
