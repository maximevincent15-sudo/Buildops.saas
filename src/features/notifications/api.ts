import { supabase } from '../../shared/lib/supabase'
import type { Intervention } from '../planning/schemas'

/**
 * Notifications de l'équipe par mail (Edge Function notify-team). Envoi en
 * arrière-plan : une erreur n'interrompt jamais l'action de l'utilisateur.
 */
function invokeNotify(body: Record<string, unknown>): void {
  void supabase.functions.invoke('notify-team', { body }).catch((err) => {
    console.warn('Notification non envoyée', err)
  })
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Planned = Pick<Intervention, 'id' | 'technician_id' | 'scheduled_date' | 'start_time' | 'status'>

/**
 * Prévient le technicien d'une intervention qu'on vient de lui attribuer ou
 * de déplacer (date / heure). Rien pour une intervention passée, terminée, ou
 * sans changement qui le concerne.
 */
export function notifyAssignmentIfNeeded(before: Planned | null, after: Planned): void {
  if (!after.technician_id || !after.scheduled_date) return
  if (after.status === 'terminee' || after.scheduled_date < todayIso()) return
  const newTechnician = !before || before.technician_id !== after.technician_id
  const moved = !!before && (before.scheduled_date !== after.scheduled_date || (before.start_time ?? null) !== (after.start_time ?? null))
  if (!newTechnician && !moved) return
  invokeNotify({ event: 'intervention_assigned', interventionId: after.id, changed: !newTechnician && moved })
}

/** Prévient les administrateurs qu'un rapport vient d'être terminé */
export function notifyReportCompleted(interventionId: string): void {
  invokeNotify({ event: 'report_completed', interventionId })
}
