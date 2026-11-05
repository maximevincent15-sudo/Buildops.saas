import { AlertTriangle, Ban, CheckCircle2, Clock, Edit3, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled'
export type InvoiceKind = 'invoice' | 'credit_note'

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  partially_paid: 'Partiellement payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
}

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'b-gry',
  sent: 'b-org',
  paid: 'b-grn',
  partially_paid: 'b-org',
  overdue: 'b-red',
  cancelled: 'b-gry',
}

export const INVOICE_STATUS_ICON: Record<InvoiceStatus, LucideIcon> = {
  draft: Edit3,
  sent: Send,
  paid: CheckCircle2,
  partially_paid: Clock,
  overdue: AlertTriangle,
  cancelled: Ban,
}

export const PAYMENT_METHODS = [
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'cb', label: 'Carte bancaire' },
  { value: 'especes', label: 'Espèces' },
  { value: 'prelevement', label: 'Prélèvement' },
  { value: 'autre', label: 'Autre' },
] as const

/** Libellé du mode de règlement (les anciennes saisies libres restent telles quelles) */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return ''
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method
}

/** Calcule si une facture est en retard (à appeler côté client à chaque render). */
export function isOverdue(
  status: InvoiceStatus,
  dueDate: string | null,
  amountPaid: number,
  totalTtc: number,
): boolean {
  if (status === 'paid' || status === 'cancelled' || status === 'draft') return false
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  // Tolérance : 1 jour
  return due.getTime() < today.getTime() && amountPaid < totalTtc
}

export function effectiveStatus(
  status: InvoiceStatus,
  dueDate: string | null,
  amountPaid: number,
  totalTtc: number,
): InvoiceStatus {
  if (status === 'sent' && isOverdue(status, dueDate, amountPaid, totalTtc)) return 'overdue'
  return status
}

// ─── Numéro attribué à l'envoi, avoirs ─────────────────────────────

/** Référence provisoire d'un brouillon (le numéro définitif est donné à l'envoi) */
export const DRAFT_REFERENCE_PREFIX = 'BROUILLON-'

type DocLike = {
  reference: string
  kind?: InvoiceKind | null
  status: InvoiceStatus
  total_ttc: number | string
  credited_ttc?: number | string | null
  amount_paid?: number | string | null
  due_date: string | null
  sent_at?: string | null
}

export function hasFinalNumber(reference: string | null | undefined): boolean {
  return !!reference && !reference.startsWith(DRAFT_REFERENCE_PREFIX)
}

export function isCreditNote(doc: { kind?: InvoiceKind | null }): boolean {
  return doc.kind === 'credit_note'
}

/** Numéro affiché : « Brouillon » tant que le numéro n'est pas attribué */
export function displayReference(doc: { reference: string; kind?: InvoiceKind | null }): string {
  if (hasFinalNumber(doc.reference)) return doc.reference
  return isCreditNote(doc) ? 'Avoir en brouillon' : 'Brouillon'
}

/** Total TTC de la facture, avoirs déduits */
export function netTotalTtc(doc: { total_ttc: number | string; credited_ttc?: number | string | null }): number {
  return Math.round((Number(doc.total_ttc ?? 0) - Number(doc.credited_ttc ?? 0)) * 100) / 100
}

/** Reste à payer : total, moins les avoirs, moins les règlements */
export function remainingDue(doc: { total_ttc: number | string; credited_ttc?: number | string | null; amount_paid?: number | string | null }): number {
  return Math.max(0, Math.round((netTotalTtc(doc) - Number(doc.amount_paid ?? 0)) * 100) / 100)
}

/** Statut effectif d'une facture ou d'un avoir (retard calculé sur le total avoirs déduits) */
export function docEffectiveStatus(doc: DocLike): InvoiceStatus {
  if (isCreditNote(doc)) return doc.status === 'draft' ? 'draft' : 'sent'
  return effectiveStatus(doc.status, doc.due_date, Number(doc.amount_paid ?? 0), netTotalTtc(doc))
}

/** Libellé du statut : « Émis » pour un avoir, « Émise » pour une facture numérotée pas encore envoyée */
export function docStatusLabel(doc: DocLike, effective: InvoiceStatus = docEffectiveStatus(doc)): string {
  if (isCreditNote(doc)) return effective === 'draft' ? 'Brouillon' : 'Émis'
  if (effective === 'sent' && !doc.sent_at) return 'Émise'
  return INVOICE_STATUS_LABEL[effective]
}

/** Date d'échéance par défaut : J+30 */
export function defaultDueDate(issueDate: string): string {
  const d = new Date(issueDate)
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}
