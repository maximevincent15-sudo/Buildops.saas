import { compressImage } from './image'
import { uploadPrivateFile } from './privateFiles'
import { supabase } from './supabase'

const BUCKET = 'report-photos'

// Limite max par fichier upload\u00e9 (10 Mo). D\u00e9fense en profondeur : \u00e9vite qu'un
// user (ou attaquant) sature le Storage. Le bucket Supabase a aussi une limite
// server-side, mais on pr\u00e9f\u00e8re bloquer c\u00f4t\u00e9 client pour un feedback imm\u00e9diat.
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024

export type StoredPhoto = {
  path: string
  url: string
}

export class FileTooLargeError extends Error {
  sizeBytes: number
  maxBytes: number
  constructor(sizeBytes: number, maxBytes: number) {
    super(
      `Fichier trop volumineux : ${(sizeBytes / 1024 / 1024).toFixed(1)} Mo. ` +
      `Maximum autoris\u00e9 : ${maxBytes / 1024 / 1024} Mo.`,
    )
    this.name = 'FileTooLargeError'
    this.sizeBytes = sizeBytes
    this.maxBytes = maxBytes
  }
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 60)
}

export async function uploadReportPhoto(
  file: File,
  organizationId: string,
  interventionId: string,
): Promise<StoredPhoto> {
  // Photo réduite avant envoi (3 à 6 Mo → quelques centaines de Ko) : envoi
  // rapide même avec une barre de réseau, et PDF plus légers
  const blob = await compressImage(file, 1600, 0.82)
  if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileTooLargeError(blob.size, MAX_UPLOAD_SIZE_BYTES)
  }

  let safeName = sanitizeFilename(file.name)
  if (blob !== file && blob.type === 'image/jpeg') safeName = `${safeName.replace(/\.[a-zA-Z0-9]+$/, '')}.jpg`
  const uniquePrefix = crypto.randomUUID()
  const path = `${organizationId}/interventions/${interventionId}/${uniquePrefix}-${safeName}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType: blob.type || file.type || 'image/jpeg',
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function deleteReportPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

/** Formats acceptés pour les documents des dossiers (autorisés par le bucket) */
export const DOSSIER_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/** Document d'un dossier (bon de livraison, plan, ancien rapport…), rangé sous <organisation>/dossiers/<N°>/ */
export async function uploadDossierFile(
  file: File,
  organizationId: string,
  dossierNumber: string,
): Promise<StoredPhoto & { contentType: string }> {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileTooLargeError(file.size, MAX_UPLOAD_SIZE_BYTES)
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const known = Object.values(DOSSIER_FILE_TYPES)
  const contentType = file.type && known.includes(file.type) ? file.type : DOSSIER_FILE_TYPES[ext]
  if (!contentType) {
    throw new Error(`Format non accepté (${file.name}) : PDF, photo (JPG, PNG, HEIC), Excel ou Word.`)
  }

  const folder = sanitizeFilename(dossierNumber) || 'sans-numero'
  const path = `${organizationId}/dossiers/${folder}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`
  // Stockage privé : ouvert par lien temporaire, réservé aux administrateurs
  const stored = await uploadPrivateFile(path, file, { contentType })
  return { ...stored, contentType }
}
