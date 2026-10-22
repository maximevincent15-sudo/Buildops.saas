import { supabase } from '../../shared/lib/supabase'
import { useAuthStore } from '../auth/store'

/**
 * Modules que chaque organisation peut masquer (« mode terrain ») : utile
 * quand les devis et factures restent dans un autre logiciel (Sage, EBP…).
 * Masquer un module ne supprime aucune donnée.
 */
export const OPTIONAL_MODULES = ['devis', 'factures', 'catalogue', 'contrats'] as const
export type OptionalModule = (typeof OPTIONAL_MODULES)[number]

export const MODULE_INFO: Record<OptionalModule, { label: string; hint: string }> = {
  devis: { label: 'Devis', hint: 'Devis, signature sur place, devis correctifs depuis les anomalies' },
  factures: { label: 'Factures', hint: 'Factures, impayés, pilotage du chiffre d\'affaires' },
  catalogue: { label: 'Catalogue d\'articles', hint: 'Articles et prix réutilisés dans les devis et contrats' },
  contrats: { label: 'Contrats de maintenance', hint: 'Échéances, révision des prix, facturation du mois' },
}

/** Retourne une fonction qui dit si un module est affiché (tous le sont par défaut) */
export function useModuleEnabled(): (m: OptionalModule) => boolean {
  const disabled = useAuthStore((s) => s.profile?.organizations?.disabled_modules)
  return (m) => !(disabled ?? []).includes(m)
}

export async function updateDisabledModules(organizationId: string, modules: OptionalModule[]): Promise<void> {
  const { error } = await supabase
    .from('organizations')
    .update({ disabled_modules: modules })
    .eq('id', organizationId)
  if (error) throw error
}
