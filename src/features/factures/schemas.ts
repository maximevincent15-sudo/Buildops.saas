import { z } from 'zod'
import { quoteLineInputSchema } from '../devis/schemas'
import type { QuoteLineInput } from '../devis/schemas'
import type { LineFormat } from '../../shared/lib/lineFormat'
import type { InvoiceKind, InvoiceStatus } from './constants'

// Même structure que la ligne de devis, plus le lien d'une déduction d'acompte.
export type InvoiceLineInput = QuoteLineInput & {
  /** Ligne de déduction d'un acompte déjà facturé (montant négatif) */
  deposit_invoice_id?: string | null
}

export const upsertInvoiceSchema = z.object({
  client_id: z.string().optional(),
  client_name: z.string().min(1, 'Client requis'),
  client_contact_name: z.string().optional(),
  client_address: z.string().optional(),
  client_siren: z.string().optional(),
  client_email: z.string().optional(),
  intervention_id: z.string().optional(),
  quote_id: z.string().optional(),
  site_name: z.string().optional(),
  site_address: z.string().optional(),
  /** N° de dossier du chantier (repris du site) */
  dossier_number: z.string().optional(),
  issue_date: z.string().min(1, 'Date d\'émission requise'),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(quoteLineInputSchema).min(1, 'Au moins une ligne'),
})

export type UpsertInvoiceInput = Omit<z.infer<typeof upsertInvoiceSchema>, 'lines'> & { lines: InvoiceLineInput[] }

export type Invoice = {
  id: string
  organization_id: string
  reference: string
  quote_id: string | null
  client_id: string | null
  client_name: string
  client_contact_name: string | null
  client_address: string | null
  client_siren: string | null
  client_email: string | null
  intervention_id: string | null
  site_name: string | null
  site_address: string | null
  dossier_number: string | null
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
  /** Contrat de maintenance d'origine (« Facturer le mois ») */
  contract_id?: string | null
  contract_period_start?: string | null
  /** Facture ou avoir (montants de l'avoir en positif) */
  kind?: InvoiceKind
  /** Avoir : facture qu'il crédite */
  credited_invoice_id?: string | null
  /** Facture : total des avoirs émis sur elle (posé par la base) */
  credited_ht?: number
  credited_ttc?: number
  /** Facture d'acompte (déduite ensuite de la facture finale du devis) */
  is_deposit?: boolean
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
  format?: LineFormat | null
  /** Déduction d'un acompte déjà facturé */
  deposit_invoice_id?: string | null
  created_at: string
}

export type InvoiceWithLines = Invoice & {
  lines: InvoiceLine[]
}
