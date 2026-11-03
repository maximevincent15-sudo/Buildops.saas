import { supabase } from '../../shared/lib/supabase'

/**
 * Le N° de dossier vaut pour une année : l'année suivante, le même chantier
 * reçoit un nouveau numéro. Chaque visite garde le sien ; le site porte le
 * numéro en cours (celui de sa visite la plus récente).
 */

export type DossierSuggestion = {
  /** Numéro à reprendre pour la visite, null s'il faut en saisir un nouveau */
  value: string | null
  /** Dernier numéro connu du site, pour mémoire quand value est null */
  previous: string | null
}

export type NumberedVisit = { id: string; dossier_number: string; scheduled_date: string | null; created_at: string }

const visitDate = (v: NumberedVisit) => v.scheduled_date ?? v.created_at.slice(0, 10)

/**
 * Numéro proposé pour une visite d'un site à une date : celui d'une autre
 * visite du site la même année ; sinon le numéro en cours du site, s'il n'a
 * pas déjà servi une autre année et que la visite n'est pas d'une année
 * passée ; sinon rien (nouvelle année : l'entreprise saisit le numéro).
 */
export function chooseDossierNumber(
  current: string | null,
  numberedVisits: NumberedVisit[],
  date: string | null | undefined,
  excludeVisitId?: string | null,
  thisYear = String(new Date().getFullYear()),
): DossierSuggestion {
  const year = date ? date.slice(0, 4) : thisYear
  const visits = numberedVisits
    .map((v) => ({ ...v, dossier_number: v.dossier_number.trim() }))
    .filter((v) => v.id !== excludeVisitId && v.dossier_number)
    .sort((a, b) => visitDate(b).localeCompare(visitDate(a)))

  const sameYear = visits.find((v) => visitDate(v).slice(0, 4) === year)
  if (sameYear) return { value: sameYear.dossier_number, previous: null }
  const usedOtherYear = visits.some((v) => v.dossier_number === current && visitDate(v).slice(0, 4) !== year)
  if (current && year >= thisYear && !usedOtherYear) return { value: current, previous: null }
  return { value: null, previous: visits[0]?.dossier_number ?? current }
}

/** Numéro proposé pour une visite d'un site (voir chooseDossierNumber) */
export async function suggestDossierNumber(
  siteId: string,
  date: string | null | undefined,
  excludeVisitId?: string | null,
): Promise<DossierSuggestion> {
  const [siteRes, visitsRes] = await Promise.all([
    supabase.from('sites').select('dossier_number').eq('id', siteId).maybeSingle(),
    supabase
      .from('interventions')
      .select('id, dossier_number, scheduled_date, created_at')
      .eq('site_id', siteId)
      .not('dossier_number', 'is', null),
  ])
  if (siteRes.error) throw siteRes.error
  if (visitsRes.error) throw visitsRes.error
  const current = (siteRes.data as { dossier_number: string | null } | null)?.dossier_number?.trim() || null
  return chooseDossierNumber(current, (visitsRes.data ?? []) as NumberedVisit[], date, excludeVisitId)
}

/**
 * Après l'enregistrement d'une visite de cette année ou à venir : son numéro
 * devient le numéro en cours du site si aucune visite plus récente du site
 * n'en porte un (une visite d'une année passée ne change rien). Sans effet
 * si l'utilisateur n'a pas le droit de modifier le site.
 */
export async function syncSiteDossierNumber(visit: {
  id: string
  site_id: string | null
  dossier_number?: string | null
  scheduled_date: string | null
  created_at: string
}): Promise<void> {
  const number = visit.dossier_number?.trim()
  const date = visit.scheduled_date ?? visit.created_at.slice(0, 10)
  if (!visit.site_id || !number || date.slice(0, 4) < String(new Date().getFullYear())) return
  const { data: site } = await supabase.from('sites').select('dossier_number').eq('id', visit.site_id).maybeSingle()
  if (!site || (site as { dossier_number: string | null }).dossier_number?.trim() === number) return
  const { data: later } = await supabase
    .from('interventions')
    .select('id')
    .eq('site_id', visit.site_id)
    .not('dossier_number', 'is', null)
    .neq('id', visit.id)
    .gt('scheduled_date', date)
    .limit(1)
  if ((later ?? []).length > 0) return
  await supabase.from('sites').update({ dossier_number: number }).eq('id', visit.site_id)
}

/**
 * Nouveau numéro saisi sur le site : il s'applique aux visites du site de
 * cette année et à venir qui n'en ont pas encore (les années passées gardent
 * le leur).
 */
export async function applySiteDossierToVisits(siteId: string, number: string): Promise<void> {
  const n = number.trim()
  if (!n) return
  const yearStart = `${new Date().getFullYear()}-01-01`
  await supabase
    .from('interventions')
    .update({ dossier_number: n })
    .eq('site_id', siteId)
    .is('dossier_number', null)
    .or(`scheduled_date.is.null,scheduled_date.gte.${yearStart}`)
}
