import { z } from 'zod'

export const checkValueSchema = z.enum(['ok', 'nok', 'na'])

export const photoSchema = z.object({
  path: z.string(),
  url: z.string(),
})

export type ReportPhoto = z.infer<typeof photoSchema>

export const recommendedActionSchema = z.enum([
  'replacement',
  'repair',
  'verification',
])
export type RecommendedAction = z.infer<typeof recommendedActionSchema>

export const checklistResponseSchema = z.object({
  id: z.string(),
  value: checkValueSchema.nullable(),
  note: z.string().optional(),
  // Pour les items NOK : photos et action recommandée obligatoires (V1 applique la règle côté UI)
  photos: z.array(photoSchema).optional(),
  action: recommendedActionSchema.optional(),
  // Si le tech ne peut vraiment pas prendre de photo, on exige un texte explicatif.
  noPhotoReason: z.string().optional(),
})

export type ChecklistResponse = z.infer<typeof checklistResponseSchema>

export const upsertReportSchema = z.object({
  // Stockage : un array par équipement contrôlé, sous la forme d'un array plat
  // (compat DB / legacy). On sérialise/désérialise via les helpers ci-dessous.
  checklist: z.array(checklistResponseSchema),
  // Type d'équipement contrôlé par défaut (premier affiché au chargement).
  equipment_type: z.string().optional(),
  observations: z.string().optional(),
  signed_by_name: z.string().optional(),
  signature_data_url: z.string().nullable().optional(),
  photos: z.array(photoSchema).optional(),
})

export type UpsertReportInput = z.infer<typeof upsertReportSchema>

/**
 * Représente la checklist par type d'équipement dans l'UI.
 * Clé = equipment_type ('extincteurs', 'ria', ...), valeur = réponses.
 */
export type ChecklistByType = Record<string, ChecklistResponse[]>

export type Report = {
  id: string
  intervention_id: string
  organization_id: string
  equipment_type: string | null
  /**
   * Stocké en base sous forme d'array plat ChecklistResponse[].
   * Chaque ChecklistResponse contient un champ `id` qui est préfixé par le type
   * d'équipement : "extincteurs::plombage", "ria::pression", etc.
   * Pour la legacy (avant migration), les id n'ont pas de préfixe et sont
   * tous attribués à `equipment_type`.
   */
  checklist: ChecklistResponse[]
  observations: string | null
  signed_by_name: string | null
  signature_data_url: string | null
  photos: ReportPhoto[]
  pdf_url: string | null
  sent_to_email: string | null
  sent_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Helpers encodage/décodage par type d'équipement ──────────────────────

/** Encode "ria::pression" à partir de ("ria", "pression"). */
export function encodeChecklistId(equipmentType: string, itemId: string): string {
  return `${equipmentType}::${itemId}`
}

/**
 * Décode un id checklist en [equipmentType, itemId].
 * Retourne [null, itemId] si pas de préfixe (legacy).
 */
export function decodeChecklistId(encoded: string): [string | null, string] {
  const idx = encoded.indexOf('::')
  if (idx === -1) return [null, encoded]
  return [encoded.slice(0, idx), encoded.slice(idx + 2)]
}

/**
 * Convertit le tableau plat stocké en base en structure {type: responses}.
 * Les responses legacy (sans préfixe) sont attribuées à `defaultType`.
 */
export function responsesToByType(
  flat: ChecklistResponse[],
  defaultType: string | null,
): ChecklistByType {
  const out: ChecklistByType = {}
  for (const r of flat) {
    const [prefix, rawId] = decodeChecklistId(r.id)
    const type = prefix ?? defaultType
    if (!type) continue
    const bucket = (out[type] ??= [])
    bucket.push({ ...r, id: rawId })
  }
  return out
}

/**
 * Reconvertit la structure {type: responses} vers un tableau plat préfixé.
 */
export function byTypeToResponses(byType: ChecklistByType): ChecklistResponse[] {
  const out: ChecklistResponse[] = []
  for (const [type, responses] of Object.entries(byType)) {
    for (const r of responses) {
      out.push({ ...r, id: encodeChecklistId(type, r.id) })
    }
  }
  return out
}

// ─── Helpers de synthèse (utilisés par l'app ET le PDF) ───

export const RECOMMENDED_ACTION_LABEL: Record<RecommendedAction, string> = {
  replacement: 'Remplacement',
  repair: 'Réparation',
  verification: 'Vérification',
}

export type ReportSummary = {
  answered: number
  total: number
  okCount: number
  nokCount: number
  naCount: number
  isConform: boolean | null // null si incomplet
}

export function computeReportSummary(
  responses: ChecklistResponse[],
  totalItems: number,
): ReportSummary {
  const ok = responses.filter((r) => r.value === 'ok').length
  const nok = responses.filter((r) => r.value === 'nok').length
  const na = responses.filter((r) => r.value === 'na').length
  const answered = ok + nok + na
  const isConform = answered === totalItems ? nok === 0 : null
  return {
    answered,
    total: totalItems,
    okCount: ok,
    nokCount: nok,
    naCount: na,
    isConform,
  }
}

/**
 * Synthèse multi-équipements : agrège les compteurs de TOUS les types
 * contrôlés pour le tampon conforme/non-conforme global du rapport.
 */
export function computeGlobalSummary(
  byType: ChecklistByType,
  totalByType: Record<string, number>,
): ReportSummary {
  let ok = 0
  let nok = 0
  let na = 0
  let total = 0
  for (const [type, responses] of Object.entries(byType)) {
    ok += responses.filter((r) => r.value === 'ok').length
    nok += responses.filter((r) => r.value === 'nok').length
    na += responses.filter((r) => r.value === 'na').length
    total += totalByType[type] ?? 0
  }
  // Les types non-contrôlés du tout comptent aussi dans le total
  for (const [type, n] of Object.entries(totalByType)) {
    if (!byType[type]) total += n
  }
  // Corrige : total = somme de totalByType (on avait compté 2 fois)
  total = Object.values(totalByType).reduce((s, n) => s + n, 0)
  const answered = ok + nok + na
  const isConform = answered === total ? nok === 0 : null
  return {
    answered,
    total,
    okCount: ok,
    nokCount: nok,
    naCount: na,
    isConform,
  }
}
