import { supabase } from '../../shared/lib/supabase'

export interface Prospect {
  organization_id: string
  organization_name: string | null
  siret: string | null
  contact_name: string | null
  contact_email: string | null
  status: string | null
  plan: string | null
  billing_period: string | null
  trial_ends_at: string | null
  days_left: number | null
  current_period_end: string | null
  stripe_customer_id: string | null
  nb_interventions: number
  nb_clients: number
  nb_reports: number
  last_sign_in_at: string | null
  signed_up_at: string | null
}

/**
 * Retourne la liste de tous les prospects/clients Firovia.
 * Réservé aux emails admin whitelistés (voir RPC admin_list_prospects).
 * Un user non-admin recevra un tableau vide.
 */
export async function listAllProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase.rpc('admin_list_prospects')
  if (error) throw error
  return (data ?? []) as Prospect[]
}
