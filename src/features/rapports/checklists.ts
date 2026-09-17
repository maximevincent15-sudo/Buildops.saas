import type { EquipmentType } from '../../shared/constants/interventions'

export type ChecklistItem = {
  id: string
  label: string
  helper?: string
}

export type CheckValue = 'ok' | 'nok' | 'na'

// Checklists métier détaillées par type d'équipement, alignées sur les
// vrais référentiels sectoriels français. Miroir de la migration
// 20260917140000_seed_family_templates_v2.sql (single source of truth
// côté DB pour les nouvelles familles ; ici les 5 familles historiques
// utilisées par le vieux flux <ChecklistSection>).
export const CHECKLISTS: Record<EquipmentType, ChecklistItem[]> = {
  // Extincteurs — APSAD R4 · NF EN 3 — 15 items
  extincteurs: [
    { id: 'emplacement', label: "Emplacement conforme au plan de sécurité" },
    { id: 'signaletique', label: "Signalisation présente et lisible (pictogramme, hauteur)" },
    { id: 'accessibilite', label: "Accessibilité dégagée (aucun obstacle 1 m devant)" },
    { id: 'fixation', label: "Fixation murale solide, support intact" },
    { id: 'etat_general', label: "État général du corps (absence corrosion, chocs, déformation)" },
    { id: 'etiquette_id', label: "Étiquette d'identification lisible (marque, modèle, date fabrication)" },
    { id: 'plombage', label: "Plombage de sécurité intact" },
    { id: 'goupille', label: "Goupille de sécurité présente et libre" },
    { id: 'manometre', label: "Manomètre en zone verte (pression conforme)", helper: "Pour appareils à pression permanente uniquement" },
    { id: 'pesee', label: "Poids ou pesée conforme (< 5% pour poudre, < 10% pour CO2)" },
    { id: 'tuyau', label: "Tuyau d'aspersion / diffuseur sans craquelure ni pliure" },
    { id: 'lance', label: "Lance / gâchette fonctionnelle et propre" },
    { id: 'joint_bouchon', label: "État du joint de cuve et du joint de bouchon" },
    { id: 'date_epreuve', label: "Épreuve décennale à jour (à réformer à 10 ans si eau/pré-mélange)" },
    { id: 'etiquette_maintenance', label: "Étiquette de vérification annuelle apposée (date + prestataire)" },
  ],
  // RIA — APSAD R5 · NF EN 671 — 15 items
  ria: [
    { id: 'emplacement', label: "Emplacement conforme (à moins de 6 m d'une porte, couverture du local)" },
    { id: 'signaletique', label: "Signalisation 'RIA' visible et normalisée" },
    { id: 'accessibilite', label: "Accessibilité dégagée (aucun stockage devant le poste)" },
    { id: 'coffret', label: "État général du coffret ou de la niche (pas de rouille, porte fonctionnelle)" },
    { id: 'vanne_arret', label: "Vanne d'arrêt en position ouverte et opérante" },
    { id: 'pression_statique', label: "Pression d'eau statique conforme (2,5 à 4,5 bars)" },
    { id: 'devidoir', label: "Intégrité du dévidoir, rotation libre sans grippage" },
    { id: 'tuyau', label: "Tuyau semi-rigide sans coupure, craquelure ni pliure permanente" },
    { id: 'longueur', label: "Longueur du tuyau conforme (20 à 30 m selon type)" },
    { id: 'raccord', label: "Raccord robinet-tuyau étanche, joints en état" },
    { id: 'lance', label: "Lance-diffuseur : jet plein / diffusé / arrêt fonctionnels" },
    { id: 'essai_eau', label: "Essai de mise en eau réussi (pression dynamique maintenue)" },
    { id: 'debit', label: "Débit à la lance conforme (≥ 60 L/min sous 2 bars minimum)" },
    { id: 'purge', label: "Purge / vidange effectuée après essai (anti-gel si extérieur)" },
    { id: 'etiquette', label: "Étiquette de contrôle annuel apposée (date + signataire)" },
  ],
  // Désenfumage — APSAD R17 · NF S 61-932 — 15 items
  desenfumage: [
    { id: 'emplacement', label: "Emplacement des exutoires / DENFC conforme au plan de désenfumage" },
    { id: 'surface', label: "Surface libre géométrique conforme au calcul de désenfumage" },
    { id: 'etat_exutoire', label: "État général des exutoires / trappes (pas d'oxydation, verrière intacte)" },
    { id: 'obstruction', label: "Absence d'obstruction sur la course d'ouverture (câbles, matériel)" },
    { id: 'ouverture_manuelle', label: "Ouverture manuelle de secours fonctionnelle (essai réel)" },
    { id: 'fermeture', label: "Fermeture complète après essai (retour position OK)" },
    { id: 'commande_elec', label: "Commande électrique (boîtier BAAS ou déclencheur) fonctionnelle" },
    { id: 'signaletique', label: "Signalisation 'Ouverture désenfumage' présente et lisible" },
    { id: 'amenee_air', label: "Amenées d'air (grilles basses, DAS) : absence d'obstruction" },
    { id: 'volets_ouverture', label: "Volets de désenfumage : essai d'ouverture depuis le tableau SSI" },
    { id: 'volets_fermeture', label: "Volets de désenfumage : fermeture après test" },
    { id: 'ventilateurs', label: "Ventilateurs de désenfumage : essai fonctionnel (démarrage, débit conforme)" },
    { id: 'gaines', label: "Étanchéité des gaines de désenfumage (calfeutrement)" },
    { id: 'asservissement', label: "Cohérence avec le SSI (asservissement de mise en sécurité)" },
    { id: 'etiquette', label: "Étiquette de contrôle annuel apposée (date + signataire)" },
  ],
  // SSI / Alarme incendie — APSAD R7 · NF S 61-950 — 15 items
  ssi: [
    { id: 'emplacement_ssi', label: "Emplacement du tableau SSI conforme (local sûr, accessible aux secours)" },
    { id: 'alim_secteur', label: "Alimentation secteur présente (voyant vert allumé)" },
    { id: 'batterie', label: "Batterie de secours : test de décharge (autonomie ≥ 12 h veille)" },
    { id: 'alarme_defaut', label: "Aucune alarme ni défaut actif au tableau" },
    { id: 'journal', label: "Journal historique consulté (aucun défaut récurrent)" },
    { id: 'nombre_detecteurs', label: "Nombre et implantation des détecteurs conformes au plan" },
    { id: 'etat_detecteurs', label: "État général des détecteurs (dépôt de poussière, capuchon en place)" },
    { id: 'essai_detecteurs', label: "Essai fonctionnel d'un échantillon de détecteurs (5% minimum)" },
    { id: 'acces_dm', label: "Déclencheurs manuels (DM) : accessibilité et présence de la vitre" },
    { id: 'essai_dm', label: "Essai fonctionnel d'un échantillon de déclencheurs manuels (5%)" },
    { id: 'signaletique_dm', label: "Signalisation 'En cas d'incendie briser la vitre' présente" },
    { id: 'audible', label: "Signal sonore d'évacuation audible partout dans le bâtiment" },
    { id: 'niveau_son', label: "Niveau sonore d'évacuation conforme (≥ 65 dB(A) au sol)" },
    { id: 'asservissements', label: "Asservissements SSI (portes CF, désenfumage, arrêt CVC) fonctionnels" },
    { id: 'etiquette', label: "Étiquette de contrôle annuel apposée + rapport de vérification établi" },
  ],
  // Extinction automatique — APSAD R1 · NF EN 12845 — 10 items
  extinction_auto: [
    { id: 'pression_canalisations', label: "Pression des canalisations conforme au régime nominal" },
    { id: 'vannes', label: "Vannes principales en position correcte (ouvertes / plombées)" },
    { id: 'reserve', label: "Réserve d'eau ou d'agent extincteur au niveau nominal" },
    { id: 'pompes', label: "Groupes motopompes : essai de démarrage automatique" },
    { id: 'test_sectionnel', label: "Test sectionnel réussi (arrêt d'incendie sur zone d'essai)" },
    { id: 'clapets', label: "Clapets d'arrêt et de non-retour opérationnels" },
    { id: 'diffuseurs', label: "État des diffuseurs / sprinklers (pas de peinture, pas d'obstruction)" },
    { id: 'alimentation_elec', label: "Alimentation électrique de secours conforme" },
    { id: 'signalisation', label: "Signalisation d'état visible sur tableau de contrôle" },
    { id: 'rapport_annuel', label: "Rapport de vérification annuel établi et transmis au client" },
  ],
}
