export const EQUIPMENT_TYPES = {
  extincteurs: 'Extincteurs',
  ria: 'RIA',
  desenfumage: 'Désenfumage',
  ssi: 'SSI / Alarme incendie',
  extinction_auto: 'Extinction automatique',
} as const

export type EquipmentType = keyof typeof EQUIPMENT_TYPES

export const INTERVENTION_STATUSES = {
  a_planifier: 'À planifier',
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  brouillon: 'Brouillon',
} as const

export type InterventionStatus = keyof typeof INTERVENTION_STATUSES

export const STATUS_BADGE_CLASSES: Record<InterventionStatus, string> = {
  a_planifier: 'b-red',
  planifiee: 'b-org',
  en_cours: 'b-org',
  terminee: 'b-grn',
  brouillon: 'b-gry',
}

export const INTERVENTION_PRIORITIES = {
  normale: 'Normale',
  urgente: 'Urgente',
  reglementaire: 'Réglementaire — échéance proche',
} as const

export type InterventionPriority = keyof typeof INTERVENTION_PRIORITIES

type EquipmentInput =
  | string[]
  | string
  | null
  | undefined
  | {
      equipment_types?: string[] | null
      equipment_type?: string | null
    }

function toArray(input: EquipmentInput): string[] {
  if (!input) return []
  if (Array.isArray(input)) return input
  if (typeof input === 'string') return [input]
  if (input.equipment_types && input.equipment_types.length > 0) {
    return input.equipment_types
  }
  return input.equipment_type ? [input.equipment_type] : []
}

/**
 * Formate une liste de types d'équipement pour l'affichage.
 * Accepte : array, string, objet avec equipment_types/equipment_type.
 */
export function formatEquipmentTypes(input: EquipmentInput): string {
  const arr = toArray(input)
  if (arr.length === 0) return '—'
  return arr
    .map((t) => EQUIPMENT_TYPES[t as EquipmentType] ?? t)
    .join(' + ')
}

/**
 * Version courte quand la place manque dans un tableau ou une card.
 */
export function formatEquipmentTypesShort(
  input: EquipmentInput,
  maxInline = 2,
): string {
  const arr = toArray(input)
  if (arr.length === 0) return '—'
  if (arr.length <= maxInline) return formatEquipmentTypes(arr)
  const first = EQUIPMENT_TYPES[arr[0] as EquipmentType] ?? arr[0]
  return `${first} + ${arr.length - 1} autre${arr.length - 1 > 1 ? 's' : ''}`
}

/**
 * Résout le tableau effectif, en tombant sur le legacy `equipment_type` si besoin.
 */
export function resolveEquipmentTypes(input: {
  equipment_types?: string[] | null
  equipment_type?: string | null
}): string[] {
  return toArray(input)
}
