import {
  INTERVENTION_STATUSES,
  STATUS_BADGE_CLASSES,
} from '../../../shared/constants/interventions'
import type { InterventionStatus } from '../../../shared/constants/interventions'

export function InterventionStatusBadge({ status }: { status: string }) {
  const s = status as InterventionStatus
  const cls = STATUS_BADGE_CLASSES[s] ?? 'b-gry'
  const label = INTERVENTION_STATUSES[s] ?? status
  return <span className={`badge ${cls}`}>{label}</span>
}
