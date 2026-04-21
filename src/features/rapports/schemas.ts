import { z } from 'zod'

export const checkValueSchema = z.enum(['ok', 'nok', 'na'])

export const checklistResponseSchema = z.object({
  id: z.string(),
  value: checkValueSchema.nullable(),
  note: z.string().optional(),
})

export type ChecklistResponse = z.infer<typeof checklistResponseSchema>

export const photoSchema = z.object({
  path: z.string(),
  url: z.string(),
})

export type ReportPhoto = z.infer<typeof photoSchema>

export const upsertReportSchema = z.object({
  checklist: z.array(checklistResponseSchema),
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
