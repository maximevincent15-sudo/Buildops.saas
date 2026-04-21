import { z } from 'zod'

export const createTechnicianSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis'),
  last_name: z.string().min(1, 'Nom requis'),
  email: z.string().email('Email invalide').or(z.literal('')).optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>

export type Technician = {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  role: string | null
  notes: string | null
  active: boolean
  created_at: string
  created_by: string | null
}

export function technicianFullName(t: Pick<Technician, 'first_name' | 'last_name'>): string {
  return `${t.first_name} ${t.last_name}`.trim()
}
