import { useEffect, useState } from 'react'
import { normalizeSiret } from '../auth/siret'

/**
 * Recherche d'une entreprise cliente par SIREN (9 chiffres) ou SIRET
 * (14 chiffres) dans l'annuaire public recherche-entreprises.api.gouv.fr.
 *
 * Contrairement à useSiretLookup (inscription), on ne vérifie PAS l'unicité
 * côté Firovia : plusieurs PME peuvent avoir le même client.
 */

export type CompanyNumber = {
  kind: 'siren' | 'siret'
  value: string
  siren: string
  siret: string | null
}

export type CompanyInfo = {
  name: string
  address: string | null
  siren: string
  siret: string | null
  naf: string | null
  closed: boolean
}

export type CompanyLookupState =
  | { status: 'idle' }
  | { status: 'typing'; hint: string }
  | { status: 'invalid'; reason: string }
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'ok'; company: CompanyInfo }

const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search'

/** Luhn générique (SIREN et SIRET) : on double 1 chiffre sur 2 en partant de l'avant-dernier. */
function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i])
    if ((digits.length - 1 - i) % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/**
 * Valide un SIREN ou un SIRET. Chaîne vide → null (champ optionnel).
 * La Poste (SIREN 356000000) a des SIRET hors Luhn : on les accepte.
 */
export function parseCompanyNumber(
  raw: string | null | undefined,
): { ok: true; number: CompanyNumber | null } | { ok: false; reason: string } {
  const n = normalizeSiret(raw ?? '')
  if (n.length === 0) return { ok: true, number: null }
  if (n.length !== 9 && n.length !== 14) {
    return { ok: false, reason: 'Un SIREN fait 9 chiffres, un SIRET 14 chiffres' }
  }
  const kind = n.length === 9 ? 'siren' : 'siret'
  if (!n.startsWith('356000000') && !luhn(n)) {
    return { ok: false, reason: `${kind === 'siren' ? 'SIREN' : 'SIRET'} invalide (clé de contrôle incorrecte)` }
  }
  return {
    ok: true,
    number: { kind, value: n, siren: n.slice(0, 9), siret: kind === 'siret' ? n : null },
  }
}

/** Formate pour l'affichage : SIREN « 552 081 317 », SIRET « 552 081 317 66522 ». */
export function formatCompanyNumber(raw: string | null | undefined): string {
  const s = normalizeSiret(raw ?? '')
  if (s.length <= 9) return s.replace(/(\d{3})(?=\d)/g, '$1 ')
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
}

type ApiEtablissement = {
  siret?: string
  adresse?: string
  numero_voie?: string | null
  type_voie?: string | null
  libelle_voie?: string | null
  code_postal?: string | null
  libelle_commune?: string | null
  etat_administratif?: string
  activite_principale?: string | null
}

function etabAddress(e: ApiEtablissement | undefined): string | null {
  if (!e) return null
  if (e.adresse) return e.adresse
  const parts = [e.numero_voie, e.type_voie, e.libelle_voie, e.code_postal, e.libelle_commune].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

export async function lookupCompany(num: CompanyNumber): Promise<CompanyInfo | null> {
  const res = await fetch(`${API_BASE}?q=${num.value}&page=1&per_page=1`)
  if (!res.ok) return null
  const json = await res.json()
  const result = json?.results?.[0]
  if (!result || result.siren !== num.siren) return null

  // SIRET → l'établissement demandé ; SIREN → le siège
  const etab: ApiEtablissement | undefined =
    num.kind === 'siret'
      ? (result.matching_etablissements as ApiEtablissement[] | undefined)?.find((e) => e.siret === num.value)
      : result.siege
  if (num.kind === 'siret' && !etab) return null

  return {
    name: result.nom_complet ?? result.nom_raison_sociale ?? 'Entreprise',
    address: etabAddress(etab),
    siren: result.siren,
    siret: etab?.siret ?? null,
    naf: etab?.activite_principale ?? result.activite_principale ?? null,
    closed: (etab?.etat_administratif ?? result.etat_administratif) === 'F'
      || result.etat_administratif === 'C',
  }
}

/** Hook : lookup avec debounce 500 ms dès que le numéro saisi est complet et valide. */
export function useCompanyLookup(raw: string | null | undefined): CompanyLookupState {
  const [state, setState] = useState<CompanyLookupState>({ status: 'idle' })
  const digits = normalizeSiret(raw ?? '')

  useEffect(() => {
    if (digits.length === 0) {
      setState({ status: 'idle' })
      return
    }
    if (digits.length < 9) {
      setState({ status: 'typing', hint: `SIREN : encore ${9 - digits.length} chiffre(s)` })
      return
    }
    if (digits.length > 9 && digits.length < 14) {
      setState({ status: 'typing', hint: `SIRET : encore ${14 - digits.length} chiffre(s)` })
      return
    }
    const parsed = parseCompanyNumber(digits)
    if (!parsed.ok) {
      setState({ status: 'invalid', reason: parsed.reason })
      return
    }
    if (!parsed.number) return

    let cancelled = false
    setState({ status: 'loading' })
    const num = parsed.number
    const t = setTimeout(async () => {
      try {
        const company = await lookupCompany(num)
        if (cancelled) return
        setState(company ? { status: 'ok', company } : { status: 'notFound' })
      } catch (e) {
        if (cancelled) return
        console.warn('Company lookup failed', e)
        setState({ status: 'notFound' })
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [digits])

  return state
}
