// Types miroir des tables public.contracts / contract_sites / contract_lines
// (migration 20261014170000_contracts.sql).

import type { EquipmentFamily } from '../equipment/schemas'
import type { EquipmentType } from '../../shared/constants/interventions'

export type ContractStatus = 'draft' | 'active' | 'suspended' | 'terminated' | 'expired'
export type ContractBillingMode = 'per_visit' | 'advance'
export type ContractFrequency = 'annual' | 'semiannual' | 'quarterly'

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  suspended: 'Suspendu',
  terminated: 'Résilié',
  expired: 'Expiré',
}

export const CONTRACT_STATUS_BADGE: Record<ContractStatus, string> = {
  draft: 'b-gry',
  active: 'b-grn',
  suspended: 'b-org',
  terminated: 'b-red',
  expired: 'b-gry',
}

export const BILLING_MODE_LABELS: Record<ContractBillingMode, string> = {
  per_visit: 'Après chaque visite',
  advance: "D'avance, à l'échéance",
}

export const FREQUENCY_LABELS: Record<ContractFrequency, string> = {
  annual: 'Annuelle',
  semiannual: 'Semestrielle',
  quarterly: 'Trimestrielle',
}

/** Échéances de facturation d'avance, dans le même ordre que les fréquences */
export const BILLING_FREQUENCY_LABELS: Record<ContractFrequency, string> = {
  annual: 'Une facture par an',
  semiannual: 'Deux factures par an',
  quarterly: 'Quatre factures par an',
}

export const VISITS_PER_YEAR: Record<ContractFrequency, number> = {
  annual: 1,
  semiannual: 2,
  quarterly: 4,
}

/** Fréquence réglementaire usuelle par famille du parc (pré-remplissage des lignes) */
export const FAMILY_DEFAULT_FREQUENCY: Record<EquipmentFamily, ContractFrequency> = {
  extincteurs: 'annual',
  ria: 'semiannual',
  baes: 'annual',
  portes_cf: 'annual',
  desenfumage: 'annual',
  detection: 'semiannual',
  colonnes_seches: 'semiannual',
}

/** Famille du parc → type d'équipement des interventions (checklists, récurrence) */
export const FAMILY_TO_EQUIPMENT_TYPE: Partial<Record<EquipmentFamily, EquipmentType>> = {
  extincteurs: 'extincteurs',
  ria: 'ria',
  desenfumage: 'desenfumage',
  detection: 'ssi',
}

export type Contract = {
  id: string
  organization_id: string
  reference: string
  client_id: string | null
  client_name: string
  title: string | null
  status: ContractStatus
  start_date: string
  initial_months: number
  tacit_renewal: boolean
  notice_months: number
  billing_mode: ContractBillingMode
  billing_frequency: ContractFrequency
  revision_rate: number | null
  terminated_on: string | null
  termination_reason: string | null
  signed_document_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ContractLine = {
  id?: string
  position: number
  site_id: string | null
  catalog_item_id: string | null
  equipment_family: EquipmentFamily | null
  description: string
  quantity: number
  unit_price_ht: number
  vat_rate: number
  frequency: ContractFrequency
}

export type ContractWithDetails = Contract & {
  site_ids: string[]
  lines: ContractLine[]
}

export type ContractInput = {
  client_id: string | null
  client_name: string
  title: string | null
  status: ContractStatus
  start_date: string
  initial_months: number
  tacit_renewal: boolean
  notice_months: number
  billing_mode: ContractBillingMode
  billing_frequency: ContractFrequency
  revision_rate: number | null
  notes: string | null
  site_ids: string[]
  lines: ContractLine[]
}

/** Montant HT d'une ligne sur une année (prix par visite × visites par an) */
export function lineAnnualHt(line: Pick<ContractLine, 'quantity' | 'unit_price_ht' | 'frequency'>): number {
  return line.quantity * line.unit_price_ht * VISITS_PER_YEAR[line.frequency]
}

export function contractAnnualTotals(lines: ContractLine[]): { ht: number; vat: number; ttc: number } {
  let ht = 0
  let vat = 0
  for (const l of lines) {
    const lineHt = lineAnnualHt(l)
    ht += lineHt
    vat += (lineHt * l.vat_rate) / 100
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return { ht: round(ht), vat: round(vat), ttc: round(ht + vat) }
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12)
}

function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** Ajoute des mois en restant dans le mois visé (31 janv. + 1 mois = 28 ou 29 févr.) */
function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))
  return toIso(date)
}

/**
 * Fin de la période en cours (prochaine échéance) : fin de la période
 * initiale, puis par tranches de 12 mois si tacite reconduction.
 * null si le contrat est arrivé à son terme sans reconduction.
 */
export function currentPeriodEnd(contract: Pick<Contract, 'start_date' | 'initial_months' | 'tacit_renewal'>, today = toIso(new Date())): string | null {
  let end = addMonths(contract.start_date, contract.initial_months)
  if (!contract.tacit_renewal) return end >= today ? end : null
  while (end < today) end = addMonths(end, 12)
  return end
}

/** Date limite pour résilier avant la prochaine échéance (préavis) */
export function noticeDeadline(contract: Pick<Contract, 'start_date' | 'initial_months' | 'tacit_renewal' | 'notice_months'>, today?: string): string | null {
  const end = currentPeriodEnd(contract, today)
  return end ? addMonths(end, -contract.notice_months) : null
}

export function isContractRunning(contract: Pick<Contract, 'status'>): boolean {
  return contract.status === 'active'
}
