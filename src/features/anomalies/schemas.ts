import { z } from 'zod'

// ─── Constantes ──────────────────────────────────────────────

export const ANOMALY_ACTIONS = ['replacement', 'repair', 'verification'] as const
export type AnomalyAction = (typeof ANOMALY_ACTIONS)[number]

export const ANOMALY_ACTION_LABELS: Record<AnomalyAction, string> = {
  replacement: 'Remplacement',
  repair: 'Réparation',
  verification: 'Vérification',
}

export const ANOMALY_PRIORITIES = ['high', 'normal', 'low'] as const
export type AnomalyPriority = (typeof ANOMALY_PRIORITIES)[number]

export const ANOMALY_PRIORITY_LABELS: Record<AnomalyPriority, string> = {
  high: 'Haute',
  normal: 'Moyenne',
  low: 'Faible',
}

export const ANOMALY_STATUSES = ['open', 'planned', 'resolved', 'closed'] as const
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number]

export const ANOMALY_STATUS_LABELS: Record<AnomalyStatus, string> = {
  open: 'Ouverte',
  planned: 'Planifiée',
  resolved: 'Résolue',
  closed: 'Clôturée',
}

/** Une anomalie compte comme "active" tant qu'elle n'est pas résolue/clôturée. */
export const ACTIVE_ANOMALY_STATUSES: readonly AnomalyStatus[] = ['open', 'planned']

// ─── Photo (miroir report/checks) ────────────────────────────

export const anomalyPhotoSchema = z.object({
  path: z.string(),
  url: z.string(),
})
export type AnomalyPhoto = z.infer<typeof anomalyPhotoSchema>

// ─── Type complet Anomaly (miroir DB) ────────────────────────

export type Anomaly = {
  id: string
  organization_id: string
  equipment_unit_id: string | null
  intervention_id: string | null
  equipment_check_id: string | null

  title: string
  description: string | null
  checklist_item_id: string | null
  checklist_item_label: string | null

  action: AnomalyAction | null
  priority: AnomalyPriority
  status: AnomalyStatus

  due_date: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null

  photos: AnomalyPhoto[]

  detected_at: string
  detected_by: string | null
  detected_by_name: string | null

  created_at: string
  updated_at: string
  created_by: string | null
}

// ─── Input : création / mise à jour ─────────────────────────

/**
 * Schéma d'entrée pour la création d'une anomalie via un contrôle unitaire.
 * Le NOK doit fournir au minimum : titre, action, priorité (défauts sensés).
 */
export const createAnomalySchema = z.object({
  equipment_unit_id: z.string().uuid().nullable().optional(),
  intervention_id: z.string().uuid().nullable().optional(),
  equipment_check_id: z.string().uuid().nullable().optional(),

  title: z.string().trim().min(3, "Décris l'anomalie en quelques mots"),
  description: z.string().trim().optional().or(z.literal('')),
  checklist_item_id: z.string().trim().optional().or(z.literal('')),
  checklist_item_label: z.string().trim().optional().or(z.literal('')),

  action: z.enum(ANOMALY_ACTIONS).nullable().optional(),
  priority: z.enum(ANOMALY_PRIORITIES).default('normal'),

  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
    .nullable()
    .optional(),

  photos: z.array(anomalyPhotoSchema).default([]),

  detected_by_name: z.string().trim().optional().or(z.literal('')),
})
export type CreateAnomalyInput = z.infer<typeof createAnomalySchema>

/**
 * Schéma d'entrée pour mise à jour (patch partiel).
 */
export const updateAnomalySchema = createAnomalySchema.partial().extend({
  status: z.enum(ANOMALY_STATUSES).optional(),
  resolution_notes: z.string().trim().optional().or(z.literal('')),
})
export type UpdateAnomalyInput = z.infer<typeof updateAnomalySchema>

// ─── Helpers ────────────────────────────────────────────────

export function isActive(anomaly: Pick<Anomaly, 'status'>): boolean {
  return ACTIVE_ANOMALY_STATUSES.includes(anomaly.status)
}

/** Retourne 'overdue' | 'soon' | 'ok' | null selon due_date vs aujourd'hui. */
export function computeDueBucket(
  dueDate: string | null | undefined,
  today: Date = new Date(),
): 'overdue' | 'soon' | 'ok' | null {
  if (!dueDate) return null
  const due = new Date(`${dueDate}T00:00:00`)
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 7) return 'soon'
  return 'ok'
}
