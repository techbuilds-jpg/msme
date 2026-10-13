import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { LIST_LIMIT, searchTerm } from '@/lib/search'

export interface Customer {
  id: string
  business_id: string
  name: string
  contact_number: string | null
  email: string | null
  address: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_at: string
}
export interface CustomerBalance {
  customer_id: string
  sales_count: number
  total_centavos: number
  paid_centavos: number
  balance_centavos: number
  last_sale_date: string | null
}

const COLS = 'id, business_id, name, contact_number, email, address, notes, status, created_at'

export async function listCustomers(businessId: string, opts: { search?: string; status?: 'active' | 'inactive' | 'all' } = {}) {
  let q = supabase.from('customers').select(COLS).eq('business_id', businessId).order('name').limit(LIST_LIMIT)
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status)
  const t = opts.search ? searchTerm(opts.search) : null
  if (t) q = q.or(`name.ilike.${t},contact_number.ilike.${t},email.ilike.${t}`)
  return unwrap(await q) as Customer[]
}

/** Lightweight list for pickers. */
export async function customerOptions(businessId: string) {
  return unwrap(await supabase.from('customers').select('id, name, contact_number').eq('business_id', businessId)
    .eq('status', 'active').order('name').limit(1000)) as Pick<Customer, 'id' | 'name' | 'contact_number'>[]
}

export async function getCustomer(id: string) {
  return unwrap(await supabase.from('customers').select(COLS).eq('id', id).maybeSingle()) as Customer | null
}

export interface CustomerInput {
  name: string
  contact_number?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  status?: 'active' | 'inactive'
}

export async function createCustomer(businessId: string, input: CustomerInput, id: string) {
  // client-generated id: a double-submitted form inserts once (second attempt hits the primary key)
  return unwrap(await supabase.from('customers').insert({ id, business_id: businessId, ...input }).select(COLS).single()) as Customer
}

export async function updateCustomer(id: string, input: CustomerInput) {
  return unwrap(await supabase.from('customers').update(input).eq('id', id).select(COLS).single()) as Customer
}

/** Balances are only returned to members who can see sales (RLS); others get an empty list. */
export async function customerBalances(businessId: string, customerIds?: string[]) {
  let q = supabase.from('customer_balances').select('customer_id, sales_count, total_centavos, paid_centavos, balance_centavos, last_sale_date')
    .eq('business_id', businessId)
  if (customerIds) q = q.in('customer_id', customerIds)
  return unwrap(await q) as CustomerBalance[]
}
