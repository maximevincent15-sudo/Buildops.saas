import type { CSSProperties } from 'react'

/**
 * Mise en forme d'une ligne de devis ou de facture : la désignation (première
 * ligne) et la précision dessous (délai de livraison, référence…) ont chacune
 * leur style, appliqué à tout le texte. Absent = style normal.
 */

export type LineColor = 'grey' | 'blue' | 'red' | 'green'
export type LineSize = 'sm' | 'lg'

export type LineTextStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  size?: LineSize
  color?: LineColor
}

export type LinePart = 'main' | 'detail'
export type LineFormat = Partial<Record<LinePart, LineTextStyle>>

export const LINE_COLORS: Record<LineColor, { label: string; hex: string }> = {
  grey: { label: 'Gris', hex: '#6B7280' },
  blue: { label: 'Bleu', hex: '#2F5BB7' },
  red: { label: 'Rouge', hex: '#B42318' },
  green: { label: 'Vert', hex: '#1F7A4D' },
}

/** Désignation et précision d'une description (« désignation\nprécision… ») */
export function splitDescription(text: string): { main: string; detail: string } {
  const i = text.indexOf('\n')
  return i < 0 ? { main: text, detail: '' } : { main: text.slice(0, i), detail: text.slice(i + 1) }
}

export function joinDescription(main: string, detail: string): string {
  return detail ? `${main}\n${detail}` : main
}

function cleanStyle(s: LineTextStyle | undefined): LineTextStyle | undefined {
  if (!s) return undefined
  const out: LineTextStyle = {}
  if (s.bold) out.bold = true
  if (s.italic) out.italic = true
  if (s.underline) out.underline = true
  if (s.size === 'sm' || s.size === 'lg') out.size = s.size
  if (s.color && s.color in LINE_COLORS) out.color = s.color
  return Object.keys(out).length > 0 ? out : undefined
}

/** Format à enregistrer : sans les réglages vides, null s'il ne reste rien */
export function cleanLineFormat(f: LineFormat | null | undefined): LineFormat | null {
  const main = cleanStyle(f?.main)
  const detail = cleanStyle(f?.detail)
  if (!main && !detail) return null
  return { ...(main ? { main } : {}), ...(detail ? { detail } : {}) }
}

// Tailles à l'écran : désignation .82rem, précision .74rem (feuille de style)
const SCREEN_SIZES: Record<LinePart, Record<LineSize, string>> = {
  main: { sm: '.74rem', lg: '.95rem' },
  detail: { sm: '.68rem', lg: '.82rem' },
}

/** Style à l'écran (zone de saisie de la désignation ou de la précision) */
export function lineStyleCss(s: LineTextStyle | undefined, part: LinePart): CSSProperties {
  return {
    fontWeight: s?.bold ? 700 : undefined,
    fontStyle: s?.italic ? 'italic' : undefined,
    textDecoration: s?.underline ? 'underline' : undefined,
    fontSize: s?.size ? SCREEN_SIZES[part][s.size] : undefined,
    color: s?.color ? LINE_COLORS[s.color].hex : undefined,
  }
}

/** Style dans le PDF (polices standard Helvetica), à partir de la taille de base */
export function lineStylePdf(s: LineTextStyle | undefined, baseSize: number): Record<string, string | number> {
  const font = s?.bold && s?.italic ? 'Helvetica-BoldOblique'
    : s?.bold ? 'Helvetica-Bold'
      : s?.italic ? 'Helvetica-Oblique'
        : null
  return {
    ...(font ? { fontFamily: font } : {}),
    ...(s?.underline ? { textDecoration: 'underline' } : {}),
    ...(s?.size ? { fontSize: s.size === 'sm' ? baseSize - 1.5 : baseSize + 1.5 } : {}),
    ...(s?.color ? { color: LINE_COLORS[s.color].hex } : {}),
  }
}
