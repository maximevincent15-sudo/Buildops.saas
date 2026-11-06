import { normalizeIntervention, INTERVENTION_TYPE_LABELS } from '../../planning/schemas'
import type { Intervention } from '../../planning/schemas'
import { listAnomaliesForIntervention } from '../../anomalies/api'
import { getClientNumber } from '../../clients/api'
import { listEquipmentUnitsByIds, listZones } from '../../equipment/api'
import { buildUnitEntriesForIntervention } from '../../equipment/reportHelpers'
import { EQUIPMENT_FAMILY_LABELS } from '../../equipment/schemas'
import { getInvoicingSettings } from '../../parametres/api'
import { supabase } from '../../../shared/lib/supabase'
import { EQUIPMENT_TYPES, resolveEquipmentTypes } from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import { getReportByIntervention, setReportPdfUrl } from '../api'
import { loadChecklistContext, visitItems } from '../../checklists/api'
import { responsesToByType } from '../schemas'
import type { ChecklistResponse } from '../schemas'
import { ClassicReportPdf } from './ClassicReportPdf'
import { generateAndUploadReportPdf } from './generateReportPdf'
import { CompactReportPdf } from './CompactReportPdf'
import { loadPreviousOpenAnomalies } from './previousAnomalies'
import type { AnomalyPdfEntry, ReportPdfProps } from './ReportPdf'
import { loadReportExtras } from './reportExtras'

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
  const checklistCtx = await loadChecklistContext(organizationId)
  const sections = (resolveEquipmentTypes(intervention) as EquipmentType[]).map((t) => ({
    type: t,
    label: EQUIPMENT_TYPES[t] ?? t,
    items: visitItems(checklistCtx, t),
    responses: byType[t] ?? [],
  }))

  const [unitEntries, settings, anomalies, clientNumber, dossierNumber] = await Promise.all([
    buildUnitEntriesForIntervention(interventionId, intervention.site_id).catch(() => []),
    getInvoicingSettings(organizationId).catch(() => null),
    listAnomaliesForIntervention(interventionId).catch(() => []),
    getClientNumber(intervention.client_id),
    intervention.dossier_number?.trim() || null,
  ])

  let anomalyEntries: AnomalyPdfEntry[] = []
  if (anomalies.length > 0) {
    const siteId = intervention.site_id
    const [units, zones] = await Promise.all([
      listEquipmentUnitsByIds(anomalies.map((a) => a.equipment_unit_id)),
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

  const pdfProps: ReportPdfProps = {
    intervention,
    report,
    sections,
    organizationName,
    unitEntries,
    settings,
    anomalyEntries,
    previousAnomalyEntries: await loadPreviousOpenAnomalies(interventionId, intervention.site_id).catch(() => []),
    clientNumber,
    dossierNumber,
    interventionType: intervention.intervention_type ? INTERVENTION_TYPE_LABELS[intervention.intervention_type] : null,
  }
  // Modèle choisi dans Paramètres : compte rendu classique ou rapport Firovia
  const element = settings?.report_template === 'classic'
    ? <ClassicReportPdf {...pdfProps} {...await loadReportExtras(intervention).catch(() => ({}))} />
    : <CompactReportPdf {...pdfProps} />
  const url = await generateAndUploadReportPdf(element, organizationId, interventionId, intervention.reference)
  await setReportPdfUrl(report.id, url)
  return url
}
