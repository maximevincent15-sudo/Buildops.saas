/**
 * Rapprochement d'un QR code scanné avec un équipement.
 *
 * Les étiquettes des mainteneurs contiennent soit un code (« EXT-004512 »),
 * soit un lien (« https://…/equipement/004512?ref=A12 »). On compare donc le
 * contenu complet ET ses morceaux significatifs (dernier segment du chemin,
 * valeurs des paramètres) au QR code enregistré, puis au n° de l'équipement.
 */

export function normalizeCode(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '')
}

/** Morceaux bruts (casse d'origine) du contenu d'un QR code, pour une recherche en base */
export function qrRawParts(raw: string): string[] {
  const text = raw.trim()
  const out: string[] = [text]
  try {
    const url = new URL(text)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length > 0) out.push(decodeURIComponent(segments[segments.length - 1]!))
    for (const v of url.searchParams.values()) if (v) out.push(v)
    if (url.hash.length > 1) out.push(url.hash.slice(1))
  } catch {
    for (const part of text.split(/[;|\s]+/)) if (part && part !== text) out.push(part)
  }
  return Array.from(new Set(out.filter(Boolean)))
}

/** Valeurs candidates extraites du contenu d'un QR code, de la plus précise à la plus large */
export function qrCandidates(raw: string): string[] {
  const seen = new Set<string>()
  return qrRawParts(raw).map(normalizeCode).filter((c) => c && !seen.has(c) && (seen.add(c), true))
}

type Codeable = { id: string; qr_code: string | null; serial_number: string }

/**
 * Équipement correspondant au contenu scanné : d'abord par QR code enregistré
 * (contenu complet ou morceau), puis par n° d'unité. null si rien ou ambigu.
 */
export function matchUnitByQr<T extends Codeable>(units: T[], raw: string): T | null {
  const candidates = qrCandidates(raw)
  const full = candidates[0]
  // Correspondance exacte uniquement : « 1234 » ne doit jamais trouver « 12345 »
  const byQr = units.filter((u) => !!u.qr_code && candidates.includes(normalizeCode(u.qr_code)))
  if (byQr.length === 1) return byQr[0]!
  if (byQr.length > 1) return byQr.find((u) => normalizeCode(u.qr_code!) === full) ?? null
  const bySerial = units.filter((u) => candidates.includes(normalizeCode(u.serial_number)))
  return bySerial.length === 1 ? bySerial[0]! : null
}
