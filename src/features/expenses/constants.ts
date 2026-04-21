import { Car, Coffee, FileText, Fuel, Home, Package, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ExpenseCategory =
  | 'meal'
  | 'supplier'
  | 'fuel'
  | 'toll'
  | 'supplies'
  | 'lodging'
  | 'other'

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'meal',
  'supplier',
  'fuel',
  'toll',
  'supplies',
  'lodging',
  'other',
]

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  meal: 'Repas',
  supplier: 'Achat fournisseur',
  fuel: 'Carburant',
  toll: 'Péage / Parking',
  supplies: 'Petit matériel',
  lodging: 'Hébergement',
  other: 'Autre',
}

export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  meal: Coffee,
  supplier: Package,
  fuel: Fuel,
  toll: Car,
  supplies: Wrench,
  lodging: Home,
  other: FileText,
}

// TVA par défaut pré-remplie selon la catégorie (l'utilisateur peut la changer)
export const DEFAULT_VAT_FOR_CATEGORY: Record<ExpenseCategory, number> = {
  meal: 10,
  supplier: 20,
  fuel: 20,
  toll: 20,
  supplies: 20,
  lodging: 10,
  other: 20,
}

export const VAT_RATES: number[] = [0, 5.5, 10, 20]

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: 'À valider',
  approved: 'Validée',
  rejected: 'Refusée',
}

export function formatAmount(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })
}

export function computeHt(amountTtc: number, vatRate: number): number {
  if (vatRate <= 0) return amountTtc
  return amountTtc / (1 + vatRate / 100)
}

export function computeVat(amountTtc: number, vatRate: number): number {
  return amountTtc - computeHt(amountTtc, vatRate)
}
