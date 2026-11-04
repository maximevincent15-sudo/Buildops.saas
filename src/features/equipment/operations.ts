import type { EquipmentFamily } from './schemas'

/**
 * Opérations réalisées sur un appareil pendant une visite, par famille
 * (equipment_checks.operations). « Vérification » est cochée par défaut ;
 * le compte rendu les imprime appareil par appareil et les totalise.
 */

export type UnitOperation = { key: string; label: string; short: string }

const VERIFICATION: UnitOperation = { key: 'verification', label: 'Vérification', short: 'Vérif.' }
const REPARATION: UnitOperation = { key: 'reparation', label: 'Réparation', short: 'Répar.' }
const REMPLACEMENT: UnitOperation = { key: 'remplacement', label: 'Remplacement', short: 'Rempl.' }

export const UNIT_OPERATIONS: Record<EquipmentFamily, UnitOperation[]> = {
  extincteurs: [
    VERIFICATION,
    { key: 'recharge', label: 'Recharge', short: 'Recharge' },
    { key: 'maintenance_additionnelle', label: 'Maintenance additionnelle', short: 'MA' },
    REMPLACEMENT,
  ],
  ria: [VERIFICATION, REPARATION, REMPLACEMENT],
  baes: [VERIFICATION, { key: 'remplacement_batterie', label: 'Remplacement batterie', short: 'Batterie' }, REMPLACEMENT],
  portes_cf: [VERIFICATION, { key: 'reglage', label: 'Réglage', short: 'Réglage' }, REPARATION, REMPLACEMENT],
  desenfumage: [VERIFICATION, { key: 'remplacement_cartouche', label: 'Remplacement cartouche', short: 'Cartouche' }, REPARATION, REMPLACEMENT],
  detection: [VERIFICATION, REPARATION, REMPLACEMENT],
  colonnes_seches: [VERIFICATION, REPARATION],
}

export const DEFAULT_OPERATIONS = ['verification']

const ALL = new Map(Object.values(UNIT_OPERATIONS).flat().map((o) => [o.key, o]))

/** Libellés des opérations d'un contrôle, dans l'ordre de la famille ; « Vérification » si rien n'est noté */
export function operationLabels(family: string | null | undefined, keys: string[] | null | undefined, form: 'label' | 'short' = 'label'): string[] {
  const list = (family && UNIT_OPERATIONS[family as EquipmentFamily]) || []
  const chosen = keys && keys.length > 0 ? keys : DEFAULT_OPERATIONS
  const ordered = [
    ...list.filter((o) => chosen.includes(o.key)),
    ...chosen.filter((k) => !list.some((o) => o.key === k)).map((k) => ALL.get(k)).filter((o): o is UnitOperation => !!o),
  ]
  return ordered.map((o) => o[form])
}
