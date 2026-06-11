import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { normalizeSiret, validateSiret } from './siret'

/**
 * Résultat du lookup d'un SIRET.
 *
 * - `idle`   : aucun lookup encore lancé
 * - `loading`: appel API en cours
 * - `invalid`: SIRET ne passe pas la validation Luhn ou le format
 * - `notFound`: SIRET techniquement valide mais inconnu de l'annuaire des entreprises
 * - `taken`  : SIRET déjà utilisé par une organization existante (anti-abus)
 * - `ok`     : SIRET valide ET libre, on a récupéré le nom de l'entreprise
 */
export type SiretLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'invalid'; reason: string }
  | { status: 'notFound' }
  | { status: 'taken' }
  | { status: 'ok'; companyName: string; address?: string; naf?: string }

const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search'

/**
 * Hook qui interroge l'API recherche-entreprises.api.gouv.fr quand le SIRET
 * change (avec debounce 500ms). Vérifie aussi que le SIRET n'est pas déjà
 * utilisé par une organization Firovia existante (RPC check_siret_available).
 */
export function useSiretLookup(rawSiret: string): SiretLookupState {
  const [state, setState] = useState<SiretLookupState>({ status: 'idle' })
  const siret = normalizeSiret(rawSiret)

  useEffect(() => {
    if (!siret) {
      setState({ status: 'idle' })
      return
    }

    const validation = validateSiret(siret)
    if (!validation.ok) {
      setState({ status: 'invalid', reason: validation.reason })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    const t = setTimeout(async () => {
      try {
        // 1. Vérifier que le SIRET n'est pas déjà utilisé chez nous
        const { data: available, error: rpcErr } = await supabase.rpc(
          'check_siret_available',
          { p_siret: siret },
        )
        if (cancelled) return
        if (!rpcErr && available === false) {
          setState({ status: 'taken' })
          return
        }

        // 2. Lookup public dans l'annuaire des entreprises
        const res = await fetch(`${API_BASE}?q=${siret}&page=1&per_page=1`)
        if (cancelled) return
        if (!res.ok) {
          setState({ status: 'notFound' })
          return
        }
        const json = await res.json()
        if (cancelled) return

        const result = json?.results?.[0]
        const matchingEtab = result?.matching_etablissements?.[0]
        if (!result || !matchingEtab) {
          setState({ status: 'notFound' })
          return
        }

        const companyName: string =
          result.nom_complet ?? result.nom_raison_sociale ?? matchingEtab.nom_commercial ?? ''
        const addressParts = [
          matchingEtab.numero_voie,
          matchingEtab.type_voie,
          matchingEtab.libelle_voie,
          matchingEtab.code_postal,
          matchingEtab.libelle_commune,
        ].filter(Boolean)
        const address = addressParts.join(' ')
        const naf: string | undefined =
          matchingEtab.activite_principale ?? result.activite_principale ?? undefined

        setState({
          status: 'ok',
          companyName: companyName || 'Entreprise',
          address: address || undefined,
          naf,
        })
      } catch (e) {
        if (cancelled) return
        console.warn('SIRET lookup failed', e)
        setState({ status: 'notFound' })
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [siret])

  return state
}
