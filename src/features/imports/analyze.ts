import type { ImportContext, ImportDefinition, ImportResult, RowAnalysis } from './types'

/**
 * Analyse (validation + dédup) de toutes les lignes lues dans le fichier.
 * On conserve les `values` renvoyées par validateRow : certaines définitions
 * y ajoutent des données résolues (ex : __resolved_site_id pour les
 * équipements) indispensables à importRow.
 */
export async function analyzeRows(
  parsed: Record<string, string | null>[],
  definition: ImportDefinition,
  ctx: ImportContext,
): Promise<RowAnalysis[]> {
  const analyses: RowAnalysis[] = []
  for (let i = 0; i < parsed.length; i++) {
    const analysis = await definition.validateRow(parsed[i], ctx)
    analyses.push({
      ...analysis,
      index: i,
      values: analysis.values ?? parsed[i],
      duplicateAction: analysis.status === 'duplicate' ? 'skip' : undefined,
    })
  }
  return analyses
}

/**
 * Enregistre les lignes analysées (ignore les invalides et les doublons
 * marqués « ignorer »). Les erreurs sont collectées ligne par ligne.
 */
export async function importRows(
  rows: RowAnalysis[],
  definition: ImportDefinition,
  ctx: ImportContext,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }
  const toMessage = (err: unknown) => err instanceof Error
    ? err.message
    : (err as { message?: string })?.message ?? 'Erreur inconnue'
  const count = (outcome: 'created' | 'updated' | 'skipped') => {
    if (outcome === 'created') result.created++
    else if (outcome === 'updated') result.updated++
    else result.skipped++
  }

  const todo = rows.filter((row) => !(row.status === 'invalid' || (row.status === 'duplicate' && row.duplicateAction === 'skip')))
  result.skipped += rows.length - todo.length
  onProgress?.(0, todo.length)

  // Gros fichiers : insertion par lots quand la définition le permet
  if (definition.importBatch) {
    const size = definition.batchSize ?? 500
    for (let i = 0; i < todo.length; i += size) {
      const chunk = todo.slice(i, i + size)
      try {
        const outcomes = await definition.importBatch(chunk.map((r) => ({ row: r.values, analysis: r })), ctx)
        outcomes.forEach((o, j) => {
          if ('error' in o) result.errors.push({ rowIndex: chunk[j]!.index, message: o.error })
          else count(o.outcome)
        })
      } catch (err) {
        for (const r of chunk) result.errors.push({ rowIndex: r.index, message: toMessage(err) })
      }
      onProgress?.(Math.min(i + size, todo.length), todo.length)
    }
    return result
  }

  for (const [i, row] of todo.entries()) {
    try {
      count(await definition.importRow(row.values, row, ctx))
    } catch (err) {
      result.errors.push({ rowIndex: row.index, message: toMessage(err) })
    }
    if ((i + 1) % 10 === 0 || i + 1 === todo.length) onProgress?.(i + 1, todo.length)
  }
  return result
}
