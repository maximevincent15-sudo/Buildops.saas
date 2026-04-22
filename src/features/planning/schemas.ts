import { z } from 'zod'

export const equipmentTypeEnum = z.enum([
  'extincteurs',
  'ria',
  'desenfumage',
  'ssi',
  'extinction_auto',
])

export const createInterventionSchema = z.object({
  client_name: z.string().min(1, 'Client requis'),
  client_id: z.string().optional(),
  site_name: z.string().optional(),
  address: z.string().optional(),
  equipment_types: z
    .array(equipmentTypeEnum)
    .min(1, 'Au moins un type d\'équipement'),
  scheduled_date: z.string().optional(),
  technician_name: z.string().optional(),
  technician_id: z.string().optional(),
  priority: z.enum(['normale', 'urgente', 'reglementaire']),
  notes: z.string().optional(),
})

export type CreateInterventionInput = z.infer<typeof createInterventionSchema>

export type Intervention = {
  id: string
  organization_id: string
  reference: string
  client_name: string
  client_id: string | null
  site_name: string | null
  address: string | null
  /** @deprecated ancienne colonne (un seul type). Utiliser equipment_types. */
  equipment_type: string | null
  /** Array de types d'équipement (extincteurs, ria, desenfumage, ssi, extinction_auto). */
  equipment_types: string[]
  technician_name: string | null
  technician_id: string | null
  scheduled_date: string | null
  priority: string
  status: string
  notes: string | null
  created_at: string
  created_by: string | null
}

// Helper : normalise une intervention venant de Supabase (gère le cas legacy
// où `equipment_types` est null parce que l'enregistrement est antérieur à la
// migration). À utiliser sur tous les résultats Supabase.
export function normalizeIntervention(raw: Intervention): Intervention {
  let types = raw.equipment_types
  if (!types || types.length === 0) {
    types = raw.equipment_type ? [raw.equipment_type] : []
  }
  return { ...raw, equipment_types: types }
}
