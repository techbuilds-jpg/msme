import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { LIST_LIMIT, searchTerm } from '@/lib/search'
import type { PaymentMethod, PaymentStatus } from '@/components/shared/StatusBadges'
import type { ItemInput } from '@/components/shared/LineItemsEditor'

export interface SaleRow {
  id: string
  sale_number: string
  sale_date: string
  total_centavos: number
  paid_centavos: number
  payment_status: PaymentStatus
  status: 'active' | 'voided'
  customer_id: string | null
  customer: { name: string } | null
}
export interface Payment {
  id: string
  kind: 'payment' | 'refund'
  amount_centavos: number
  method: PaymentMethod
  reference_no: string | null
  paid_at: string
  notes: string | null
  status: 'active' | 'voided'
  void_reason: string | null
  recorder: { full_name: string; email: string | null } | null
}
export interface SaleDetail extends SaleRow {
  subtotal_centavos: number
  discount_centavos: number
  refunded_centavos: number
  notes: string | null
  order_id: string | null
  order: { order_number: string } | null
  void_reason: string | null
  voided_at: string | null
  created_at: string
  items: { id: string; description: string; item_type: string; quantity: number; unit_price_centavos: number; line_total_centavos: number }[]
  payments: Payment[]
}

const ROW = 'id, sale_number, sale_date, total_centavos, paid_centavos, payment_status, status, customer_id, customer:customers(name)'

export async function listSales(businessId: string, f: { search?: string; paymentStatus?: PaymentStatus | 'open' | 'all'; from?: string; to?: string; customerId?: string; showVoided?: boolean } = {}) {
  let q = supabase.from('sales').select(ROW).eq('business_id', businessId)
    .order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(LIST_LIMIT)
  if (!f.showVoided) q = q.eq('status', 'active')
  if (f.paymentStatus === 'open') q = q.in('payment_status', ['unpaid', 'partially_paid'])
  else if (f.paymentStatus && f.paymentStatus !== 'all') q = q.eq('payment_status', f.paymentStatus)
  if (f.from) q = q.gte('sale_date', f.from)
  if (f.to) q = q.lte('sale_date', f.to)
  if (f.customerId) q = q.eq('customer_id', f.customerId)
  const t = f.search ? searchTerm(f.search) : null
  if (t) q = q.ilike('sale_number', t.replaceAll('*', '%'))
  return unwrap(await q) as unknown as SaleRow[]
}

export async function getSale(id: string) {
  return unwrap(await supabase.from('sales')
    .select(`${ROW}, subtotal_centavos, discount_centavos, refunded_centavos, notes, order_id, void_reason, voided_at, created_at,
             order:orders(order_number),
             items:sale_items(id, description, item_type, quantity, unit_price_centavos, line_total_centavos, sort_order),
             payments(id, kind, amount_centavos, method, reference_no, paid_at, notes, status, void_reason, recorder:profiles!payments_recorded_by_fkey(full_name, email))`)
    .eq('id', id).order('sort_order', { referencedTable: 'sale_items' }).order('paid_at', { referencedTable: 'payments' })
    .maybeSingle()) as unknown as SaleDetail | null
}

export interface NewSale {
  idempotencyKey: string
  items: ItemInput[]
  customerId: string | null
  orderId: string | null
  saleDate: string | null
  discountCentavos: number
  notes: string
  payment: { amount_centavos: number; method: PaymentMethod; reference_no: string | null; idempotency_key: string } | null
}

export async function createSale(businessId: string, s: NewSale): Promise<string> {
  return unwrap(await supabase.rpc('create_sale', {
    p_business_id: businessId,
    p_idempotency_key: s.idempotencyKey,
    p_items: s.items,
    p_customer_id: s.customerId,
    p_order_id: s.orderId,
    p_sale_date: s.saleDate,
    p_discount_centavos: s.discountCentavos,
    p_notes: s.notes || null,
    p_payment: s.payment,
  })) as string
}

export async function recordPayment(p: { saleId: string; amountCentavos: number; method: PaymentMethod; idempotencyKey: string; kind: 'payment' | 'refund'; referenceNo?: string; paidAt?: string | null; notes?: string }) {
  return unwrap(await supabase.rpc('record_payment', {
    p_sale_id: p.saleId,
    p_amount_centavos: p.amountCentavos,
    p_method: p.method,
    p_idempotency_key: p.idempotencyKey,
    p_kind: p.kind,
    p_reference_no: p.referenceNo || null,
    p_paid_at: p.paidAt || null,
    p_notes: p.notes || null,
  })) as string
}

export async function voidPayment(paymentId: string, reason: string) {
  unwrap(await supabase.rpc('void_payment', { p_payment_id: paymentId, p_reason: reason }))
}
export async function voidSale(saleId: string, reason: string) {
  unwrap(await supabase.rpc('void_sale', { p_sale_id: saleId, p_reason: reason }))
}

// ---- catalogue -----------------------------------------------------------------------------------
export interface CatalogItem { id: string; kind: 'product' | 'service'; name: string; sku: string | null; unit_price_centavos: number; is_active: boolean }

export async function listCatalog(businessId: string, activeOnly = false) {
  let q = supabase.from('catalog_items').select('id, kind, name, sku, unit_price_centavos, is_active').eq('business_id', businessId).order('name')
  if (activeOnly) q = q.eq('is_active', true)
  return unwrap(await q) as CatalogItem[]
}

export async function saveCatalogItem(businessId: string, item: Omit<CatalogItem, 'id'> & { id?: string }) {
  const { id, ...fields } = item
  if (id) return unwrap(await supabase.from('catalog_items').update(fields).eq('id', id).select('id').single())
  return unwrap(await supabase.from('catalog_items').insert({ id: crypto.randomUUID(), business_id: businessId, ...fields }).select('id').single())
}
