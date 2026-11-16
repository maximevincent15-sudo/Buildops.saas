import { supabase } from '../../../shared/lib/supabase'

/**
 * Date de la prochaine visite à imprimer sur le rapport : la visite créée à la
 * clôture (récurrence), sinon la prochaine visite prévue sur le même site.
 */
export async function loadNextVisitDate(i: { id: string; site_id: string | null; scheduled_date: string | null }): Promise<string | null> {
  const { data: child } = await supabase
    .from('interventions')
    .select('scheduled_date')
    .eq('parent_intervention_id', i.id)
    .not('scheduled_date', 'is', null)
    .order('scheduled_date', { ascending: true })
    .limit(1)
  const fromChild = (child as Array<{ scheduled_date: string | null }> | null)?.[0]?.scheduled_date
  if (fromChild) return fromChild
  if (!i.site_id) return null
  let next = supabase
    .from('interventions')
    .select('scheduled_date')
    .eq('site_id', i.site_id)
    .neq('id', i.id)
    .in('status', ['a_planifier', 'planifiee', 'en_cours'])
    .not('scheduled_date', 'is', null)
    .order('scheduled_date', { ascending: true })
    .limit(1)
  if (i.scheduled_date) next = next.gt('scheduled_date', i.scheduled_date)
  const { data } = await next
  return (data as Array<{ scheduled_date: string | null }> | null)?.[0]?.scheduled_date ?? null
}
