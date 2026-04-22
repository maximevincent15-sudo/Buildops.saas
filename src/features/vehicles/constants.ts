import { ShieldCheck, Wrench, Gauge } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type VehicleCheckType = 'mot' | 'insurance' | 'service'

export const VEHICLE_CHECK_LABEL: Record<VehicleCheckType, string> = {
  mot: 'Contrôle technique',
  insurance: 'Assurance',
  service: 'Vidange / entretien',
}

export const VEHICLE_CHECK_SHORT: Record<VehicleCheckType, string> = {
  mot: 'CT',
  insurance: 'Assurance',
  service: 'Vidange',
}

export const VEHICLE_CHECK_ICON: Record<VehicleCheckType, LucideIcon> = {
  mot: Gauge,
  insurance: ShieldCheck,
  service: Wrench,
}

export function formatPlate(plate: string): string {
  // Format FR : AB-123-CD → on met en majuscules et on s'assure des tirets
  const clean = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (clean.length === 7) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`
  }
  return plate.toUpperCase()
}
