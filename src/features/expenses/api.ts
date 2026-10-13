import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { LIST_LIMIT } from '@/lib/search'
import type { PaymentMethod } from '@/components/shared/StatusBadges'

export interface Expense {
  id: string
  expense_date: string
  category_id: string
  amount_centavos: number
  description: string | null
  payment_method: PaymentMethod
  vendor: string | null
  receipt_path: string | null
  status: 'active' | 'voided'
  void_reason: string | null
  created_at: string
  category: { name: string } | null
  recorder: { full_name: string; email: string | null } | null
}
export interface ExpenseCategory { id: string; name: string; is_active: boolean; sort_order: number }

const COLS = 'id, expense_date, category_id, amount_centavos, description, payment_method, vendor, receipt_path, status, void_reason, created_at, category:expense_categories(name), recorder:profiles!expenses_recorded_by_fkey(full_name, email)'

export async function listExpenses(businessId: string, f: { from: string; to: string; categoryId?: string; showVoided?: boolean }) {
  let q = supabase.from('expenses').select(COLS).eq('business_id', businessId).gte('expense_date', f.from).lte('expense_date', f.to)
    .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).limit(LIST_LIMIT)
  if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (!f.showVoided) q = q.eq('status', 'active')
  return unwrap(await q) as unknown as Expense[]
}

export async function listCategories(businessId: string) {
  return unwrap(await supabase.from('expense_categories').select('id, name, is_active, sort_order').eq('business_id', businessId)
    .order('sort_order').order('name')) as ExpenseCategory[]
}

export async function expenseSummary(businessId: string, from: string, to: string) {
  return unwrap(await supabase.rpc('expense_summary', { p_business_id: businessId, p_from: from, p_to: to })) as
    { category_id: string; category_name: string; total_centavos: number; expense_count: number }[]
}

export interface ExpenseInput {
  expense_date: string
  category_id: string
  amount_centavos: number
  description: string | null
  payment_method: PaymentMethod
  vendor: string | null
  receipt_path: string | null
}

export async function createExpense(businessId: string, id: string, input: ExpenseInput) {
  unwrap(await supabase.from('expenses').insert({ id, business_id: businessId, ...input }).select('id').single())
}
export async function updateExpense(id: string, input: ExpenseInput) {
  unwrap(await supabase.from('expenses').update(input).eq('id', id).select('id').single())
}
export async function voidExpense(id: string, reason: string) {
  unwrap(await supabase.rpc('void_expense', { p_expense_id: id, p_reason: reason }))
}

// ---- receipts (private bucket; path = <business_id>/<uuid>.<ext>) ---------------------------------
export const RECEIPT_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024

export function receiptProblem(file: File): string | null {
  if (!RECEIPT_TYPES[file.type]) return 'Receipts must be JPG, PNG, WebP or PDF.'
  if (file.size > RECEIPT_MAX_BYTES) return 'Receipts must be 5 MB or smaller.'
  return null
}

export async function uploadReceipt(businessId: string, file: File): Promise<string> {
  const path = `${businessId}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`
  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

/** Removes an upload that never got attached (allowed by storage policy only while unattached). */
export async function discardReceipt(path: string) {
  await supabase.storage.from('receipts').remove([path])
}

/** Short-lived link; receipts are never public. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
  if (error || !data) throw new Error(error?.message ?? 'Could not open the receipt')
  return data.signedUrl
}

export async function addCategory(businessId: string, name: string, sortOrder: number) {
  unwrap(await supabase.from('expense_categories').insert({ id: crypto.randomUUID(), business_id: businessId, name: name.trim(), sort_order: sortOrder }).select('id').single())
}
