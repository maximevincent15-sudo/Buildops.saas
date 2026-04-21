import { supabase } from '../../shared/lib/supabase'

export type PlanningBlockColor = 'neutral' | 'acc' | 'grn' | 'org' | 'red'

export type PlanningBlock = {
  id: string
  organization_id: string
  date: string // YYYY-MM-DD
  label: string
  color: PlanningBlockColor
  created_at: string
  created_by: string | null
}

export async function listBlocksForRange(
  startDate: string,
  endDate: string,
): Promise<PlanningBlock[]> {
  const { data, error } = await supabase
    .from('planning_blocks')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as PlanningBlock[]
}

export async function createBlocks(
  organizationId: string,
  dates: string[],
  label: string,
  color: PlanningBlockColor = 'neutral',
): Promise<PlanningBlock[]> {
  const rows = dates.map((date) => ({
    organization_id: organizationId,
    date,
    label,
    color,
  }))
  const { data, error } = await supabase
    .from('planning_blocks')
    .insert(rows)
    .select()
  if (error) throw error
  return (data ?? []) as PlanningBlock[]
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('planning_blocks').delete().eq('id', id)
  if (error) throw error
}
