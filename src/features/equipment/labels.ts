/**
 * Étiquettes QR Firovia : chaque étiquette porte un lien court
 * app.firovia.fr/e/<CODE>. Scanné dans Firovia, il ouvre l'appareil ; scanné
 * avec l'appareil photo du téléphone, il ouvre aussi sa fiche.
 */

export const LABEL_URL_BASE = 'https://app.firovia.fr/e/'

// Sans 0/O, 1/I/L : lisible à l'œil si l'étiquette est abîmée
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function newLabelCode(length = 8): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function labelUrl(code: string): string {
  return `${LABEL_URL_BASE}${code}`
}

/** Code d'une étiquette Firovia (« …/e/7KQ2M9XA » → « 7KQ2M9XA »), sinon null */
export function firoviaLabelCode(text: string | null | undefined): string | null {
  const m = /^https?:\/\/[^/]+\/e\/([A-Za-z0-9]{6,16})\/?$/.exec((text ?? '').trim())
  return m ? m[1]!.toUpperCase() : null
}

export type LabelFormat = {
  id: string
  label: string
  cols: number
  rows: number
  /** Dimensions d'une étiquette et marges de la planche, en mm */
  width: number
  height: number
  marginTop: number
  marginLeft: number
  gapX: number
  gapY: number
}

export const LABEL_FORMATS: LabelFormat[] = [
  {
    id: '70x37',
    label: '70 × 37 mm — 24 par planche (ex. Avery 3474)',
    cols: 3, rows: 8, width: 70, height: 37, marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0,
  },
  {
    id: '63x34',
    label: '63,5 × 33,9 mm — 24 par planche (ex. Avery L7159, L4773 polyester)',
    cols: 3, rows: 8, width: 63.5, height: 33.9, marginTop: 12.9, marginLeft: 7.2, gapX: 2.5, gapY: 0,
  },
]

/** Contenu d'une étiquette à imprimer */
export type LabelItem = {
  /** Texte encodé dans le QR code */
  qr: string
  /** Gros texte : repère (EXT-12) ou code de l'étiquette vierge */
  title: string
  /** Lignes sous le repère : emplacement, site… */
  lines: string[]
}
