/**
 * Date de la visite affichée sur les rapports : le jour où le technicien a démarré
 * la visite (bouton Démarrer), sinon le jour prévu, sinon la finalisation.
 * Rouvrir puis refinaliser un rapport ne change donc pas sa date.
 */
export function visitDateSource(
  intervention: { started_at?: string | null; scheduled_date?: string | null },
  report: { completed_at?: string | null },
): string | null {
  return intervention.started_at || intervention.scheduled_date || report.completed_at || null
}
