import type { CheckVerdict } from '../equipment/schemas'
import type { ReportSummary } from './schemas'

export type ReportConformity = {
  /** true = conforme, false = non conforme, null = incomplet */
  isConform: boolean | null
  /** Points NOK de la checklist globale + équipements « à surveiller » / « à réformer » */
  anomalyCount: number
  /** Le rapport est fait équipement par équipement (au moins un verdict posé) */
  unitControlsActive: boolean
  unitsChecked: number
  unitsTotal: number
}

/**
 * Conformité d'un rapport : source unique pour le PDF, l'écran du rapport,
 * l'email au client et le portail client (via reports.is_conform).
 *
 * Non conforme dès qu'il y a un point NOK dans la checklist globale OU un
 * équipement à surveiller / à réformer. Quand le rapport est fait équipement
 * par équipement, la checklist globale reste vide : la complétude se juge
 * alors sur les équipements contrôlés.
 */
export function computeConformity(
  checklist: Pick<ReportSummary, 'answered' | 'total' | 'nokCount'>,
  unitVerdicts: CheckVerdict[],
): ReportConformity {
  const unitsChecked = unitVerdicts.filter((v) => v !== 'non_verifie').length
  const unitAnomalies = unitVerdicts.filter((v) => v === 'surveiller' || v === 'reformer').length
  const unitControlsActive = unitsChecked > 0
  const anomalyCount = checklist.nokCount + unitAnomalies

  let isConform: boolean | null
  if (anomalyCount > 0) isConform = false
  else if (unitControlsActive) isConform = unitsChecked === unitVerdicts.length ? true : null
  else isConform = checklist.answered === checklist.total ? true : null

  return { isConform, anomalyCount, unitControlsActive, unitsChecked, unitsTotal: unitVerdicts.length }
}
