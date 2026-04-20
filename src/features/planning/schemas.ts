import { z } from 'zod'

export const createInterventionSchema = z.object({
  client_name: z.string().min(1, 'Client requis'),
  site_name: z.string().optional(),
  address: z.string().optional(),
  equipment_type: z.enum(['extincteurs', 'ria', 'desenfumage', 'ssi', 'extinction_auto']),
  scheduled_date: z.string().optional(),
  technician_name: z.string().optional(),
  priority: z.enum(['normale', 'urgente', 'reglementaire']),
  notes: z.string().optional(),
})

export type CreateInterventionInput = z.infer<typeof createInterventionSchema>

export type Intervention = {
  id: string
  organization_id: string
  reference: string
  client_name: string
  site_name: string | null
  address: string | null
  equipment_type: string
  technician_name: string | null
  scheduled_date: string | null
  priority: string
  status: string
  notes: string | null
  created_at: string
  created_by: string | null
}
