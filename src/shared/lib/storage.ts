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
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileTooLargeError(file.size, MAX_UPLOAD_SIZE_BYTES)
  }

  const safeName = sanitizeFilename(file.name)
  const uniquePrefix = crypto.randomUUID()
  const path = `${organizationId}/interventions/${interventionId}/${uniquePrefix}-${safeName}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function deleteReportPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
