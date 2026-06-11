/**
 * Validation et normalisation des SIRET (Système d'Identification du Répertoire des Établissements).
 *
 * Un SIRET = 14 chiffres :
 *  - les 9 premiers chiffres forment le SIREN (identifiant de l'entreprise)
 *  - les 5 derniers identifient l'établissement (siège, agence, etc.)
 *
 * La validité d'un SIRET se vérifie par l'algorithme de Luhn (somme pondérée
 * modulo 10 = 0).
 *
 * Exception historique : La Poste (SIREN 356000000) — chaque SIRET de La Poste
 * échoue au check Luhn standard mais reste valide. On gère ce cas.
 */

/** Enlève espaces et caractères non-numériques. */
export function normalizeSiret(raw: string): string {
  return (raw ?? '').replace(/\D/g, '')
}

/** Vérifie qu'un SIRET respecte l'algorithme de Luhn. */
function luhnCheck(siret: string): boolean {
  if (!/^\d{14}$/.test(siret)) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let digit = Number(siret[i])
    // Sur les positions paires (index 1, 3, 5...) on multiplie par 2
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/**
 * Valide un SIRET (format + Luhn + cas spéciaux).
 * Retourne `{ ok: true }` ou `{ ok: false, reason: '...' }`.
 */
export function validateSiret(raw: string): { ok: true } | { ok: false; reason: string } {
  const siret = normalizeSiret(raw)

  if (siret.length === 0) {
    return { ok: false, reason: 'SIRET requis' }
  }
  if (siret.length < 14) {
    return { ok: false, reason: `Encore ${14 - siret.length} chiffre(s)` }
  }
  if (siret.length > 14) {
    return { ok: false, reason: 'Un SIRET fait exactement 14 chiffres' }
  }

  // Cas spécial : La Poste — SIREN 356000000, n'importe quel SIRET valide
  // car La Poste a des établissements pré-attribués qui ne passent pas Luhn.
  const isLaPoste = siret.startsWith('356000000')
  if (isLaPoste) return { ok: true }

  if (!luhnCheck(siret)) {
    return { ok: false, reason: 'SIRET invalide (clé de contrôle Luhn incorrecte)' }
  }
  return { ok: true }
}

/** Formate un SIRET pour l'affichage : XXX XXX XXX XXXXX */
export function formatSiret(raw: string): string {
  const s = normalizeSiret(raw)
  if (s.length <= 3) return s
  if (s.length <= 6) return `${s.slice(0, 3)} ${s.slice(3)}`
  if (s.length <= 9) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
}
