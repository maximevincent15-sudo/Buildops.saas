import { supabase } from '../../shared/lib/supabase'
import type { EquipmentType } from '../../shared/constants/interventions'
import { listFamilyTemplates } from '../equipment/api'
import type { EquipmentFamily, FamilyTemplate } from '../equipment/schemas'
import { CHECKLISTS } from '../rapports/checklists'
import { CODE_LIST_FAMILIES, CODE_UNIT_LISTS } from './builtins'

/**
 * Checklists de l'entreprise : ses listes modifiées ou créées
 * (checklist_templates) par-dessus les listes Firovia.
 */

export type ChecklistScope = 'visit' | 'unit'
export type ChecklistPoint = { id: string; label: string }

export type ChecklistTemplateRow = {
  id: string
  organization_id: string
  scope: ChecklistScope
  kind: string
  builtin_key: string | null
  name: string
  items: ChecklistPoint[]
  position: number
  created_at: string
  updated_at: string
}

/** Une liste telle qu'elle s'applique (Firovia, modifiée ou créée par l'entreprise) */
export type EffectiveList = {
  /** Clé gardée sur l'appareil : clé Firovia, ou id de la liste créée */
  key: string
  name: string
  items: ChecklistPoint[]
  /** Liste Firovia d'origine (null pour une liste créée par l'entreprise) */
  builtinKey: string | null
  /** Ligne de l'entreprise (modification ou création), null si liste Firovia telle quelle */
  rowId: string | null
}

export type ChecklistContext = { rows: ChecklistTemplateRow[]; familyTemplates: FamilyTemplate[] }

export const visitBuiltinKey = (type: string) => `visit:${type}`
export const unitBuiltinKey = (family: string) => `unit:${family}`

// ─── Lecture, avec cache par entreprise ──────────────────

export async function listChecklistTemplates(): Promise<ChecklistTemplateRow[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChecklistTemplateRow[]
}

const contextCache = new Map<string, Promise<ChecklistContext>>()

/** Listes de l'entreprise et listes Firovia ; sans réseau, les listes Firovia seules */
export function loadChecklistContext(organizationId: string | null | undefined): Promise<ChecklistContext> {
  const key = organizationId ?? ''
  let ctx = contextCache.get(key)
  if (!ctx) {
    ctx = Promise.all([
      listChecklistTemplates().catch(() => [] as ChecklistTemplateRow[]),
      listFamilyTemplates().catch(() => [] as FamilyTemplate[]),
    ]).then(([rows, familyTemplates]) => ({ rows, familyTemplates }))
    contextCache.set(key, ctx)
  }
  return ctx
}

export function invalidateChecklistContext() {
  contextCache.clear()
}

// ─── Listes applicables ──────────────────────────────────

/** Checklist de la visite pour un type d'équipement */
export function visitList(ctx: ChecklistContext | null, type: EquipmentType): EffectiveList {
  const builtinKey = visitBuiltinKey(type)
  const row = ctx?.rows.find((r) => r.scope === 'visit' && r.builtin_key === builtinKey)
  return {
    key: builtinKey,
    name: row?.name ?? 'Checklist de la visite',
    items: row?.items ?? CHECKLISTS[type] ?? [],
    builtinKey,
    rowId: row?.id ?? null,
  }
}

/** Points de la checklist de la visite pour un type (liste de l'entreprise, sinon Firovia) */
export function visitItems(ctx: ChecklistContext | null, type: EquipmentType): ChecklistPoint[] {
  return visitList(ctx, type).items
}

/** Listes par appareil d'une famille : les listes Firovia (modifiées ou non), puis celles créées par l'entreprise */
export function unitLists(ctx: ChecklistContext | null, family: EquipmentFamily): EffectiveList[] {
  const builtins: Array<{ key: string; name: string; items: ChecklistPoint[] }> = CODE_LIST_FAMILIES.has(family)
    ? CODE_UNIT_LISTS.filter((l) => l.family === family)
    : (ctx?.familyTemplates ?? [])
        .filter((t) => t.family === family)
        .slice(0, 1)
        .map((t) => ({ key: unitBuiltinKey(family), name: t.name, items: t.checklist.map(({ id, label }) => ({ id, label })) }))
  const rows = ctx?.rows.filter((r) => r.scope === 'unit') ?? []
  const fromBuiltins = builtins.map((b) => {
    const row = rows.find((r) => r.builtin_key === b.key)
    return { key: b.key, name: row?.name ?? b.name, items: row?.items ?? b.items, builtinKey: b.key, rowId: row?.id ?? null }
  })
  const created = rows
    .filter((r) => r.kind === family && !r.builtin_key)
    .map((r) => ({ key: r.id, name: r.name, items: r.items, builtinKey: null, rowId: r.id }))
  return [...fromBuiltins, ...created]
}

/** Liste à utiliser pour un appareil : celle choisie, sinon la première de sa famille */
export function unitListFor(ctx: ChecklistContext | null, family: EquipmentFamily, key: string | null | undefined): EffectiveList | null {
  const lists = unitLists(ctx, family)
  return (key ? lists.find((l) => l.key === key) : undefined) ?? lists[0] ?? null
}

// ─── Écriture (administrateurs) ──────────────────────────

/** Identifiant d'un nouveau point (sans « :: », réservé au rapport) */
export function newPointId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export async function saveChecklistTemplate(input: {
  organizationId: string
  rowId: string | null
  scope: ChecklistScope
  kind: string
  builtinKey: string | null
  name: string
  items: ChecklistPoint[]
  position?: number
}): Promise<ChecklistTemplateRow> {
  const items = input.items
    .map((it) => ({ id: it.id, label: it.label.trim() }))
    .filter((it) => it.label)
  const payload = {
    name: input.name.trim() || 'Liste de contrôle',
    items,
    updated_at: new Date().toISOString(),
  }
  const query = input.rowId
    ? supabase.from('checklist_templates').update(payload).eq('id', input.rowId)
    : supabase.from('checklist_templates').insert({
        ...payload,
        organization_id: input.organizationId,
        scope: input.scope,
        kind: input.kind,
        builtin_key: input.builtinKey,
        position: input.position ?? 0,
      })
  const { data, error } = await query.select().single()
  if (error) throw error
  invalidateChecklistContext()
  return data as ChecklistTemplateRow
}

/** Supprime une liste de l'entreprise (une liste Firovia modifiée revient à l'origine) */
export async function deleteChecklistTemplate(rowId: string): Promise<void> {
  const { error } = await supabase.from('checklist_templates').delete().eq('id', rowId)
  if (error) throw error
  invalidateChecklistContext()
}

/** Garde sur l'appareil la liste choisie pendant le contrôle */
export async function setUnitChecklistKey(unitId: string, key: string | null): Promise<void> {
  const { error } = await supabase.from('equipment_units').update({ checklist_key: key }).eq('id', unitId)
  if (error) throw error
}
