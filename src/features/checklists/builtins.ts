import type { EquipmentFamily } from '../equipment/schemas'

/**
 * Listes de contrôle Firovia propres au code (les autres listes par
 * appareil viennent de la table family_templates). Le désenfumage a trois
 * listes : naturel (ouvrants et commandes), mécanique (ventilateurs,
 * volets) et écrans de cantonnement (fixes et mobiles). Les identifiants déjà utilisés par la liste d'origine sont
 * gardés pour que les anciens contrôles restent lisibles.
 */

export type BuiltinUnitList = {
  key: string
  family: EquipmentFamily
  name: string
  /** since : date d'ajout du point (les contrôles plus anciens ne le comptent pas) */
  items: Array<{ id: string; label: string; since?: string }>
}

export const DESENFUMAGE_NATUREL_KEY = 'unit:desenfumage:naturel'
export const DESENFUMAGE_MECANIQUE_KEY = 'unit:desenfumage:mecanique'
export const ECRANS_CANTONNEMENT_KEY = 'unit:desenfumage:ecrans'

export const CODE_UNIT_LISTS: BuiltinUnitList[] = [
  {
    key: DESENFUMAGE_NATUREL_KEY,
    family: 'desenfumage',
    name: 'Désenfumage naturel (ouvrants et commandes)',
    items: [
      { id: 'nat_commande', label: 'Commande (coffret, armoire ou treuil) accessible et signalée' },
      { id: 'nat_essai_ouverture', label: "Essai d'ouverture réel depuis la commande" },
      { id: 'nat_bizone', label: 'Commande bizone (le cas échéant) : essai de chaque déclenchement, bizone bien réalisé', since: '2026-11-14' },
      { id: 'nat_cartouche_ouverture', label: "Cartouche(s) d'ouverture percutée(s) puis remplacée(s)" },
      { id: 'nat_cartouche_pv', label: "Cartouches adaptées au PV de l'ouvrant (marque et dimensions relevées)", since: '2026-11-14' },
      { id: 'nat_ouvrant', label: 'Ouvrant (exutoire, lanterneau, châssis) : ouverture complète, charnières et vérin en état' },
      { id: 'nat_nettoyage', label: 'Ouvrant nettoyé et graissé (charnières, mécanisme)', since: '2026-11-14' },
      { id: 'fermeture', label: "Fermeture et verrouillage de l'ouvrant après l'essai" },
      { id: 'nat_cartouche_fermeture', label: 'Cartouche de fermeture percutée puis remplacée (commande ouverture / fermeture)' },
      { id: 'nat_plombage', label: 'Commande refermée et plombée' },
      { id: 'nat_reseau', label: 'Réseau pneumatique ou câble : fixé, étanche, sans écrasement' },
      { id: 'obstruction', label: "Aucune obstruction de l'ouvrant ni de sa course d'ouverture" },
      { id: 'amenee_air', label: "Amenées d'air associées dégagées et fonctionnelles" },
      { id: 'etiquette', label: 'Étiquette de contrôle apposée (date + signataire)' },
    ],
  },
  {
    key: DESENFUMAGE_MECANIQUE_KEY,
    family: 'desenfumage',
    name: 'Désenfumage mécanique (ventilateurs, volets)',
    items: [
      { id: 'commande_elec', label: 'Commande électrique (boîtier ou déclencheur) fonctionnelle' },
      { id: 'volets_ouverture', label: "Volets de désenfumage : essai d'ouverture depuis le tableau de sécurité" },
      { id: 'volets_fermeture', label: 'Volets de désenfumage : fermeture après essai' },
      { id: 'ventilateurs', label: 'Ventilateur de désenfumage : démarrage et débit corrects' },
      { id: 'gaines', label: 'Gaines de désenfumage étanches (calfeutrement)' },
      { id: 'amenee_air', label: "Amenées d'air (grilles, volets) dégagées" },
      { id: 'asservissement', label: "Asservissement avec l'alarme incendie fonctionnel" },
      { id: 'signaletique', label: 'Signalisation de la commande présente et lisible' },
      { id: 'etiquette', label: 'Étiquette de contrôle apposée (date + signataire)' },
    ],
  },
  {
    key: ECRANS_CANTONNEMENT_KEY,
    family: 'desenfumage',
    name: 'Écrans de cantonnement (fixes et mobiles)',
    items: [
      { id: 'ecr_etat', label: "Écran (toile, verre ou panneau) en bon état : ni déchirure, ni fissure, ni déformation" },
      { id: 'ecr_fixations', label: 'Fixations, suspentes et profilés solides, sans corrosion ni jeu' },
      { id: 'ecr_etancheite', label: "Aucun passage de fumée au-dessus ou sur les côtés de l'écran (gaine, câble ou faux plafond ajouté)" },
      { id: 'ecr_zone_descente', label: "Écran mobile : zone de descente dégagée (aucun stockage, mobilier ni rayonnage)" },
      { id: 'ecr_essai', label: 'Écran mobile : essai de déclenchement depuis la commande ou le tableau de sécurité' },
      { id: 'ecr_descente', label: "Écran mobile : descente régulière jusqu'en position basse, sans blocage" },
      { id: 'ecr_asservissement', label: "Écran mobile : déclenchement automatique avec l'alarme incendie (asservissement)" },
      { id: 'ecr_position', label: 'Écran mobile : position de sécurité bien signalée au tableau de sécurité' },
      { id: 'ecr_alimentation', label: 'Écran motorisé : alimentation ou batterie de secours en état' },
      { id: 'ecr_rearmement', label: "Écran mobile : réarmement et remontée en position d'attente après l'essai" },
      { id: 'etiquette', label: 'Étiquette de contrôle apposée (date + signataire)' },
    ],
  },
]

/** Familles dont les listes Firovia viennent du code plutôt que de family_templates */
export const CODE_LIST_FAMILIES = new Set<EquipmentFamily>(CODE_UNIT_LISTS.map((l) => l.family))
