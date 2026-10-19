/**
 * Reconnaissance d'une famille d'équipement à partir d'un libellé libre
 * (import Excel, contenu d'une étiquette QR…).
 */
import { EQUIPMENT_FAMILIES } from './schemas'
import type { EquipmentFamily } from './schemas'

/** Minuscules, sans accents ni espaces multiples */
export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

/** Mapping tolérant texte libre → famille interne (correspondance exacte) */
const FAMILY_ALIASES: Record<string, EquipmentFamily> = {
  extincteur: 'extincteurs',
  extincteurs: 'extincteurs',
  ex: 'extincteurs',
  ext: 'extincteurs',
  ria: 'ria',
  'robinet incendie arme': 'ria',
  'robinet d incendie arme': 'ria',
  baes: 'baes',
  bae: 'baes',
  'bloc autonome': 'baes',
  'bloc autonome eclairage secours': 'baes',
  eclairage: 'baes',
  'porte coupe-feu': 'portes_cf',
  'porte coupe feu': 'portes_cf',
  'portes coupe-feu': 'portes_cf',
  'portes coupe feu': 'portes_cf',
  pcf: 'portes_cf',
  desenfumage: 'desenfumage',
  desenfum: 'desenfumage',
  fumee: 'desenfumage',
  detection: 'detection',
  ssi: 'detection',
  alarme: 'detection',
  'detection incendie': 'detection',
  cs: 'colonnes_seches',
  'colonne seche': 'colonnes_seches',
  'colonnes seches': 'colonnes_seches',
}

/**
 * Mots-clés reconnus dans un libellé libre (« Extincteur CO2 5kg »,
 * « B.A.E.S évacuation », « Déclencheur manuel »…). L'ordre compte.
 */
const FAMILY_KEYWORDS: Array<[RegExp, EquipmentFamily]> = [
  [/colonne/, 'colonnes_seches'],
  [/\bria\b|robinet/, 'ria'],
  [/b\.?a\.?e\.?s|b\.?a\.?e\.?h|\bbae\b|bloc autonome|eclairage de securite|eclairage secours/, 'baes'],
  [/porte|\bpcf\b|coupe.?feu/, 'portes_cf'],
  [/desenfum|exutoire|\bdcm\b|ouvrant de desenfumage/, 'desenfumage'],
  [/detect|\bssi\b|alarme|declencheur|sirene|centrale incendie|\bdm\b/, 'detection'],
  [/extinct|\bext\b|\bco[2²]|poudre|eau pulv|\bepa?\b|mousse|\bpp\s?\d|\babc\b|\bp\d+\b/, 'extincteurs'],
]

export function resolveFamily(raw: string | null | undefined): EquipmentFamily | null {
  if (!raw) return null
  const n = normalize(raw)
  if (FAMILY_ALIASES[n]) return FAMILY_ALIASES[n]
  if (EQUIPMENT_FAMILIES.includes(n as EquipmentFamily)) return n as EquipmentFamily
  for (const [re, family] of FAMILY_KEYWORDS) {
    if (re.test(n)) return family
  }
  return null
}
