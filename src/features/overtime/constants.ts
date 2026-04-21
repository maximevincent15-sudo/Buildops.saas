import { Clock, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type OvertimeType = 'standard' | 'sunday_holiday' | 'night'

export const OVERTIME_TYPES: OvertimeType[] = ['standard', 'sunday_holiday', 'night']

export const OVERTIME_TYPE_LABEL: Record<OvertimeType, string> = {
  standard: 'Heure sup standard',
  sunday_holiday: 'Dimanche / férié',
  night: 'Nuit',
}

export const OVERTIME_TYPE_SHORT: Record<OvertimeType, string> = {
  standard: 'Standard',
  sunday_holiday: 'Dim/férié',
  night: 'Nuit',
}

export const OVERTIME_TYPE_ICON: Record<OvertimeType, LucideIcon> = {
  standard: Clock,
  sunday_holiday: Sun,
  night: Moon,
}

// Majoration indicative (référence Convention collective bâtiment 1-10 salariés)
// L'expert-comptable peut appliquer sa propre majoration — ces valeurs sont
// affichées à titre informatif dans le modal pour aider la saisie.
export const OVERTIME_TYPE_HINT: Record<OvertimeType, string> = {
  standard: 'Ex : heures au-delà de 35h/semaine',
  sunday_holiday: 'Dimanche travaillé, jour férié',
  night: 'Travail de nuit (21h–6h selon convention)',
}

export type OvertimeStatus = 'pending' | 'approved' | 'rejected'

export function formatHours(h: number): string {
  const hours = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  if (minutes === 0) return `${hours}h`
  return `${hours}h${String(minutes).padStart(2, '0')}`
}
