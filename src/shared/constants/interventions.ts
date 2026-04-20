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
