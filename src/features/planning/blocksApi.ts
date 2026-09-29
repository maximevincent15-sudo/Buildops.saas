import { supabase } from '../../shared/lib/supabase'

export type PlanningBlockColor = 'neutral' | 'acc' | 'grn' | 'org' | 'red'

export type PlanningBlock = {
  id: string
  organization_id: string
  date: string // YYYY-MM-DD
  label: string
  start_time: string | null // 'HH:MM:SS' (Postgres time)
  end_time: string | null
  color: PlanningBlockColor
  /** Note libre (lien de visio, adresse…) */
  notes: string | null
  /** true = visible uniquement par son auteur */
  is_private: boolean
  created_at: string
  created_by: string | null
}

/** Événement d'agenda saisi depuis le « + » d'un jour du planning */
export type PlanningEventInput = {
  date: string // YYYY-MM-DD
  label: string
  startTime: string | null // 'HH:MM' (null = toute la journée)
  endTime: string | null
  color: PlanningBlockColor
  notes: string | null
  isPrivate: boolean
}

export type CreateBlockInput = {
  label: string
  startTime: string | null // 'HH:MM'
  endTime: string | null
  color?: PlanningBlockColor
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
    .order('start_time', { ascending: true, nullsFirst: true })
  if (error) throw error
  return (data ?? []) as PlanningBlock[]
}

export async function createBlocks(
  organizationId: string,
  dates: string[],
  input: CreateBlockInput,
): Promise<PlanningBlock[]> {
  const rows = dates.map((date) => ({
    organization_id: organizationId,
    date,
    label: input.label,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    color: input.color ?? 'neutral',
  }))
  const { data, error } = await supabase
    .from('planning_blocks')
    .insert(rows)
    .select()
  if (error) throw error
  return (data ?? []) as PlanningBlock[]
}

function eventRow(input: PlanningEventInput) {
  return {
    date: input.date,
    label: input.label.trim(),
    start_time: input.startTime || null,
    end_time: input.startTime ? input.endTime || null : null,
    color: input.color,
    notes: input.notes?.trim() || null,
    is_private: input.isPrivate,
  }
}

export async function createPlanningEvent(
  organizationId: string,
  input: PlanningEventInput,
): Promise<PlanningBlock> {
  // created_by est rempli par la base (auth.uid()) : requis pour un événement privé
  const { data, error } = await supabase
    .from('planning_blocks')
    .insert({ organization_id: organizationId, ...eventRow(input) })
    .select()
    .single()
  if (error) throw error
  return data as PlanningBlock
}

export async function updatePlanningEvent(id: string, input: PlanningEventInput): Promise<PlanningBlock> {
  const { data, error } = await supabase
    .from('planning_blocks')
    .update(eventRow(input))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PlanningBlock
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('planning_blocks').delete().eq('id', id)
  if (error) throw error
}

export function formatBlockTime(startTime: string | null, endTime: string | null): string {
  function fmt(t: string | null): string {
    if (!t) return ''
    const [h, m] = t.split(':')
    return `${parseInt(h ?? '0', 10)}h${m ?? '00'}`
  }
  if (startTime && endTime) return `${fmt(startTime)}–${fmt(endTime)}`
  if (startTime) return fmt(startTime)
  return ''
}
