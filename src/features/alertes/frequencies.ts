import type { EquipmentType } from '../../shared/constants/interventions'

// Fréquences indicatives de contrôle réglementaire en jours.
// Basé sur les pratiques courantes en maintenance sécurité incendie FR.
// Note : dans la réalité, les obligations varient selon l'ERP, le code du
// travail, les spécifications constructeurs. Ces valeurs sont des défauts
// raisonnables à affiner par client dans une prochaine itération.
export const INSPECTION_FREQUENCIES_DAYS: Record<EquipmentType, number> = {
  extincteurs: 365,       // Annuel
  ria: 183,               // Semestriel (6 mois)
  desenfumage: 365,       // Annuel
  ssi: 365,               // Annuel
  extinction_auto: 365,   // Annuel
}

export const INSPECTION_FREQUENCIES_LABEL: Record<EquipmentType, string> = {
  extincteurs: 'Annuel',
  ria: 'Semestriel',
  desenfumage: 'Annuel',
  ssi: 'Annuel',
  extinction_auto: 'Annuel',
}
