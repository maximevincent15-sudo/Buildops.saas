import { z } from 'zod'
import type { ExpenseCategory, ExpenseStatus } from './constants'

export const createExpenseSchema = z.object({
  technician_id: z.string().min(1, 'Technicien requis'),
  spent_on: z.string().min(1, 'Date requise'),
  category: z.enum(['meal', 'supplier', 'fuel', 'toll', 'supplies', 'lodging', 'other']),
  amount_ttc: z.number().positive('Montant requis'),
  vat_rate: z.number().min(0).max(100),
  description: z.string().optional(),
  receipt_url: z.string().optional(),
  receipt_path: z.string().optional(),
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>

export type Expense = {
  id: string
  organization_id: string
  technician_id: string | null
  technician_name: string
  spent_on: string
  category: ExpenseCategory
  amount_ttc: number
  vat_rate: number
  description: string | null
  receipt_url: string | null
  receipt_path: string | null
  status: ExpenseStatus
  rejection_reason: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  created_by: string | null
}
