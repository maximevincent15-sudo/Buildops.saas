import { normalizeIntervention, INTERVENTION_TYPE_LABELS } from '../../planning/schemas'
import type { Intervention } from '../../planning/schemas'
import { listAnomaliesForIntervention } from '../../anomalies/api'
import { listEquipmentUnits, listZones } from '../../equipment/api'
import { buildUnitEntriesForIntervention } from '../../equipment/reportHelpers'
import { EQUIPMENT_FAMILY_LABELS } from '../../equipment/schemas'
import { getInvoicingSettings } from '../../parametres/api'
import { supabase } from '../../../shared/lib/supabase'
import { EQUIPMENT_TYPES, resolveEquipmentTypes } from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import { getReportByIntervention, setReportPdfUrl } from '../api'
import { CHECKLISTS } from '../checklists'
import { responsesToByType } from '../schemas'
import type { ChecklistResponse } from '../schemas'
import { generateAndUploadReportPdf } from './generateReportPdf'
import { ReportPdf } from './ReportPdf'
import type { AnomalyPdfEntry } from './ReportPdf'

/**
 * Génère le PDF d'un rapport déjà enregistré, à partir de la base (et non de
 * l'état de l'éditeur), puis l'enregistre sur le rapport. Mêmes données que
 * l'éditeur : checklist par type, registre nominatif, anomalies, identité.
 * Utilisé par le chargeur de données de démo.
 */
export async function generateReportPdfForIntervention(
  interventionId: string,
  organizationId: string,
  organizationName: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('interventions')
    .select('*')
    .eq('id', interventionId)
    .single()
  if (error) throw error
  const intervention = normalizeIntervention(data as Intervention)

  const report = await getReportByIntervention(interventionId)
  if (!report) throw new Error(`Aucun rapport pour l'intervention ${intervention.reference}`)

  const byType = responsesToByType(
    (report.checklist ?? []) as ChecklistResponse[],
    report.equipment_type ?? null,
  )
  const sections = (resolveEquipmentTypes(intervention) as EquipmentType[]).map((t) => ({
    type: t,
    label: EQUIPMENT_TYPES[t] ?? t,
    items: CHECKLISTS[t] ?? [],
    responses: byType[t] ?? [],
  }))

  const [unitEntries, settings, anomalies] = await Promise.all([
    buildUnitEntriesForIntervention(interventionId, intervention.site_id).catch(() => []),
    getInvoicingSettings(organizationId).catch(() => null),
    listAnomaliesForIntervention(interventionId).catch(() => []),
  ])

  let anomalyEntries: AnomalyPdfEntry[] = []
  if (anomalies.length > 0) {
    const siteId = intervention.site_id
    const [units, zones] = await Promise.all([
      listEquipmentUnits(),
      siteId ? listZones(siteId) : Promise.resolve([]),
    ])
    const unitById = new Map(units.map((u) => [u.id, u]))
    const zoneById = new Map(zones.map((z) => [z.id, z]))
    anomalyEntries = anomalies.map((anomaly) => {
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

  const element = (
    <ReportPdf
      intervention={intervention}
      report={report}
      sections={sections}
      organizationName={organizationName}
      unitEntries={unitEntries}
      settings={settings}
      anomalyEntries={anomalyEntries}
      interventionType={
        intervention.intervention_type ? INTERVENTION_TYPE_LABELS[intervention.intervention_type] : null
      }
    />
  )
  const url = await generateAndUploadReportPdf(element, organizationId, interventionId, intervention.reference)
  await setReportPdfUrl(report.id, url)
  return url
}
