import { dossierNumberForIntervention } from '../equipment/api'
import { supabase } from '../../shared/lib/supabase'
import { getClient } from './api'
import type { Client } from './schemas'

/**
 * Création d'un devis ou d'une facture : ce que Firovia connaît déjà, pour ne
 * rien ressaisir. La fiche client (email, adresse, SIREN, contact) et le N° de
 * dossier, repris du devis d'origine ou du site de la visite.
 */
export async function loadDocumentContext(input: {
  clientId?: string | null
  interventionId?: string | null
  quoteId?: string | null
}): Promise<{ client: Client | null; dossierNumber: string | null }> {
  const [client, fromQuote, fromIntervention] = await Promise.all([
    input.clientId ? getClient(input.clientId).catch(() => null) : Promise.resolve(null),
    input.quoteId ? quoteDossierNumber(input.quoteId) : Promise.resolve(null),
    dossierNumberForIntervention(input.interventionId).catch(() => null),
  ])
  return { client, dossierNumber: fromQuote ?? fromIntervention }
}

async function quoteDossierNumber(quoteId: string): Promise<string | null> {
  const { data } = await supabase.from('quotes').select('dossier_number').eq('id', quoteId).maybeSingle()
  return (data as { dossier_number: string | null } | null)?.dossier_number?.trim() || null
}
