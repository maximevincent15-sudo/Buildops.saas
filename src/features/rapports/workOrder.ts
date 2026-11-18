import { supabase } from '../../shared/lib/supabase'
import type { InterventionType } from '../planning/schemas'

/** Nature des travaux sur le bon d'intervention */
export const WORK_NATURES = ['maintenance', 'travaux', 'depannage'] as const
export type WorkNature = (typeof WORK_NATURES)[number]

export const WORK_NATURE_LABELS: Record<WorkNature, string> = {
  maintenance: 'Maintenance',
  travaux: 'Travaux',
  depannage: 'Dépannage',
}

/** Sécurité sur place (cases facultatives) */
export const SAFETY_ITEMS = ['EPI', 'Harnais', 'Nacelle ou échafaudage', 'Ligne de vie', 'Garde-corps'] as const

/**
 * Référentiels proposés par défaut : normes publiques du métier. Chaque
 * entreprise ajoute les siens (certifications, règles d'assureur) dans
 * « Autres référentiels ».
 */
export const DEFAULT_STANDARDS = [
  'NF S 61-919',
  'NF S 62-201',
  'NF C 71-800',
  'NF S 61-932',
  'NF S 61-933',
  'NF S 61-937',
  'NF S 61-938',
  'NF S 61-939',
  'NF S 61-961',
  'NF EN 12101-2',
  'NF EN 12101-3',
] as const

/** Référentiels proposés : la liste de l'entreprise (Paramètres), sinon la liste par défaut */
export function standardsFor(list: string[] | null | undefined): string[] {
  const own = (list ?? []).map((x) => x.trim()).filter(Boolean)
  return own.length > 0 ? own : [...DEFAULT_STANDARDS]
}

/** Ce qui est saisi en plus du rapport, gardé pour refaire le PDF à l'identique */
export type WorkOrder = {
  nature: WorkNature
  description: string
  safety: string[]
  standards: string[]
  other_standards: string
  /** Travaux finis et testés (RAS) */
  finished: boolean
  finished_date: string | null
  /** Travaux restants à faire */
  remaining: string
  /** Signature prise sur le bon quand le rapport n'en a pas */
  signed_by_name: string | null
  signature_data_url: string | null
  signed_at: string | null
  pdf_url: string | null
  pdf_path: string | null
  updated_at: string
  /** Envoi au client par mail (indépendant de l'envoi du rapport) */
  sent_to?: string | null
  sent_at?: string | null
}

export function natureFromType(t: InterventionType | null | undefined): WorkNature {
  if (t === 'depannage') return 'depannage'
  if (t === 'installation' || t === 'corrective') return 'travaux'
  return 'maintenance'
}

/** Enregistre le bon d'intervention sur le rapport de la visite */
export async function saveWorkOrder(reportId: string, workOrder: WorkOrder): Promise<void> {
  const { error } = await supabase.from('reports').update({ work_order: workOrder }).eq('id', reportId)
  if (error) throw error
}

/** Note l'envoi du bon au client (le rapport, lui, garde son propre suivi) */
export async function markWorkOrderSent(reportId: string, workOrder: WorkOrder, to: string): Promise<WorkOrder> {
  const updated: WorkOrder = { ...workOrder, sent_to: to, sent_at: new Date().toISOString() }
  await saveWorkOrder(reportId, updated)
  return updated
}
