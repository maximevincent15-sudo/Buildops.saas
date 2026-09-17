import { supabase } from '../../shared/lib/supabase'
import type {
  Anomaly,
  AnomalyStatus,
  CreateAnomalyInput,
  UpdateAnomalyInput,
} from './schemas'
import { ACTIVE_ANOMALY_STATUSES } from './schemas'

// ─── Filtres de requête ─────────────────────────────────────────

export type AnomalyFilters = {
  status?: AnomalyStatus | AnomalyStatus[]
  equipmentUnitId?: string
  interventionId?: string
  siteId?: string
  clientId?: string
  onlyActive?: boolean
}

// ─── Lecture ─────────────────────────────────────────────────────

export async function listAnomalies(filters: AnomalyFilters = {}): Promise<Anomaly[]> {
  let q = supabase.from('anomalies').select('*')

  if (filters.status) {
    if (Array.isArray(filters.status)) q = q.in('status', filters.status)
    else q = q.eq('status', filters.status)
  }
  if (filters.onlyActive) q = q.in('status', ACTIVE_ANOMALY_STATUSES as unknown as string[])
  if (filters.equipmentUnitId) q = q.eq('equipment_unit_id', filters.equipmentUnitId)
  if (filters.interventionId) q = q.eq('intervention_id', filters.interventionId)

  q = q.order('detected_at', { ascending: false })

  const { data, error } = await q
  if (error) throw error
  let rows = (data ?? []) as Anomaly[]

  // Filtres qui requièrent une jointure : on filtre côté client sur les FK
  // via equipment_units.site_id / clients.
  if (filters.siteId || filters.clientId) {
    const unitIds = rows.map((a) => a.equipment_unit_id).filter((x): x is string => !!x)
    if (unitIds.length > 0) {
      const { data: units, error: unitsErr } = await supabase
        .from('equipment_units')
        .select('id, site_id, client_id')
        .in('id', unitIds)
      if (unitsErr) throw unitsErr
      const allowed = new Set(
        (units ?? [])
          .filter((u: { site_id: string | null; client_id: string | null }) => {
            if (filters.siteId && u.site_id !== filters.siteId) return false
            if (filters.clientId && u.client_id !== filters.clientId) return false
            return true
          })
          .map((u: { id: string }) => u.id),
      )
      rows = rows.filter(
        (a) => a.equipment_unit_id !== null && allowed.has(a.equipment_unit_id),
      )
    } else {
      rows = []
    }
  }

  return rows
}

export async function getAnomaly(id: string): Promise<Anomaly | null> {
  const { data, error } = await supabase
    .from('anomalies')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Anomaly | null) ?? null
}

/** Compteur global d'anomalies actives pour l'organisation courante. */
export async function countActiveAnomalies(): Promise<number> {
  const { count, error } = await supabase
    .from('anomalies')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_ANOMALY_STATUSES as unknown as string[])
  if (error) throw error
  return count ?? 0
}

/** Anomalies actives pour une unité donnée (utilisé au chargement du contrôle unitaire). */
export async function listActiveAnomaliesForUnit(unitId: string): Promise<Anomaly[]> {
  return listAnomalies({ equipmentUnitId: unitId, onlyActive: true })
}

/** Anomalies détectées lors d'une intervention (pour le PDF et le récap). */
export async function listAnomaliesForIntervention(
  interventionId: string,
): Promise<Anomaly[]> {
  return listAnomalies({ interventionId })
}

// ─── Écriture ───────────────────────────────────────────────────

export async function createAnomaly(
  input: CreateAnomalyInput,
  organizationId: string,
  detectedBy?: { id?: string | null; name?: string | null } | null,
): Promise<Anomaly> {
  const payload = {
    organization_id: organizationId,
    equipment_unit_id: input.equipment_unit_id ?? null,
    intervention_id: input.intervention_id ?? null,
    equipment_check_id: input.equipment_check_id ?? null,

    title: input.title.trim(),
    description: input.description?.trim() || null,
    checklist_item_id: input.checklist_item_id?.trim() || null,
    checklist_item_label: input.checklist_item_label?.trim() || null,

    action: input.action ?? null,
    priority: input.priority,
    status: 'open' as const,

    due_date: input.due_date ?? null,
    photos: input.photos ?? [],

    detected_by: detectedBy?.id ?? null,
    detected_by_name: detectedBy?.name ?? input.detected_by_name ?? null,
    created_by: detectedBy?.id ?? null,
  }

  const { data, error } = await supabase
    .from('anomalies')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data as Anomaly
}

export async function updateAnomaly(
  id: string,
  input: UpdateAnomalyInput,
): Promise<Anomaly> {
  const patch: Record<string, unknown> = {}

  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null
  }
  if (input.checklist_item_id !== undefined) {
    patch.checklist_item_id = input.checklist_item_id?.trim() || null
  }
  if (input.checklist_item_label !== undefined) {
    patch.checklist_item_label = input.checklist_item_label?.trim() || null
  }
  if (input.action !== undefined) patch.action = input.action
  if (input.priority !== undefined) patch.priority = input.priority
  if (input.status !== undefined) patch.status = input.status
  if (input.due_date !== undefined) patch.due_date = input.due_date ?? null
  if (input.photos !== undefined) patch.photos = input.photos
  if (input.resolution_notes !== undefined) {
    patch.resolution_notes = input.resolution_notes?.trim() || null
  }
  if (input.equipment_unit_id !== undefined) {
    patch.equipment_unit_id = input.equipment_unit_id ?? null
  }
  if (input.intervention_id !== undefined) {
    patch.intervention_id = input.intervention_id ?? null
  }
  if (input.equipment_check_id !== undefined) {
    patch.equipment_check_id = input.equipment_check_id ?? null
  }

  const { data, error } = await supabase
    .from('anomalies')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Anomaly
}

/** Marque une anomalie comme résolue. Le trigger DB set resolved_at automatiquement. */
export async function resolveAnomaly(
  id: string,
  resolutionNotes?: string | null,
  resolvedById?: string | null,
): Promise<Anomaly> {
  const patch: Record<string, unknown> = { status: 'resolved' }
  if (resolutionNotes !== undefined) {
    patch.resolution_notes = resolutionNotes?.trim() || null
  }
  if (resolvedById !== undefined) patch.resolved_by = resolvedById

  const { data, error } = await supabase
    .from('anomalies')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Anomaly
}

/** Rouvre une anomalie résolue. Le trigger DB nettoie resolved_at/resolved_by. */
export async function reopenAnomaly(id: string): Promise<Anomaly> {
  const { data, error } = await supabase
    .from('anomalies')
    .update({ status: 'open' })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Anomaly
}

/** Clôture définitive (équipement retiré du service, faux positif, etc.). */
export async function closeAnomaly(
  id: string,
  resolutionNotes?: string | null,
): Promise<Anomaly> {
  const patch: Record<string, unknown> = { status: 'closed' }
  if (resolutionNotes !== undefined) {
    patch.resolution_notes = resolutionNotes?.trim() || null
  }
  const { data, error } = await supabase
    .from('anomalies')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Anomaly
}

export async function deleteAnomaly(id: string): Promise<void> {
  const { error } = await supabase.from('anomalies').delete().eq('id', id)
  if (error) throw error
}
