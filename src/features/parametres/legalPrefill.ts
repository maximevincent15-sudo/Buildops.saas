import { supabase } from '../../shared/lib/supabase'
import { formatSiret, normalizeSiret } from '../auth/siret'
import type { UpsertInvoicingInput } from './api'

/**
 * Identité légale lue dans l'annuaire public des entreprises
 * (recherche-entreprises.api.gouv.fr, comme à l'inscription) à partir du
 * SIRET : forme juridique, code APE, adresse du siège. Rien n'est enregistré
 * sans « Enregistrer ».
 */

export type LegalIdentity = Pick<UpsertInvoicingInput, 'legal_form' | 'siret' | 'ape_code' | 'legal_address' | 'legal_postal_code' | 'legal_city'>

const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search'

/** Catégorie juridique INSEE → forme courte imprimée sur les documents */
export function legalFormLabel(code: string | null | undefined, isIndividual = false): string | null {
  const c = (code ?? '').trim()
  if (c === '1000' || isIndividual) return 'Entrepreneur individuel'
  if (c === '5498') return 'EURL'
  if (c === '5720') return 'SASU'
  if (c.startsWith('54')) return 'SARL'
  if (c.startsWith('57')) return 'SAS'
  if (c.startsWith('55') || c.startsWith('56')) return 'SA'
  if (c === '5202') return 'SNC'
  if (c === '6540') return 'SCI'
  if (c.startsWith('92')) return 'Association'
  return null
}

/** N° de TVA intracommunautaire français calculé depuis le SIREN (clé = (12 + 3 × (SIREN mod 97)) mod 97) */
export function intracomVatFromSiren(siren: string): string | null {
  const s = normalizeSiret(siren).slice(0, 9)
  if (s.length !== 9) return null
  const key = (12 + 3 * (Number(s) % 97)) % 97
  return `FR${String(key).padStart(2, '0')}${s}`
}

/** SIRET saisi et vérifié à l'inscription */
export async function getOrganizationSiret(organizationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('siret')
    .eq('id', organizationId)
    .maybeSingle()
  if (error) return null
  return (data as { siret: string | null } | null)?.siret ?? null
}

type ApiSiege = {
  siret?: string
  numero_voie?: string | null
  indice_repetition?: string | null
  type_voie?: string | null
  libelle_voie?: string | null
  complement_adresse?: string | null
  code_postal?: string | null
  libelle_commune?: string | null
  activite_principale?: string | null
}

/** Identité légale du SIRET (adresse du siège social), null si introuvable */
export async function fetchLegalIdentity(siretRaw: string): Promise<LegalIdentity | null> {
  const siret = normalizeSiret(siretRaw)
  if (siret.length !== 14) return null
  const res = await fetch(`${API_BASE}?q=${siret}&page=1&per_page=1`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null
  const json = await res.json()
  const result = json?.results?.[0]
  if (!result || result.siren !== siret.slice(0, 9)) return null

  const siege: ApiSiege = result.siege ?? {}
  const street = [siege.numero_voie, siege.indice_repetition, siege.type_voie, siege.libelle_voie]
    .filter(Boolean).join(' ')
  return {
    siret: formatSiret(siret),
    legal_form: legalFormLabel(result.nature_juridique, !!result.complements?.est_entrepreneur_individuel),
    ape_code: siege.activite_principale ?? result.activite_principale ?? null,
    legal_address: street || null,
    legal_postal_code: siege.code_postal ?? null,
    legal_city: siege.libelle_commune ?? null,
  }
}

/** Le bloc identité n'a encore jamais été rempli */
export function isLegalIdentityEmpty(f: Pick<UpsertInvoicingInput, 'legal_form' | 'siret' | 'ape_code' | 'legal_address' | 'legal_postal_code' | 'legal_city'>): boolean {
  return !f.legal_form && !f.siret && !f.ape_code && !f.legal_address && !f.legal_postal_code && !f.legal_city
}

/** Complète seulement les champs vides ; renvoie les champs remplis */
export function fillEmptyFields<T extends Record<string, unknown>>(form: T, found: Partial<T>): { next: T; filled: (keyof T)[] } {
  const next = { ...form }
  const filled: (keyof T)[] = []
  for (const [k, v] of Object.entries(found) as [keyof T, T[keyof T]][]) {
    if (v && !next[k]) {
      next[k] = v
      filled.push(k)
    }
  }
  return { next, filled }
}
