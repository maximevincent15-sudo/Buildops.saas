import { z } from 'zod'

// ─── Constantes ──────────────────────────────────────────

export const EQUIPMENT_FAMILIES = [
  'extincteurs',
  'ria',
  'baes',
  'portes_cf',
  'desenfumage',
  'detection',
  'colonnes_seches',
] as const
export type EquipmentFamily = (typeof EQUIPMENT_FAMILIES)[number]

export const EQUIPMENT_STATUSES = [
  'active',
  'to_watch',
  'to_replace',
  'replaced',
  'removed',
] as const
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number]

export const EQUIPMENT_FAMILY_LABELS: Record<EquipmentFamily, string> = {
  extincteurs: 'Extincteurs',
  ria: 'RIA',
  baes: 'BAES',
  portes_cf: 'Portes coupe-feu',
  desenfumage: 'Désenfumage',
  detection: 'Détection incendie',
  colonnes_seches: 'Colonnes sèches',
}

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  active: 'Conforme',
  to_watch: 'À surveiller',
  to_replace: 'À réformer',
  replaced: 'Remplacé',
  removed: 'Retiré',
}

// Durée de vie standard (en années) pour calculer next_replacement_year
export const EQUIPMENT_LIFESPAN_YEARS: Partial<Record<EquipmentFamily, number>> = {
  extincteurs: 10, // règle APSAD R4
  baes: 4, // NF C 71-800
}

// ─── Sites ───────────────────────────────────────────────

export const createSiteSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1, 'Nom du site requis'),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  access_notes: z.string().optional(),
  notes: z.string().optional(),
})
export type CreateSiteInput = z.infer<typeof createSiteSchema>

export type Site = {
  id: string
  organization_id: string
  client_id: string
  name: string
  address: string | null
  postal_code: string | null
  city: string | null
  contact_name: string | null
  contact_phone: string | null
  access_notes: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  /** Token unique pour l'URL publique /registre/:token (Slice H). */
  public_token: string | null
}

// ─── Zones ───────────────────────────────────────────────

export const createZoneSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1, 'Nom de zone requis'),
  parent_zone: z.string().optional(),
  display_order: z.number().int().min(0).optional(),
})
export type CreateZoneInput = z.infer<typeof createZoneSchema>

export type Zone = {
  id: string
  organization_id: string
  site_id: string
  name: string
  parent_zone: string | null
  display_order: number
  created_at: string
}

// ─── Equipment units ─────────────────────────────────────

export const createEquipmentUnitSchema = z.object({
  client_id: z.string().uuid(),
  site_id: z.string().uuid(),
  zone_id: z.string().uuid().optional(),
  family: z.enum(EQUIPMENT_FAMILIES),
  subtype: z.string().optional(),
  serial_number: z.string().min(1, "N° d'unité requis"),
  implantation: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  install_year: z.number().int().min(1900).max(2100).optional(),
  next_replacement_year: z.number().int().min(1900).max(2100).optional(),
  qr_code: z.string().optional(),
  status: z.enum(EQUIPMENT_STATUSES),
  last_check_date: z.string().optional(),
  next_check_date: z.string().optional(),
  notes: z.string().optional(),
})
export type CreateEquipmentUnitInput = z.infer<typeof createEquipmentUnitSchema>

export type EquipmentUnit = {
  id: string
  organization_id: string
  client_id: string
  site_id: string
  zone_id: string | null
  family: EquipmentFamily
  subtype: string | null
  serial_number: string
  implantation: string | null
  brand: string | null
  model: string | null
  install_year: number | null
  next_replacement_year: number | null
  qr_code: string | null
  status: EquipmentStatus
  last_check_date: string | null
  next_check_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

// ─── Family templates ────────────────────────────────────

export type ChecklistItem = { id: string; label: string; category?: string }

export type FamilyTemplate = {
  id: string
  family: EquipmentFamily
  version: number
  name: string
  reference_code: string | null
  standard_ref: string | null
  checklist: ChecklistItem[]
  observation_types: string[]
  active: boolean
  created_at: string
}

// ─── Equipment checks (contrôles unitaires) ──────────────

export const CHECK_ITEM_VALUES = ['ok', 'na'] as const
export type CheckItemValue = (typeof CHECK_ITEM_VALUES)[number]

export const CHECK_VERDICTS = ['non_verifie', 'conforme', 'surveiller', 'reformer'] as const
export type CheckVerdict = (typeof CHECK_VERDICTS)[number]

export const CHECK_VERDICT_LABELS: Record<CheckVerdict, string> = {
  non_verifie: 'Non vérifié',
  conforme: 'Conforme',
  surveiller: 'À surveiller',
  reformer: 'À réformer',
}

// Map verdict → statut d'unité correspondant (pour mise à jour de l'unité)
export const VERDICT_TO_UNIT_STATUS: Record<CheckVerdict, EquipmentStatus | null> = {
  non_verifie: null,
  conforme: 'active',
  surveiller: 'to_watch',
  reformer: 'to_replace',
}

export type CheckPhoto = { path: string; url: string }

/** Contrôle unitaire d'un équipement lors d'une intervention. */
export type EquipmentCheck = {
  id: string
  organization_id: string
  intervention_id: string
  equipment_unit_id: string
  family_template_id: string | null
  /** { "<itemId>": "ok" | "na" } */
  checklist: Record<string, CheckItemValue>
  observation: string | null
  verdict: CheckVerdict
  photos: CheckPhoto[]
  technician_id: string | null
  technician_name: string | null
  checked_at: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export type UpsertEquipmentCheckInput = {
  intervention_id: string
  equipment_unit_id: string
  family_template_id?: string | null
  checklist?: Record<string, CheckItemValue>
  observation?: string | null
  verdict?: CheckVerdict
  photos?: CheckPhoto[]
  technician_id?: string | null
  technician_name?: string | null
}

// ─── Helper : calcul année de réforme ────────────────────

export function computeNextReplacementYear(
  family: EquipmentFamily,
  installYear: number | null | undefined,
): number | null {
  if (!installYear) return null
  const span = EQUIPMENT_LIFESPAN_YEARS[family]
  return span ? installYear + span : null
}
