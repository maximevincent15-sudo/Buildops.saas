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
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }
  for (const row of rows) {
    if (row.status === 'invalid' || (row.status === 'duplicate' && row.duplicateAction === 'skip')) {
      result.skipped++
      continue
    }
    try {
      const outcome = await definition.importRow(row.values, row, ctx)
      if (outcome === 'created') result.created++
      else if (outcome === 'updated') result.updated++
      else result.skipped++
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? 'Erreur inconnue'
      result.errors.push({ rowIndex: row.index, message })
    }
  }
  return result
}
