import { supabase } from '../../shared/lib/supabase'
import type { EquipmentFamily, EquipmentStatus } from './schemas'

/** Une ligne retournée par la RPC get_public_registry. */
export type PublicRegistryRow = {
  site_name: string
  site_address: string | null
  site_postal_code: string | null
  site_city: string | null
  client_name: string
  unit_id: string | null
  unit_serial: string | null
  unit_family: EquipmentFamily | null
  unit_subtype: string | null
  unit_brand: string | null
  unit_model: string | null
  unit_install_year: number | null
  unit_next_replacement_year: number | null
  unit_status: EquipmentStatus | null
  unit_last_check_date: string | null
  unit_next_check_date: string | null
  unit_implantation: string | null
  zone_name: string | null
  zone_parent: string | null
  zone_display_order: number | null
}

/**
 * Récupère le registre public d'un site à partir de son token.
 * Cette fonction fonctionne SANS authentification (RPC SECURITY DEFINER).
 * Retourne null si le token est invalide ou si le site n'a aucun équipement.
 */
export async function fetchPublicRegistry(
  token: string,
): Promise<PublicRegistryRow[] | null> {
  const { data, error } = await supabase.rpc('get_public_registry', { token })
  if (error) throw error
  if (!data || data.length === 0) return null
  return data as PublicRegistryRow[]
}
