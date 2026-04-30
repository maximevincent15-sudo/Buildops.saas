import { AlertTriangle, Ban, CheckCircle2, Clock, Edit3, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled'

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

/** Date d'échéance par défaut : J+30 */
export function defaultDueDate(issueDate: string): string {
  const d = new Date(issueDate)
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}
