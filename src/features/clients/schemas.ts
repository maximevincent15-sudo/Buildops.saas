import { z } from 'zod'

export const createClientSchema = z.object({
  name: z.string().min(1, 'Nom du client requis'),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Email invalide').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateClientInput = z.infer<typeof createClientSchema>

export type Client = {
  id: string
  organization_id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}
