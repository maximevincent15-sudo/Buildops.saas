import { z } from 'zod'
import { quoteLineInputSchema } from '../devis/schemas'
import type { QuoteLineInput } from '../devis/schemas'
import type { InvoiceStatus } from './constants'

// On réutilise tel quel le schema de ligne du devis (même structure).
export type InvoiceLineInput = QuoteLineInput

export const upsertInvoiceSchema = z.object({
  client_id: z.string().optional(),
  client_name: z.string().min(1, 'Client requis'),
  client_contact_name: z.string().optional(),
  client_address: z.string().optional(),
  client_email: z.string().optional(),
  intervention_id: z.string().optional(),
  quote_id: z.string().optional(),
  site_name: z.string().optional(),
  site_address: z.string().optional(),
  issue_date: z.string().min(1, 'Date d\'émission requise'),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(quoteLineInputSchema).min(1, 'Au moins une ligne'),
})

export type UpsertInvoiceInput = z.infer<typeof upsertInvoiceSchema>

export type Invoice = {
  id: string
  organization_id: string
  reference: string
  quote_id: string | null
  client_id: string | null
  client_name: string
  client_contact_name: string | null
  client_address: string | null
  client_email: string | null
  intervention_id: string | null
  site_name: string | null
  site_address: string | null
  issue_date: string
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  status: InvoiceStatus
  total_ht: number
  total_vat: number
  total_ttc: number
  amount_paid: number
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  pdf_url: string | null
  sent_to_email: string | null
  cancelled_at: string | null
  cancelled_reason: string | null
  created_at: string
  created_by: string | null
  updated_at: string
}

export type InvoiceLine = {
  id: string
  invoice_id: string
  position: number
  description: string
  quantity: number
  unit_price_ht: number
  vat_rate: number
  line_total_ht: number
  created_at: string
}

export type InvoiceWithLines = Invoice & {
  lines: InvoiceLine[]
}
