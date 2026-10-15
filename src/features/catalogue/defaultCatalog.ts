import type { CatalogItemInput } from './schemas'

/**
 * Catalogue type d'un mainteneur incendie, proposé en un clic quand le
 * catalogue est vide. Prix HT INDICATIFS (ordre de grandeur du marché) :
 * chaque entreprise les ajuste à son propre tarif.
 */
export const DEFAULT_CATALOG: CatalogItemInput[] = [
  // Prestations
  { reference: 'VER-EXT', label: 'Vérification annuelle extincteur (par appareil)', category: 'prestation', unit: 'u', unit_price_ht: 12, vat_rate: 20 },
  { reference: 'VER-RIA', label: 'Vérification annuelle RIA (par poste)', category: 'prestation', unit: 'u', unit_price_ht: 45, vat_rate: 20 },
  { reference: 'VER-BAES', label: "Vérification éclairage de sécurité (par bloc)", category: 'prestation', unit: 'u', unit_price_ht: 5, vat_rate: 20 },
  { reference: 'VER-DSF', label: 'Vérification désenfumage (par commande ou ouvrant)', category: 'prestation', unit: 'u', unit_price_ht: 60, vat_rate: 20 },
  { reference: 'VER-CS', label: 'Vérification colonne sèche', category: 'prestation', unit: 'u', unit_price_ht: 60, vat_rate: 20 },
  { reference: 'MAA-EXT', label: 'Maintenance approfondie extincteur (révision 5 ans)', category: 'prestation', unit: 'u', unit_price_ht: 30, vat_rate: 20 },
  { reference: 'REV-EXT', label: 'Révision décennale extincteur', category: 'prestation', unit: 'u', unit_price_ht: 35, vat_rate: 20 },
  { reference: 'RCH-EP6', label: 'Recharge extincteur eau 6 L', category: 'prestation', unit: 'u', unit_price_ht: 25, vat_rate: 20 },
  { reference: 'RCH-PP6', label: 'Recharge extincteur poudre 6 kg', category: 'prestation', unit: 'u', unit_price_ht: 30, vat_rate: 20 },
  { reference: 'RCH-CO2', label: 'Recharge extincteur CO2 2 kg', category: 'prestation', unit: 'u', unit_price_ht: 30, vat_rate: 20 },

  // Fournitures
  { reference: 'EXT-EPA6', label: 'Extincteur eau pulvérisée + additif 6 L (EPA)', category: 'fourniture', unit: 'u', unit_price_ht: 65, vat_rate: 20 },
  { reference: 'EXT-EPA9', label: 'Extincteur eau pulvérisée + additif 9 L (EPA)', category: 'fourniture', unit: 'u', unit_price_ht: 85, vat_rate: 20 },
  { reference: 'EXT-CO2-2', label: 'Extincteur CO2 2 kg', category: 'fourniture', unit: 'u', unit_price_ht: 75, vat_rate: 20 },
  { reference: 'EXT-CO2-5', label: 'Extincteur CO2 5 kg', category: 'fourniture', unit: 'u', unit_price_ht: 140, vat_rate: 20 },
  { reference: 'EXT-PP6', label: 'Extincteur poudre ABC 6 kg', category: 'fourniture', unit: 'u', unit_price_ht: 70, vat_rate: 20 },
  { reference: 'EXT-PP9', label: 'Extincteur poudre ABC 9 kg', category: 'fourniture', unit: 'u', unit_price_ht: 85, vat_rate: 20 },
  { reference: 'SUP-EXT', label: 'Support mural extincteur', category: 'fourniture', unit: 'u', unit_price_ht: 8, vat_rate: 20 },
  { reference: 'HOU-EXT', label: 'Housse de protection extincteur', category: 'fourniture', unit: 'u', unit_price_ht: 10, vat_rate: 20 },
  { reference: 'SIG-EXT', label: 'Panneau de signalisation extincteur', category: 'fourniture', unit: 'u', unit_price_ht: 6, vat_rate: 20 },
  { reference: 'PLAN-A3', label: "Plan d'évacuation A3", category: 'fourniture', unit: 'u', unit_price_ht: 90, vat_rate: 20 },
  { reference: 'BAES-EVAC', label: 'BAES évacuation', category: 'fourniture', unit: 'u', unit_price_ht: 55, vat_rate: 20 },
  { reference: 'BAES-AMB', label: 'BAES ambiance (anti-panique)', category: 'fourniture', unit: 'u', unit_price_ht: 60, vat_rate: 20 },
  { reference: 'BAEH', label: "Bloc autonome d'éclairage d'habitation (BAEH)", category: 'fourniture', unit: 'u', unit_price_ht: 50, vat_rate: 20 },
  { reference: 'BAT-BAES', label: 'Batterie de remplacement BAES', category: 'fourniture', unit: 'u', unit_price_ht: 15, vat_rate: 20 },

  // Main-d'œuvre et déplacement
  { reference: 'MO-H', label: "Main-d'œuvre technicien", category: 'main_oeuvre', unit: 'h', unit_price_ht: 55, vat_rate: 20 },
  { reference: 'POSE-EXT', label: 'Pose extincteur (fixation et signalisation)', category: 'main_oeuvre', unit: 'u', unit_price_ht: 12, vat_rate: 20 },
  { reference: 'POSE-BAES', label: 'Pose et raccordement BAES', category: 'main_oeuvre', unit: 'u', unit_price_ht: 35, vat_rate: 20 },
  { reference: 'RECY-EXT', label: 'Reprise et recyclage ancien extincteur', category: 'prestation', unit: 'u', unit_price_ht: 12, vat_rate: 20 },
  { reference: 'DEP', label: 'Forfait déplacement', category: 'deplacement', unit: 'forfait', unit_price_ht: 45, vat_rate: 20 },
]
