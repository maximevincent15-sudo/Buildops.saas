import { supabase } from '../../shared/lib/supabase'
import { cleanLineFormat } from '../../shared/lib/lineFormat'
import type { LineFormat } from '../../shared/lib/lineFormat'
import { removeStoredFile } from '../../shared/lib/privateFiles'
import { normalizeSearch } from '../../shared/lib/search'
import type { DeliveryMode, DeliveryNote, DeliveryNoteLine, DeliveryNoteWithLines, QuoteWithLines } from './schemas'

/** Bons de livraison d'un devis, du plus ancien au plus récent, avec leurs lignes */
export async function listDeliveryNotes(quoteId: string): Promise<DeliveryNoteWithLines[]> {
  const { data: notes, error } = await supabase
    .from('delivery_notes')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const list = (notes ?? []) as DeliveryNote[]
  if (list.length === 0) return []
  const { data: lines, error: lErr } = await supabase
    .from('delivery_note_lines')
    .select('*')
    .in('delivery_note_id', list.map((n) => n.id))
    .order('position', { ascending: true })
  if (lErr) throw lErr
  const byNote = new Map<string, DeliveryNoteLine[]>()
  for (const l of (lines ?? []) as DeliveryNoteLine[]) {
    byNote.set(l.delivery_note_id, [...(byNote.get(l.delivery_note_id) ?? []), l])
  }
  return list.map((n) => ({ ...n, lines: byNote.get(n.id) ?? [] }))
}

export type DeliveryLineInput = {
  quote_position: number
  description: string
  format?: LineFormat | null
  quantity: number
}

export type CreateDeliveryNoteInput = {
  quote: QuoteWithLines
  delivery_date: string
  mode: DeliveryMode
  observations: string | null
  lines: DeliveryLineInput[]
  signature: { name: string; dataUrl: string } | null
}

/** Crée le bon de livraison (numéro attribué par la base) puis ses lignes */
export async function createDeliveryNote(input: CreateDeliveryNoteInput, organizationId: string): Promise<DeliveryNoteWithLines> {
  const { quote } = input
  const { data: auth } = await supabase.auth.getUser()
  const { data: note, error } = await supabase
    .from('delivery_notes')
    .insert({
      organization_id: organizationId,
      quote_id: quote.id,
      delivery_date: input.delivery_date,
      mode: input.mode,
      quote_reference: quote.reference,
      order_reference: quote.order_reference ?? null,
      client_name: quote.client_name,
      client_contact_name: quote.client_contact_name,
      client_address: quote.client_address,
      site_name: quote.site_name,
      site_address: quote.site_address,
      dossier_number: quote.dossier_number,
      observations: input.observations,
      signed_by_name: input.signature?.name ?? null,
      signature_data_url: input.signature?.dataUrl ?? null,
      signed_at: input.signature ? new Date().toISOString() : null,
      created_by: auth.user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  const created = note as DeliveryNote
  // Sans réseau, la création serait mise en attente sans numéro : on ne fait pas de BL sans numéro
  if (!created.reference) {
    await supabase.from('delivery_notes').delete().eq('id', created.id)
    throw new Error('Réseau trop faible : le bon de livraison n\'a pas pu être créé. Réessayez avec du réseau.')
  }
  const payload = input.lines.map((l, i) => ({
    delivery_note_id: created.id,
    organization_id: organizationId,
    quote_position: l.quote_position,
    position: i,
    description: l.description.trim(),
    format: cleanLineFormat(l.format),
    quantity: l.quantity,
  }))
  const { data: lines, error: lErr } = await supabase.from('delivery_note_lines').insert(payload).select()
  if (lErr) {
    await supabase.from('delivery_notes').delete().eq('id', created.id)
    throw lErr
  }
  return { ...created, lines: ((lines ?? []) as DeliveryNoteLine[]).sort((a, b) => a.position - b.position) }
}

/** Signature d'un bon créé sans signature (imprimé, ou signé plus tard) */
export async function signDeliveryNote(id: string, signature: { name: string; dataUrl: string }): Promise<string> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('delivery_notes')
    .update({ signed_by_name: signature.name, signature_data_url: signature.dataUrl, signed_at: now })
    .eq('id', id)
  if (error) throw error
  return now
}

export async function setDeliveryNotePdfUrl(id: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase.from('delivery_notes').update({ pdf_url: pdfUrl }).eq('id', id)
  if (error) throw error
}

export async function markDeliveryNoteSent(id: string): Promise<string> {
  const now = new Date().toISOString()
  const { error } = await supabase.from('delivery_notes').update({ sent_at: now }).eq('id', id)
  if (error) throw error
  return now
}

/** Supprime un bon non signé (fiche puis PDF) */
export async function deleteDeliveryNote(note: Pick<DeliveryNote, 'id' | 'pdf_url' | 'signed_at'>): Promise<void> {
  if (note.signed_at) throw new Error('Un bon de livraison signé ne peut pas être supprimé.')
  const { error } = await supabase.from('delivery_notes').delete().eq('id', note.id)
  if (error) throw error
  await removeStoredFile(note.pdf_url).catch(() => {})
}

// ─── Reste à livrer ────────────────────────────────────────

export type LineDelivery = { ordered: number; delivered: number; remaining: number }

const round2 = (n: number) => Math.round(n * 100) / 100
const lineKey = (description: string) => normalizeSearch(description.replace(/\s+/g, ' ').trim())

/**
 * Quantités déjà livrées par ligne du devis. Les lignes du devis sont
 * recréées à chaque modification : on les reconnaît par leur désignation.
 * Deux lignes identiques se partagent les quantités livrées, dans l'ordre.
 */
export function deliveryProgress(
  lines: Array<{ description: string; quantity: number }>,
  notes: Array<Pick<DeliveryNoteWithLines, 'lines'>>,
): LineDelivery[] {
  const pool = new Map<string, number>()
  for (const n of notes) {
    for (const l of n.lines) {
      const k = lineKey(l.description)
      pool.set(k, round2((pool.get(k) ?? 0) + Number(l.quantity)))
    }
  }
  return lines.map((l) => {
    const k = lineKey(l.description)
    const ordered = Number(l.quantity)
    const available = pool.get(k) ?? 0
    const delivered = round2(Math.min(available, ordered))
    pool.set(k, round2(available - delivered))
    return { ordered, delivered, remaining: round2(Math.max(0, ordered - delivered)) }
  })
}
