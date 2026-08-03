import { supabase } from '../../shared/lib/supabase'
import { FileTooLargeError, MAX_UPLOAD_SIZE_BYTES } from '../../shared/lib/storage'

const BUCKET = 'report-photos' // Réutilisé (accepte PDF + size limit 10 Mo)

export type LegacyKind = 'report' | 'quote' | 'invoice'

export interface LegacyDocument {
  id: string
  organization_id: string
  kind: LegacyKind
  reference: string
  document_date: string
  client_name: string
  site_name: string | null
  pdf_url: string
  pdf_filename: string | null
  amount_ttc: number | null
  notes: string | null
  imported_at: string
  imported_by: string | null
}

export interface CreateLegacyDocInput {
  kind: LegacyKind
  reference: string
  document_date: string
  client_name: string
  site_name?: string
  amount_ttc?: number
  notes?: string
  file: File
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 80)
}

/**
 * Upload d'un PDF historique + création de l'entrée en base.
 * Fait les 2 opérations en séquence, rollback storage si insert échoue.
 */
export async function importLegacyDocument(
  input: CreateLegacyDocInput,
  organizationId: string,
): Promise<LegacyDocument> {
  const { file } = input

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileTooLargeError(file.size, MAX_UPLOAD_SIZE_BYTES)
  }
  if (file.type && file.type !== 'application/pdf') {
    throw new Error(`Fichier PDF requis (reçu : ${file.type})`)
  }

  const safeName = sanitizeFilename(file.name)
  const path = `${organizationId}/legacy/${input.kind}/${crypto.randomUUID()}-${safeName}`

  // 1. Upload PDF
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: 'application/pdf',
  })
  if (upErr) throw upErr

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // 2. Insert DB
  const { data, error } = await supabase
    .from('legacy_documents')
    .insert({
      organization_id: organizationId,
      kind: input.kind,
      reference: input.reference.trim(),
      document_date: input.document_date,
      client_name: input.client_name.trim(),
      site_name: input.site_name?.trim() || null,
      pdf_url: urlData.publicUrl,
      pdf_filename: file.name,
      amount_ttc: input.amount_ttc ?? null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single()

  // Rollback storage si insert échoue
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    throw error
  }

  return data as LegacyDocument
}

export async function listLegacyDocuments(): Promise<LegacyDocument[]> {
  const { data, error } = await supabase
    .from('legacy_documents')
    .select('*')
    .order('document_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as LegacyDocument[]
}

export async function deleteLegacyDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from('legacy_documents')
    .delete()
    .eq('id', id)
  if (error) throw error
}
