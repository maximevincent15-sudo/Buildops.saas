import { z } from 'zod'
import { parseCompanyNumber } from './companyLookup'

export const createClientSchema = z.object({
  name: z.string().min(1, 'Nom du client requis'),
  // N° client (ex. C0001), proposé automatiquement et modifiable
  client_number: z.string().max(30, '30 caractères maximum').optional(),
  // SIREN (9) ou SIRET (14), optionnel — éclaté en siren / siret par l'API
  company_number: z.string().optional().superRefine((v, ctx) => {
    const p = parseCompanyNumber(v)
    if (!p.ok) ctx.addIssue({ code: 'custom', message: p.reason })
  }),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Email invalide').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateClientInput = z.infer<typeof createClientSchema> & {
  /** Hors formulaire (liste éditée à part dans la fiche) */
  extra_emails?: ClientEmailRecipient[]
}

/** Destinataire supplémentaire : reçoit les types de documents cochés */
export type ClientEmailRecipient = {
  email: string
  name?: string
  reports: boolean
  quotes: boolean
  invoices: boolean
}

export type Client = {
  id: string
  organization_id: string
  name: string
  /** N° client propre à l'entreprise (ex. C0001) */
  client_number: string | null
  siren: string | null
  siret: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
  /** Destinataires supplémentaires (contact_email reçoit tous les documents) */
  extra_emails: ClientEmailRecipient[]
  created_at: string
  created_by: string | null
}
