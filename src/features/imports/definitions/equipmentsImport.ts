import {
  batchCreateEquipmentUnits,
  createZone,
  listEquipmentUnits,
  listSites,
  listZones,
} from '../../equipment/api'
import {
  EQUIPMENT_FAMILIES,
  EQUIPMENT_FAMILY_LABELS,
} from '../../equipment/schemas'
import type {
  CreateEquipmentUnitInput,
  EquipmentFamily,
  Site,
  Zone,
} from '../../equipment/schemas'
import { parseFlexibleInt } from '../helpers'
import type { ImportDefinition, RowAnalysis } from '../types'

// ─── Helpers ────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

/** Mapping tolérant texte libre → famille interne */
const FAMILY_ALIASES: Record<string, EquipmentFamily> = {
  extincteur: 'extincteurs',
  extincteurs: 'extincteurs',
  ex: 'extincteurs',
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

function resolveFamily(raw: string | null): EquipmentFamily | null {
  if (!raw) return null
  const n = normalize(raw)
  if (FAMILY_ALIASES[n]) return FAMILY_ALIASES[n]
  // Test si c'est déjà un code interne
  if (EQUIPMENT_FAMILIES.includes(n as EquipmentFamily)) return n as EquipmentFamily
  return null
}

// ─── Site index ─────────────────────────────────────────

type EquipCache = {
  sitesByName?: Map<string, Site>
  zonesBySiteAndName?: Map<string, Zone> // key: `${site_id}::${normalizedName}`
  existingSerials?: Set<string> // key: `${site_id}::${family}::${serial}`
  pendingZones?: Map<string, string> // key = site_id::name → placeholder zone_id (empty during preview)
}

async function getSitesIndex(cache: Record<string, unknown>): Promise<Map<string, Site>> {
  const c = cache as EquipCache
  if (c.sitesByName) return c.sitesByName
  const sites = await listSites()
  const map = new Map<string, Site>()
  for (const s of sites) map.set(normalize(s.name), s)
  c.sitesByName = map
  return map
}

async function getZonesIndex(
  siteId: string,
  cache: Record<string, unknown>,
): Promise<Map<string, Zone>> {
  const c = cache as EquipCache
  if (!c.zonesBySiteAndName) c.zonesBySiteAndName = new Map()
  const zones = await listZones(siteId)
  for (const z of zones) {
    c.zonesBySiteAndName.set(`${siteId}::${normalize(z.name)}`, z)
  }
  return c.zonesBySiteAndName
}

async function getExistingSerials(cache: Record<string, unknown>): Promise<Set<string>> {
  const c = cache as EquipCache
  if (c.existingSerials) return c.existingSerials
  const units = await listEquipmentUnits({ includeRemoved: true })
  const set = new Set<string>()
  for (const u of units) {
    set.add(`${u.site_id}::${u.family}::${u.serial_number}`)
  }
  c.existingSerials = set
  return set
}

// ─── Definition ─────────────────────────────────────────

export const equipmentsImportDefinition: ImportDefinition = {
  entityLabel: 'équipement',
  entityLabelPlural: 'équipements',
  templateFilename: 'equipements-firovia.xlsx',
  description:
    "Importe un registre APSAD depuis Excel ou CSV. " +
    "Les sites doivent exister avant l'import (crée-les d'abord depuis la page Équipements). " +
    "Les zones inconnues seront créées automatiquement.",
  fields: [
    {
      key: 'site_name',
      label: 'Site',
      required: true,
      example: 'PENTACAR Montauban',
      hint: 'Nom exact du site (déjà créé dans Firovia)',
    },
    {
      key: 'family',
      label: 'Famille',
      required: true,
      example: 'Extincteurs',
      hint: 'Extincteurs, RIA, BAES, Portes CF, Désenfumage, Détection, Colonnes sèches',
    },
    {
      key: 'serial_number',
      label: "N° d'unité",
      required: true,
      example: '01',
      hint: 'Numéro écrit sur l\'équipement (unique par site+famille)',
    },
    {
      key: 'zone_name',
      label: 'Zone',
      example: 'Atelier peinture',
      hint: 'Créée automatiquement si inexistante',
    },
    {
      key: 'subtype',
      label: 'Type / sous-type',
      example: 'EPA 6L',
      hint: 'EPA 6L, CO² 5kg, P6 ABC…',
    },
    {
      key: 'implantation',
      label: 'Implantation',
      example: 'Entrée principale',
    },
    {
      key: 'brand',
      label: 'Marque',
      example: 'ANDRIEU',
    },
    {
      key: 'model',
      label: 'Modèle',
      example: '',
    },
    {
      key: 'install_year',
      label: 'Année de mise en service',
      example: '2019',
    },
    {
      key: 'next_replacement_year',
      label: 'Année de réforme',
      example: '2029',
      hint: 'Optionnel — calculé auto si vide (extincteurs = +10 ans, BAES = +4 ans)',
    },
    {
      key: 'notes',
      label: 'Observation / notes',
      example: 'Néant',
    },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const messages: string[] = []
    const cache = context.cache as Record<string, unknown>

    const siteName = (row.site_name ?? '').trim()
    const familyRaw = (row.family ?? '').trim()
    const serial = (row.serial_number ?? '').trim()

    // Champs obligatoires
    if (!siteName) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: ['Nom du site obligatoire'],
      }
    }
    if (!familyRaw) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: ['Famille obligatoire'],
      }
    }
    if (!serial) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: ["N° d'unité obligatoire"],
      }
    }

    // Résolution site
    const sitesIndex = await getSitesIndex(cache)
    const site = sitesIndex.get(normalize(siteName))
    if (!site) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: [
          `Site "${siteName}" introuvable. Crée-le d'abord depuis la page Équipements.`,
        ],
      }
    }

    // Résolution famille
    const family = resolveFamily(familyRaw)
    if (!family) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: [
          `Famille "${familyRaw}" non reconnue. Utilise : ${EQUIPMENT_FAMILIES.map((f) => EQUIPMENT_FAMILY_LABELS[f]).join(', ')}`,
        ],
      }
    }

    // Validation année
    const yearRaw = row.install_year ?? ''
    if (yearRaw) {
      const y = parseFlexibleInt(yearRaw)
      if (y === null || y < 1900 || y > 2100) {
        messages.push(`Année "${yearRaw}" invalide (sera ignorée)`)
      }
    }

    // Injecte les valeurs résolues pour importRow
    const values: Record<string, string | null> = {
      ...row,
      __resolved_site_id: site.id,
      __resolved_client_id: site.client_id,
      __resolved_family: family,
    }

    // Dédup : (site_id, family, serial) déjà existant ?
    const serials = await getExistingSerials(cache)
    const key = `${site.id}::${family}::${serial}`
    if (serials.has(key)) {
      return {
        index: 0,
        values,
        status: 'duplicate',
        messages,
        existingId: null, // pas de vraie update, on skippe
      }
    }

    return { index: 0, values, status: 'valid', messages }
  },

  async importRow(row, analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    if (analysis.status !== 'valid') {
      if (analysis.status === 'duplicate' && analysis.duplicateAction === 'skip') return 'skipped'
      if (analysis.status === 'invalid') return 'skipped'
    }

    const cache = context.cache as Record<string, unknown>
    const siteId = row.__resolved_site_id!
    const clientId = row.__resolved_client_id!
    const family = row.__resolved_family as EquipmentFamily

    // Zone : lookup + création à la volée
    let zoneId: string | undefined
    const zoneName = (row.zone_name ?? '').trim()
    if (zoneName) {
      const zonesIndex = await getZonesIndex(siteId, cache)
      const zoneKey = `${siteId}::${normalize(zoneName)}`
      let zone = zonesIndex.get(zoneKey)
      if (!zone) {
        zone = await createZone(
          { site_id: siteId, name: zoneName },
          context.organizationId,
        )
        zonesIndex.set(zoneKey, zone)
      }
      zoneId = zone.id
    }

    const installYear = parseFlexibleInt(row.install_year ?? null)
    const nextYear = parseFlexibleInt(row.next_replacement_year ?? null)

    const input: CreateEquipmentUnitInput = {
      client_id: clientId,
      site_id: siteId,
      zone_id: zoneId,
      family,
      subtype: row.subtype ?? undefined,
      serial_number: (row.serial_number ?? '').trim(),
      implantation: row.implantation ?? undefined,
      brand: row.brand ?? undefined,
      model: row.model ?? undefined,
      install_year: installYear ?? undefined,
      next_replacement_year: nextYear ?? undefined,
      status: 'active',
      notes: row.notes ?? undefined,
    }

    await batchCreateEquipmentUnits([input], context.organizationId)
    return 'created'
  },
}
