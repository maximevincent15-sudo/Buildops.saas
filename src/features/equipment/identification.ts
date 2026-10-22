import { EQUIPMENT_FAMILIES } from './schemas'
import type { EquipmentFamily, EquipmentUnit, Zone } from './schemas'

/**
 * Identification d'un équipement sur le terrain : repère court (EXT-12,
 * PCF-03…), emplacement lisible, ordre de passage et caractéristiques
 * propres à chaque famille.
 */

export const FAMILY_PREFIX: Record<EquipmentFamily, string> = {
  extincteurs: 'EXT',
  ria: 'RIA',
  baes: 'BAES',
  portes_cf: 'PCF',
  desenfumage: 'DSF',
  detection: 'DET',
  colonnes_seches: 'CS',
}

/** Repère affiché : « EXT-12 » pour un N° purement numérique, sinon le N° tel quel (« A-42 »). */
export function unitRepere(u: Pick<EquipmentUnit, 'family' | 'serial_number'>): string {
  const s = u.serial_number.trim()
  return /^\d+$/.test(s) ? `${FAMILY_PREFIX[u.family]}-${s.padStart(2, '0')}` : s
}

export function zoneLabel(z: Pick<Zone, 'name' | 'parent_zone'> | null | undefined): string {
  if (!z) return ''
  return z.parent_zone ? `${z.parent_zone} · ${z.name}` : z.name
}

/** « Bâtiment B · RDC · Hall d'entrée, à droite de la porte » (vide si rien n'est renseigné) */
export function unitLocation(
  u: Pick<EquipmentUnit, 'implantation'>,
  zone: Pick<Zone, 'name' | 'parent_zone'> | null | undefined,
): string {
  return [zoneLabel(zone), u.implantation?.trim() ?? ''].filter(Boolean).join(' · ')
}

/**
 * Ordre de passage sur le site : zone après zone (ordre défini sur le site,
 * sans zone en dernier), puis famille, puis N° (2 avant 10).
 */
export function compareUnitsByRound(zonesById: Map<string, Pick<Zone, 'display_order' | 'name'>>) {
  const zoneRank = (id: string | null) => {
    const z = id ? zonesById.get(id) : undefined
    return z ? z.display_order : Number.MAX_SAFE_INTEGER
  }
  return (
    a: Pick<EquipmentUnit, 'zone_id' | 'family' | 'serial_number'>,
    b: Pick<EquipmentUnit, 'zone_id' | 'family' | 'serial_number'>,
  ): number => {
    const za = a.zone_id ? zonesById.get(a.zone_id) : undefined
    const zb = b.zone_id ? zonesById.get(b.zone_id) : undefined
    return (
      zoneRank(a.zone_id) - zoneRank(b.zone_id) ||
      (za?.name ?? '').localeCompare(zb?.name ?? '', 'fr') ||
      EQUIPMENT_FAMILIES.indexOf(a.family) - EQUIPMENT_FAMILIES.indexOf(b.family) ||
      a.serial_number.localeCompare(b.serial_number, 'fr', { numeric: true })
    )
  }
}

// ─── Caractéristiques par famille ────────────────────────

export type AttributeField = {
  key: string
  label: string
  /** Liste de choix ; sans liste, saisie libre */
  options?: string[]
  placeholder?: string
}

export const FAMILY_ATTRIBUTES: Record<EquipmentFamily, AttributeField[]> = {
  extincteurs: [
    { key: 'agent', label: 'Agent extincteur', options: ['Eau pulvérisée + additif', 'Eau pulvérisée', 'Poudre ABC', 'Poudre BC', 'Poudre D (métaux)', 'CO2', 'Mousse', 'Classe F (cuisson)'] },
    { key: 'capacite', label: 'Capacité', placeholder: 'Ex : 6 L, 9 kg, 2 kg' },
    { key: 'pression', label: 'Pression', options: ['Permanente', 'Auxiliaire (cartouche)'] },
  ],
  ria: [
    { key: 'diametre', label: 'Diamètre', options: ['DN 19', 'DN 25', 'DN 33'] },
    { key: 'longueur', label: 'Longueur du tuyau', placeholder: 'Ex : 30 m' },
    { key: 'pose', label: 'Pose', options: ['Fixe', 'Pivotant', 'En armoire'] },
  ],
  baes: [
    { key: 'type', label: 'Type', options: ['Évacuation', 'Ambiance (anti-panique)', 'BAEH (habitation)', 'Bloc portatif'] },
    { key: 'technologie', label: 'Technologie', options: ['Standard', 'SATI (autotest)', 'Adressable'] },
    { key: 'flux', label: 'Flux lumineux', placeholder: 'Ex : 45 lm' },
  ],
  portes_cf: [
    { key: 'degre', label: 'Degré coupe-feu', options: ['EI 30 (CF ½ h)', 'EI 60 (CF 1 h)', 'EI 90 (CF 1 h 30)', 'EI 120 (CF 2 h)', 'E 30 (pare-flammes)'] },
    { key: 'ouverture', label: 'Ouverture', options: ['Battante', 'Va-et-vient', 'Coulissante', 'Rideau / guillotine'] },
    { key: 'vantaux', label: 'Vantaux', options: ['1 vantail', '2 vantaux'] },
    { key: 'fermeture', label: 'Fermeture', options: ['Ferme-porte', 'Ferme-porte + ventouse (DAS)', 'Ressort / pivot', 'Motorisée / contrepoids'] },
  ],
  desenfumage: [
    { key: 'type', label: 'Type', options: ['Exutoire (toiture)', 'Ouvrant de façade', 'Volet / clapet', 'Ventilateur', 'Commande / treuil'] },
    { key: 'commande', label: 'Commande', options: ['Manuelle (treuil, câble)', 'Pneumatique (CO2)', 'Électrique (24/48 V)'] },
    { key: 'surface', label: 'Surface utile', placeholder: 'Ex : 1,2 m²' },
  ],
  detection: [
    { key: 'type', label: 'Type', options: ['Détecteur de fumée', 'Détecteur de chaleur', 'Déclencheur manuel', 'Sirène / diffuseur', 'Flash lumineux', 'Centrale (ECS / CMSI)'] },
    { key: 'adressable', label: 'Adressable', options: ['Oui', 'Non'] },
  ],
  colonnes_seches: [
    { key: 'diametre', label: 'Diamètre', options: ['DN 65', 'DN 100'] },
    { key: 'niveaux', label: 'Nombre de prises (étages)', placeholder: 'Ex : 6' },
  ],
}

/** Ne garde que les caractéristiques connues et renseignées de la famille */
export function cleanAttributes(family: EquipmentFamily, attrs: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of FAMILY_ATTRIBUTES[family]) {
    const v = attrs?.[f.key]?.trim()
    if (v) out[f.key] = v
  }
  return out
}

/** Résumé court : « EI 60 · Battante · 2 vantaux » (sans les précisions entre parenthèses) */
export function attributesSummary(family: EquipmentFamily, attrs: Record<string, string> | null | undefined): string {
  return FAMILY_ATTRIBUTES[family]
    .map((f) => {
      const v = attrs?.[f.key]?.trim()
      if (!v) return ''
      if (f.options?.join() === 'Oui,Non') return v === 'Oui' ? f.label : ''
      return v.replace(/\s*\(.*\)$/, '')
    })
    .filter(Boolean)
    .join(' · ')
}

/** Type et caractéristiques sans répétition : « CO2 2 kg » plutôt que « CO2 2 kg · CO2 · 2 kg » */
export function unitTypeLine(u: Pick<EquipmentUnit, 'family' | 'subtype' | 'attributes'>): string {
  const subtype = u.subtype?.trim() ?? ''
  const squash = (x: string) => x.toLowerCase().replace(/[\s.,]/g, '')
  const parts = attributesSummary(u.family, u.attributes)
    .split(' · ')
    .filter((p) => p && !squash(subtype).includes(squash(p)))
  return [subtype, ...parts].filter(Boolean).join(' · ')
}

// ─── Périmètre du chantier ───────────────────────────────

/** Familles du parc contrôlées pour chaque type d'intervention planifiée */
const TYPE_TO_FAMILIES: Record<string, EquipmentFamily[]> = {
  extincteurs: ['extincteurs'],
  ria: ['ria'],
  baes: ['baes'],
  desenfumage: ['desenfumage'],
  portes_cf: ['portes_cf'],
  ssi: ['detection'],
  colonnes_seches: ['colonnes_seches'],
  extinction_auto: [],
}

/** Familles concernées par les types de l'intervention (vide : pas de restriction) */
export function familiesForTypes(types: string[] | null | undefined): EquipmentFamily[] {
  const out = new Set<EquipmentFamily>()
  for (const t of types ?? []) for (const f of TYPE_TO_FAMILIES[t] ?? []) out.add(f)
  return EQUIPMENT_FAMILIES.filter((f) => out.has(f))
}
