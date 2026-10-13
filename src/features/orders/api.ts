import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { LIST_LIMIT, searchTerm } from '@/lib/search'
import type { OrderStatus, Priority } from '@/components/shared/StatusBadges'
import type { ItemInput } from '@/components/shared/LineItemsEditor'

export interface OrderRow {
  id: string
  order_number: string
  order_date: string
  due_date: string | null
  description: string | null
  status: OrderStatus
  priority: Priority
  total_centavos: number
  customer_id: string | null
  assigned_employee_id: string | null
  customer: { name: string } | null
  assignee: { full_name: string } | null
}
export interface OrderItem {
  id: string
  item_type: 'product' | 'service'
  description: string
  quantity: number
  unit_price_centavos: number
  line_total_centavos: number
  catalog_item_id: string | null
}
export interface OrderActivity {
  id: number
  kind: 'created' | 'status_changed' | 'assigned' | 'note' | 'updated'
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  message: string | null
  created_at: string
  actor: { full_name: string; email: string | null } | null
}
export interface OrderDetail extends OrderRow {
  notes: string | null
  order_type: string
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
  items: OrderItem[]
}

const ROW = 'id, order_number, order_date, due_date, description, status, priority, total_centavos, customer_id, assigned_employee_id, customer:customers(name), assignee:employees(full_name)'

export async function listOrders(businessId: string, f: { search?: string; status?: OrderStatus | 'open' | 'all'; assignee?: string; customerId?: string } = {}) {
  let q = supabase.from('orders').select(ROW).eq('business_id', businessId)
    .order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(LIST_LIMIT)
  if (f.status === 'open') q = q.not('status', 'in', '(completed,cancelled)')
  else if (f.status && f.status !== 'all') q = q.eq('status', f.status)
  if (f.assignee) q = q.eq('assigned_employee_id', f.assignee)
  if (f.customerId) q = q.eq('customer_id', f.customerId)
  const t = f.search ? searchTerm(f.search) : null
  if (t) q = q.or(`order_number.ilike.${t},description.ilike.${t}`)
  return unwrap(await q) as unknown as OrderRow[]
}

export async function getOrder(id: string) {
  const o = unwrap(await supabase.from('orders')
    .select(`${ROW}, notes, order_type, created_at, completed_at, cancelled_at, items:order_items(id, item_type, description, quantity, unit_price_centavos, line_total_centavos, catalog_item_id, sort_order)`)
    .eq('id', id).order('sort_order', { referencedTable: 'order_items' }).maybeSingle()) as unknown as OrderDetail | null
  return o
}

export async function getOrderActivity(orderId: string) {
  return unwrap(await supabase.from('order_activity')
    .select('id, kind, from_status, to_status, message, created_at, actor:profiles(full_name, email)')
    .eq('order_id', orderId).order('created_at').order('id')) as unknown as OrderActivity[]
}

export interface SaveOrderInput {
  orderId?: string | null
  customerId: string | null
  orderDate: string | null
  description: string
  assignedEmployeeId: string | null
  dueDate: string | null
  priority: Priority
  notes: string
  items: ItemInput[]
}

export async function saveOrder(businessId: string, o: SaveOrderInput): Promise<string> {
  return unwrap(await supabase.rpc('save_order', {
    p_business_id: businessId,
    p_order_id: o.orderId ?? null,
    p_customer_id: o.customerId,
    p_order_date: o.orderDate,
    p_description: o.description,
    p_assigned_employee_id: o.assignedEmployeeId,
    p_due_date: o.dueDate,
    p_priority: o.priority,
    p_notes: o.notes,
    p_items: o.items,
  })) as string
}

export async function changeOrderStatus(orderId: string, status: OrderStatus, note?: string) {
  unwrap(await supabase.rpc('change_order_status', { p_order_id: orderId, p_status: status, p_note: note || null }))
}

export async function addOrderNote(orderId: string, note: string) {
  unwrap(await supabase.rpc('add_order_note', { p_order_id: orderId, p_note: note }))
}

export async function employeeOptions(businessId: string) {
  return unwrap(await supabase.from('employees').select('id, full_name, employment_status').eq('business_id', businessId)
    .in('employment_status', ['active', 'on_leave']).order('full_name')) as { id: string; full_name: string }[]
}
