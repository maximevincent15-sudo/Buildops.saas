import { z } from 'zod'
import type { QuoteStatus } from './constants'

export const quoteLineInputSchema = z.object({
  /** id existant pour update, undefined pour nouvelle ligne */
  id: z.string().optional(),
  position: z.number().int().min(0),
  description: z.string().min(1, 'Description requise'),
  quantity: z.number().positive(),
  unit_price_ht: z.number().min(0),
  vat_rate: z.number().min(0).max(100),
})

export type QuoteLineInput = z.infer<typeof quoteLineInputSchema>

export const upsertQuoteSchema = z.object({
  client_id: z.string().optional(),
  client_name: z.string().min(1, 'Client requis'),
  client_contact_name: z.string().optional(),
  client_address: z.string().optional(),
  client_email: z.string().optional(),
  intervention_id: z.string().optional(),
  site_name: z.string().optional(),
  site_address: z.string().optional(),
  issue_date: z.string().min(1, 'Date d\'émission requise'),
  validity_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(quoteLineInputSchema).min(1, 'Au moins une ligne'),
})

export type UpsertQuoteInput = z.infer<typeof upsertQuoteSchema>

export type Quote = {
  id: string
  organization_id: string
  reference: string
  client_id: string | null
  client_name: string
  client_contact_name: string | null
  client_address: string | null
  client_email: string | null
  intervention_id: string | null
  site_name: string | null
  site_address: string | null
  issue_date: string
  validity_date: string | null
  sent_at: string | null
  accepted_at: string | null
  refused_at: string | null
  refused_reason: string | null
  status: QuoteStatus
  total_ht: number
  total_vat: number
  total_ttc: number
  notes: string | null
  pdf_url: string | null
  sent_to_email: string | null
  created_at: string
  created_by: string | null
  updated_at: string
}

export type QuoteLine = {
  id: string
  quote_id: string
  position: number
  description: string
  quantity: number
  unit_price_ht: number
  vat_rate: number
  line_total_ht: number
  created_at: string
}

export type QuoteWithLines = Quote & {
  lines: QuoteLine[]
}
