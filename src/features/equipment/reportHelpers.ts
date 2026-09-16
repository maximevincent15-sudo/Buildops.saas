import {
  listChecksByIntervention,
  listEquipmentUnits,
  listZones,
} from './api'
import {
  CHECK_VERDICT_LABELS,
  EQUIPMENT_FAMILY_LABELS,
} from './schemas'
import type { EquipmentUnit, Zone } from './schemas'
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

  const [checks, units, zones] = await Promise.all([
    listChecksByIntervention(interventionId),
    listEquipmentUnits({ siteId }),
    listZones(siteId),
  ])

  if (checks.length === 0) return []

  const unitsById = new Map<string, EquipmentUnit>()
  for (const u of units) unitsById.set(u.id, u)

  const zonesById = new Map<string, Zone>()
  for (const z of zones) zonesById.set(z.id, z)

  const entries: UnitReportEntry[] = []
  for (const c of checks) {
    const u = unitsById.get(c.equipment_unit_id)
    if (!u) continue
    const zone = u.zone_id ? zonesById.get(u.zone_id) ?? null : null
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
