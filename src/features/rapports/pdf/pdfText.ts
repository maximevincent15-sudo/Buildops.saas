/**
 * Textes des PDF : la police intégrée (Helvetica) ne connaît que les
 * caractères latins courants. Les autres disparaissent à l'impression
 * (« CO₂ » devenait « CO, »). On les remplace par un équivalent lisible.
 */

const REPLACEMENTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '−': '-', '‑': '-', '‐': '-',
}

const PATTERN = new RegExp(`[${Object.keys(REPLACEMENTS).join('')}]`, 'g')

export function pdfSafeText(text: string): string {
  return text.replace(PATTERN, (c) => REPLACEMENTS[c] ?? c)
}

/** Copie des données du PDF avec tous les textes nettoyés (objets et tableaux simples) */
export function pdfSafe<T>(value: T): T {
  if (typeof value === 'string') return pdfSafeText(value) as T
  if (Array.isArray(value)) return value.map((v) => pdfSafe(v)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = pdfSafe(v)
    return out as T
  }
  return value
}
