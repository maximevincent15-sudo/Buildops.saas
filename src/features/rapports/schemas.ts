import { z } from 'zod'

export const checkValueSchema = z.enum(['ok', 'nok', 'na'])

export const photoSchema = z.object({
  path: z.string(),
  url: z.string(),
})

export type ReportPhoto = z.infer<typeof photoSchema>

export const recommendedActionSchema = z.enum([
  'replacement',
  'repair',
  'verification',
])
export type RecommendedAction = z.infer<typeof recommendedActionSchema>

export const checklistResponseSchema = z.object({
  id: z.string(),
  value: checkValueSchema.nullable(),
  note: z.string().optional(),
  // Pour les items NOK : photos et action recommandée obligatoires (V1 applique la règle côté UI)
  photos: z.array(photoSchema).optional(),
  action: recommendedActionSchema.optional(),
  // Si le tech ne peut vraiment pas prendre de photo, on exige un texte explicatif.
  noPhotoReason: z.string().optional(),
})

export type ChecklistResponse = z.infer<typeof checklistResponseSchema>

export const upsertReportSchema = z.object({
  checklist: z.array(checklistResponseSchema),
  // Contexte = quel type d'équipement contrôlé dans ce rapport. Un rapport
  // concerne 1 seul type à la fois même si l'intervention parent en a plusieurs.
  equipment_type: z.string().optional(),
  observations: z.string().optional(),
  signed_by_name: z.string().optional(),
  signature_data_url: z.string().nullable().optional(),
  photos: z.array(photoSchema).optional(),
})

export type UpsertReportInput = z.infer<typeof upsertReportSchema>

export type Report = {
  id: string
  intervention_id: string
  organization_id: string
  equipment_type: string | null
  checklist: ChecklistResponse[]
  observations: string | null
  signed_by_name: string | null
  signature_data_url: string | null
  photos: ReportPhoto[]
  pdf_url: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Helpers de synthèse (utilisés par l'app ET le PDF) ───

export const RECOMMENDED_ACTION_LABEL: Record<RecommendedAction, string> = {
  replacement: 'Remplacement',
  repair: 'Réparation',
  verification: 'Vérification',
}

export type ReportSummary = {
  answered: number
  total: number
  okCount: number
  nokCount: number
  naCount: number
  isConform: boolean | null // null si incomplet
}

export function computeReportSummary(
  responses: ChecklistResponse[],
  totalItems: number,
): ReportSummary {
  const ok = responses.filter((r) => r.value === 'ok').length
  const nok = responses.filter((r) => r.value === 'nok').length
  const na = responses.filter((r) => r.value === 'na').length
  const answered = ok + nok + na
  const isConform = answered === totalItems ? nok === 0 : null
  return {
    answered,
    total: totalItems,
    okCount: ok,
    nokCount: nok,
    naCount: na,
    isConform,
  }
}
