import type { EquipmentFamily } from '../equipment/schemas'

/**
 * Listes de contrôle Firovia propres au code (les autres listes par
 * appareil viennent de la table family_templates). Le désenfumage a deux
 * listes : naturel (ouvrants et commandes) et mécanique (ventilateurs,
 * volets). Les identifiants déjà utilisés par la liste d'origine sont
 * gardés pour que les anciens contrôles restent lisibles.
 */

export type BuiltinUnitList = {
  key: string
  family: EquipmentFamily
  name: string
  items: Array<{ id: string; label: string }>
}

export const DESENFUMAGE_NATUREL_KEY = 'unit:desenfumage:naturel'
export const DESENFUMAGE_MECANIQUE_KEY = 'unit:desenfumage:mecanique'

export const CODE_UNIT_LISTS: BuiltinUnitList[] = [
  {
    key: DESENFUMAGE_NATUREL_KEY,
    family: 'desenfumage',
    name: 'Désenfumage naturel (ouvrants et commandes)',
    items: [
      { id: 'nat_commande', label: 'Commande (coffret, armoire ou treuil) accessible et signalée' },
      { id: 'nat_essai_ouverture', label: "Essai d'ouverture réel depuis la commande" },
      { id: 'nat_cartouche_ouverture', label: "Cartouche(s) d'ouverture percutée(s) puis remplacée(s)" },
      { id: 'nat_ouvrant', label: 'Ouvrant (exutoire, lanterneau, châssis) : ouverture complète, charnières et vérin en état' },
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
]

/** Familles dont les listes Firovia viennent du code plutôt que de family_templates */
export const CODE_LIST_FAMILIES = new Set<EquipmentFamily>(CODE_UNIT_LISTS.map((l) => l.family))
