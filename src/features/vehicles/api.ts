import { supabase } from '../../shared/lib/supabase'
import type { VehicleCheckType } from './constants'
import type { CreateVehicleInput, Vehicle } from './schemas'

export async function createVehicle(
  input: CreateVehicleInput,
  organizationId: string,
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      organization_id: organizationId,
      technician_id: input.technician_id || null,
      license_plate: input.license_plate.toUpperCase().trim(),
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      year: input.year ?? null,
      mileage: input.mileage ?? null,
      next_mot_date: input.next_mot_date || null,
      next_insurance_date: input.next_insurance_date || null,
      next_service_date: input.next_service_date || null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Vehicle
}

export async function updateVehicle(
  id: string,
  input: CreateVehicleInput,
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      technician_id: input.technician_id || null,
      license_plate: input.license_plate.toUpperCase().trim(),
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      year: input.year ?? null,
      mileage: input.mileage ?? null,
      next_mot_date: input.next_mot_date || null,
      next_insurance_date: input.next_insurance_date || null,
      next_service_date: input.next_service_date || null,
      notes: input.notes?.trim() || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Vehicle
}

export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('license_plate', { ascending: true })
  if (error) throw error
  return (data ?? []) as Vehicle[]
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────
// ALERTES : une ligne par échéance (CT, assurance, vidange)
// ─────────────────────────────────────────────────────────────

export type VehicleAlert = {
  key: string
  vehicleId: string
  licensePlate: string
  brand: string | null
  model: string | null
  technicianId: string | null
  technicianName: string | null
  type: VehicleCheckType
  dueDate: string
  daysUntilDue: number
}

type VehicleWithTech = Vehicle & {
  technician: { id: string; first_name: string; last_name: string; active: boolean } | null
}

export async function computeVehicleAlerts(): Promise<VehicleAlert[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, technician:technicians(id, first_name, last_name, active)')
  if (error) throw error

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()

  const alerts: VehicleAlert[] = []
  const rows = (data ?? []) as unknown as VehicleWithTech[]

  for (const v of rows) {
    const techName = v.technician
      ? `${v.technician.first_name} ${v.technician.last_name}`
      : null
    const techId = v.technician?.id ?? null

    const checks: Array<{ type: VehicleCheckType; date: string | null }> = [
      { type: 'mot', date: v.next_mot_date },
      { type: 'insurance', date: v.next_insurance_date },
      { type: 'service', date: v.next_service_date },
    ]

    for (const { type, date } of checks) {
      if (!date) continue
      const due = new Date(date)
      due.setHours(0, 0, 0, 0)
      const days = Math.floor((due.getTime() - todayMs) / (24 * 60 * 60 * 1000))
      alerts.push({
        key: `${v.id}-${type}`,
        vehicleId: v.id,
        licensePlate: v.license_plate,
        brand: v.brand,
        model: v.model,
        technicianId: techId,
        technicianName: techName,
        type,
        dueDate: date,
        daysUntilDue: days,
      })
    }
  }

  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}
