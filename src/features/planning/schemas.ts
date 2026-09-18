import { z } from 'zod'

export const equipmentTypeEnum = z.enum([
  'extincteurs',
  'ria',
  'desenfumage',
  'ssi',
  'extinction_auto',
])

export const slotEnum = z.enum(['morning', 'afternoon', 'fullday', 'multiday'])
export type Slot = z.infer<typeof slotEnum>

export const INTERVENTION_TYPES = [
  'preventive',
  'corrective',
  'installation',
  'depannage',
  'verification_contrat',
  'autre',
] as const
export type InterventionType = (typeof INTERVENTION_TYPES)[number]

export const INTERVENTION_TYPE_LABELS: Record<InterventionType, string> = {
  preventive: 'Maintenance préventive',
  corrective: 'Maintenance corrective',
  installation: 'Installation',
  depannage: 'Dépannage',
  verification_contrat: 'Vérification contractuelle',
  autre: 'Autre',
}

export const createInterventionSchema = z.object({
  client_name: z.string().min(1, 'Client requis'),
  client_id: z.string().optional(),
  site_name: z.string().optional(),
  site_id: z.string().uuid().optional().nullable(),
  address: z.string().optional(),
  equipment_types: z
    .array(equipmentTypeEnum)
    .min(1, 'Au moins un type d\'équipement'),
  scheduled_date: z.string().optional(),
  technician_name: z.string().optional(),
  technician_id: z.string().optional(),
  priority: z.enum(['normale', 'urgente', 'reglementaire']),
  intervention_type: z.enum(INTERVENTION_TYPES).optional(),
  notes: z.string().optional(),
  // Optional côté form (checkbox non contrôlée). Default true géré dans toDbPayload.
  recurrence_active: z.boolean().optional(),

  // ─── Localisation chantier (parfois ≠ adresse siège du client) ───
  chantier_address: z.string().optional(),
  chantier_postal_code: z.string().optional(),
  chantier_city: z.string().optional(),
  chantier_contact_name: z.string().optional(),
  chantier_contact_phone: z.string().optional(),

  // ─── Modalités d'accès ───
  chantier_access_parking: z.string().optional(),
  chantier_access_digicode: z.string().optional(),
  chantier_access_building: z.string().optional(),
  chantier_access_hours: z.string().optional(),

  // ─── Planning détaillé ───
  slot: slotEnum.optional().nullable(),
  start_time: z.string().optional(), // "HH:MM"
  duration_minutes: z.number().int().min(30).optional().nullable(),

  // ─── Zones concernées ───
  zone_ids: z.array(z.string().uuid()).optional(),

  // ─── Matériel & recommandations ───
  material_needed: z.array(z.string()).optional(),
  recommendations: z.string().optional(),
})

export type CreateInterventionInput = z.infer<typeof createInterventionSchema>

export type Intervention = {
  id: string
  organization_id: string
  reference: string
  client_name: string
  client_id: string | null
  site_name: string | null
  site_id: string | null
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
  intervention_type: InterventionType
  notes: string | null
  created_at: string
  created_by: string | null
  /** Référence vers l'intervention dont celle-ci est la suite automatique (visite récurrente). */
  parent_intervention_id: string | null
  /** true si l'intervention a été créée automatiquement par le système de maintenance préventive. */
  auto_generated: boolean
  /** Si true, la clôture du rapport de cette intervention crée automatiquement la prochaine visite. Passer à false pour un one-shot. */
  recurrence_active: boolean

  // ─── Localisation chantier & modalités d'accès ───
  chantier_address: string | null
  chantier_postal_code: string | null
  chantier_city: string | null
  chantier_contact_name: string | null
  chantier_contact_phone: string | null
  chantier_access_parking: string | null
  chantier_access_digicode: string | null
  chantier_access_building: string | null
  chantier_access_hours: string | null

  // ─── Planning détaillé ───
  slot: Slot | null
  start_time: string | null
  duration_minutes: number | null

  // ─── Zones + matériel + recommandations ───
  zone_ids: string[] | null
  material_needed: string[]
  recommendations: string | null
}

// Helper : normalise une intervention venant de Supabase (gère le cas legacy
// où `equipment_types` est null parce que l'enregistrement est antérieur à la
// migration). À utiliser sur tous les résultats Supabase.
export function normalizeIntervention(raw: Intervention): Intervention {
  let types = raw.equipment_types
  if (!types || types.length === 0) {
    types = raw.equipment_type ? [raw.equipment_type] : []
  }
  // material_needed peut être null pour les anciennes lignes ; default = []
  const material = Array.isArray(raw.material_needed) ? raw.material_needed : []
  // intervention_type peut être null pour les anciennes lignes → 'preventive' par défaut
  const type: InterventionType =
    (raw.intervention_type && INTERVENTION_TYPES.includes(raw.intervention_type))
      ? raw.intervention_type
      : 'preventive'
  return {
    ...raw,
    equipment_types: types,
    material_needed: material,
    intervention_type: type,
  }
}
