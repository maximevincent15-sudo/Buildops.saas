import type { EquipmentType } from '../../shared/constants/interventions'

export type ChecklistItem = {
  id: string
  label: string
  helper?: string
}

export type CheckValue = 'ok' | 'nok' | 'na'

// Checklists prédéfinies par type d'équipement.
// Source : pratiques courantes maintenance sécurité incendie FR.
// À affiner avec de vrais professionnels du secteur.
export const CHECKLISTS: Record<EquipmentType, ChecklistItem[]> = {
  extincteurs: [
    { id: 'emplacement', label: "Présence au bon emplacement" },
    { id: 'etat_general', label: "État général (corrosion, chocs)" },
    { id: 'plombage', label: "Plombage intact" },
    { id: 'manometre', label: "Manomètre en zone verte", helper: "Types ABC / eau pulvérisée" },
    { id: 'etiquette', label: "Étiquette d'identification lisible" },
    { id: 'peremption', label: "Date de péremption non dépassée" },
    { id: 'acces', label: "Accès dégagé" },
    { id: 'support', label: "Support mural solide" },
  ],
  ria: [
    { id: 'devidoir', label: "Intégrité du dévidoir" },
    { id: 'pression', label: "Pression d'eau suffisante" },
    { id: 'raccord', label: "Raccord en bon état" },
    { id: 'tuyau', label: "Tuyau sans coupure ni craquelure" },
    { id: 'accessibilite', label: "Accessibilité dégagée" },
    { id: 'signaletique', label: "Signalétique visible" },
    { id: 'fuite', label: "Absence de fuite" },
  ],
  desenfumage: [
    { id: 'trappes', label: "Trappes de désenfumage fonctionnelles" },
    { id: 'commandes', label: "Commandes d'ouverture manuelle accessibles" },
    { id: 'obstruction', label: "Absence d'obstruction" },
    { id: 'test_declenchement', label: "Essai de déclenchement réussi" },
    { id: 'ventilateurs', label: "Ventilateurs opérationnels", helper: "Si présents" },
  ],
  ssi: [
    { id: 'centrale', label: "Centrale SSI opérationnelle, sans alarme active" },
    { id: 'detecteurs', label: "Test fonctionnel des détecteurs incendie" },
    { id: 'declencheurs', label: "Test des déclencheurs manuels (échantillon)" },
    { id: 'evacuation', label: "Évacuation sonore audible partout" },
    { id: 'batterie', label: "Autonomie batterie conforme" },
    { id: 'signaletique', label: "Signalétique d'évacuation visible" },
  ],
  extinction_auto: [
    { id: 'pression_canalisations', label: "Pression des canalisations OK" },
    { id: 'vannes', label: "Vannes en position correcte" },
    { id: 'test_sectionnel', label: "Test sectionnel réussi" },
    { id: 'diffuseurs', label: "État des diffuseurs" },
    { id: 'reserve', label: "Réserve d'agent extincteur pleine" },
  ],
}
