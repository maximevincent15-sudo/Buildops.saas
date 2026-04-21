import { supabase } from '../../shared/lib/supabase'
import type { CreateExpenseInput, Expense } from './schemas'

const BUCKET = 'expense-receipts'

export type StoredReceipt = {
  path: string
  url: string
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 60)
}

export async function uploadExpenseReceipt(
  file: File,
  organizationId: string,
): Promise<StoredReceipt> {
  const safeName = sanitizeFilename(file.name)
  const uniquePrefix = crypto.randomUUID()
  const yearMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
  const path = `${organizationId}/${yearMonth}/${uniquePrefix}-${safeName}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function deleteExpenseReceipt(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function createExpense(
  input: CreateExpenseInput,
  organizationId: string,
  technicianName: string,
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      organization_id: organizationId,
      technician_id: input.technician_id,
      technician_name: technicianName,
      spent_on: input.spent_on,
      category: input.category,
      amount_ttc: input.amount_ttc,
      vat_rate: input.vat_rate,
      description: input.description || null,
      receipt_url: input.receipt_url || null,
      receipt_path: input.receipt_path || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Expense
}

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Expense[]
}

export async function approveExpense(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userData.user?.id ?? null,
      rejection_reason: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function rejectExpense(id: string, reason: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userData.user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function resetExpenseToPending(id: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'pending',
      rejection_reason: null,
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
