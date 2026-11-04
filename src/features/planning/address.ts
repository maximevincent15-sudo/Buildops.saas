import type { Intervention } from './schemas'

/** Adresse où se rend le technicien : celle du chantier, sinon celle de l'intervention */
export function interventionAddress(i: Pick<Intervention, 'chantier_address' | 'chantier_postal_code' | 'chantier_city' | 'address'>): string {
  const chantier = [i.chantier_address, [i.chantier_postal_code, i.chantier_city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return chantier || i.address || ''
}
