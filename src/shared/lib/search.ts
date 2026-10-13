/** Recherche sans tenir compte des accents ni des majuscules (« beausejour » trouve « Beauséjour ») */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Vrai si chaque mot de la recherche apparaît dans l'un des champs (ordre libre).
 * Les numéros de téléphone sont aussi comparés sans espaces ni points
 * (« 0146 » trouve « 01 46 10 22 80 »).
 */
export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = normalizeSearch(fields.filter(Boolean).join(' '))
  const compact = hay.replace(/[\s.\-/]/g, '')
  return words.every((w) => hay.includes(w) || compact.includes(w.replace(/[.\-/]/g, '')))
}
