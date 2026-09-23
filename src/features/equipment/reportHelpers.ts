import {
  listChecksByIntervention,
  listEquipmentUnits,
  listFamilyTemplates,
  listZones,
} from './api'
import {
  CHECK_VERDICT_LABELS,
  EQUIPMENT_FAMILY_LABELS,
} from './schemas'
import type { EquipmentUnit, FamilyTemplate, Zone } from './schemas'
import type { UnitReportEntry } from '../rapports/pdf/ReportPdf'

/**
 * Construit la liste des lignes du registre APSAD nominatif pour un rapport
 * (utilisé dans le PDF ReportPdf).
 *
 * Ne retourne QUE les unités qui ont un contrôle enregistré dans
 * equipment_checks pour cette intervention. Trié par zone puis par N°.
 */
export async function buildUnitEntriesForIntervention(
  interventionId: string,
  siteId: string | null,
): Promise<UnitReportEntry[]> {
  if (!siteId) return []

  const [checks, units, zones, templates] = await Promise.all([
    listChecksByIntervention(interventionId),
    listEquipmentUnits({ siteId }),
    listZones(siteId),
    listFamilyTemplates().catch(() => [] as FamilyTemplate[]),
  ])

  if (checks.length === 0) return []

  const unitsById = new Map<string, EquipmentUnit>()
  for (const u of units) unitsById.set(u.id, u)

  const zonesById = new Map<string, Zone>()
  for (const z of zones) zonesById.set(z.id, z)

  const templatesById = new Map<string, FamilyTemplate>()
  const templatesByFamily = new Map<string, FamilyTemplate>()
  for (const t of templates) {
    templatesById.set(t.id, t)
    if (!templatesByFamily.has(t.family)) templatesByFamily.set(t.family, t)
  }

  const entries: UnitReportEntry[] = []
  for (const c of checks) {
    const u = unitsById.get(c.equipment_unit_id)
    if (!u) continue
    const zone = u.zone_id ? zonesById.get(u.zone_id) ?? null : null

    const template =
      (c.family_template_id ? templatesById.get(c.family_template_id) : undefined)
      ?? templatesByFamily.get(u.family)
    const items = template?.checklist ?? []
    const answers = c.checklist ?? {}
    const naItems = items.filter((it) => answers[it.id] === 'na').map((it) => it.label)
    const uncheckedItems = items.filter((it) => !answers[it.id]).map((it) => it.label)

    entries.push({
      unitSerial: u.serial_number,
      zoneName: zone?.name ?? null,
      parentZone: zone?.parent_zone ?? null,
      implantation: u.implantation,
      familyLabel: EQUIPMENT_FAMILY_LABELS[u.family],
      subtype: u.subtype,
      brand: u.brand,
      installYear: u.install_year,
      verdict: c.verdict,
      verdictLabel: CHECK_VERDICT_LABELS[c.verdict],
      observation: c.observation,
      totalItems: items.length || undefined,
      checkedCount: items.length - uncheckedItems.length,
      naItems,
      uncheckedItems,
    })
  }

  // Tri : par zone (parent + name) puis par N° d'unité
  entries.sort((a, b) => {
    const zA = `${a.parentZone ?? ''}·${a.zoneName ?? ''}`
    const zB = `${b.parentZone ?? ''}·${b.zoneName ?? ''}`
    if (zA !== zB) return zA.localeCompare(zB, 'fr')
    return a.unitSerial.localeCompare(b.unitSerial, 'fr', { numeric: true })
  })

  return entries
}

// Ré-export utile pour le PDF
export type { UnitReportEntry } from '../rapports/pdf/ReportPdf'
