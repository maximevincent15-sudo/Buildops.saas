import { supabase } from './supabase'

const BUCKET = 'report-photos'

export type StoredPhoto = {
  path: string
  url: string
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
