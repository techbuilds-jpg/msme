import { Badge } from '@/components/ui'

export const ORDER_STATUSES = ['new', 'confirmed', 'in_progress', 'for_review', 'completed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New', confirmed: 'Confirmed', in_progress: 'In Progress', for_review: 'For Review', completed: 'Completed', cancelled: 'Cancelled',
}
const ORDER_TONE: Record<OrderStatus, string> = {
  new: 'sky', confirmed: 'navy', in_progress: 'amber', for_review: 'violet', completed: 'green', cancelled: 'slate',
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
}

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }
export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'normal') return <span className="text-xs text-slate-500">Normal</span>
  return <Badge tone={priority === 'urgent' ? 'red' : priority === 'high' ? 'orange' : 'slate'}>{PRIORITY_LABEL[priority]}</Badge>
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid', partially_paid: 'Partially Paid', paid: 'Paid', refunded: 'Refunded',
}
const PAYMENT_TONE: Record<PaymentStatus, string> = { unpaid: 'red', partially_paid: 'amber', paid: 'green', refunded: 'slate' }
export function PaymentStatusBadge({ status, voided }: { status: PaymentStatus; voided?: boolean }) {
  if (voided) return <Badge tone="slate">Voided</Badge>
  return <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'gcash' | 'maya' | 'other'
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', gcash: 'GCash', maya: 'Maya', other: 'Other',
}
