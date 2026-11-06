import { listAnomalies } from '../../anomalies/api'
import { listEquipmentUnitsByIds, listZones } from '../../equipment/api'
import { EQUIPMENT_FAMILY_LABELS } from '../../equipment/schemas'
import type { AnomalyPdfEntry } from './ReportPdf'

/**
 * Anomalies encore ouvertes (ouvertes ou planifiées) sur les équipements du
 * site, signalées lors d'une visite précédente : le rapport les rappelle dans
 * « À traiter » pour que rien ne se perde d'une visite à l'autre.
 */
export async function loadPreviousOpenAnomalies(interventionId: string, siteId: string | null): Promise<AnomalyPdfEntry[]> {
  if (!siteId) return []
  const anomalies = (await listAnomalies({ onlyActive: true, siteId }))
    .filter((a) => a.intervention_id !== interventionId)
  if (anomalies.length === 0) return []
  const [units, zones] = await Promise.all([
    listEquipmentUnitsByIds(anomalies.map((a) => a.equipment_unit_id)),
    listZones(siteId),
  ])
  const unitById = new Map(units.map((u) => [u.id, u]))
  const zoneById = new Map(zones.map((z) => [z.id, z]))
  return anomalies.map((anomaly) => {
    const unit = anomaly.equipment_unit_id ? unitById.get(anomaly.equipment_unit_id) ?? null : null
    const zone = unit?.zone_id ? zoneById.get(unit.zone_id) ?? null : null
    return {
      anomaly,
      unitSerial: unit?.serial_number ?? null,
      unitFamilyLabel: unit ? EQUIPMENT_FAMILY_LABELS[unit.family] : null,
      unitSubtype: unit?.subtype ?? null,
      unitImplantation: unit?.implantation ?? null,
      unitZoneName: zone?.name ?? null,
    }
  })
}
