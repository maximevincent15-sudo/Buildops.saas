import { z } from 'zod'

export const createVehicleSchema = z.object({
  license_plate: z.string().min(1, 'Plaque requise').max(20),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1950).max(2100).optional(),
  mileage: z.number().int().min(0).optional(),
  technician_id: z.string().optional(),
  next_mot_date: z.string().optional(),
  next_insurance_date: z.string().optional(),
  next_service_date: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>

export type Vehicle = {
  id: string
  organization_id: string
  technician_id: string | null
  license_plate: string
  brand: string | null
  model: string | null
  year: number | null
  mileage: number | null
  next_mot_date: string | null
  next_insurance_date: string | null
  next_service_date: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}
