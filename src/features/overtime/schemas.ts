import { z } from 'zod'
import type { OvertimeStatus, OvertimeType } from './constants'

export const createOvertimeSchema = z.object({
  technician_id: z.string().min(1, 'Technicien requis'),
  worked_on: z.string().min(1, 'Date requise'),
  hours: z.number().positive('Heures requises').max(24, 'Max 24h par ligne'),
  type: z.enum(['standard', 'sunday_holiday', 'night']),
  description: z.string().optional(),
})

export type CreateOvertimeInput = z.infer<typeof createOvertimeSchema>

export type Overtime = {
  id: string
  organization_id: string
  technician_id: string | null
  technician_name: string
  worked_on: string
  hours: number
  type: OvertimeType
  description: string | null
  status: OvertimeStatus
  rejection_reason: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  created_by: string | null
}
