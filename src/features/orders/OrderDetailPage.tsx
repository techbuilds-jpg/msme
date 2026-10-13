import { ArrowRight, MessageSquare, Pencil, Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Button, ButtonLink, Card, ErrorState, PageHeader, Select, Spinner, Textarea, errorMessage } from '@/components/ui'
import { OrderStatusBadge, ORDER_STATUSES, ORDER_STATUS_LABEL, PriorityBadge, type OrderStatus } from '@/components/shared/StatusBadges'
import { useCanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useAsync } from '@/lib/useAsync'
import { addOrderNote, changeOrderStatus, getOrder, getOrderActivity, type OrderActivity } from './api'

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const { current, can } = useCurrentBusiness()
  const b = current.business
  const canEdit = useCanWrite('orders.manage')
  const canSell = useCanWrite('sales.manage')
  const order = useAsync(() => getOrder(id), [id])
  const activity = useAsync(() => getOrderActivity(id), [id])
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [statusNote, setStatusNote] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'status' | 'note' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (order.loading && !order.data) return <Spinner />
  if (order.error) return <ErrorState error={order.error} onRetry={order.reload} />
  const o = order.data
  if (!o) return <ErrorState error="Order not found, or you don't have access to it." />

  const isManager = current.role === 'owner' || current.role === 'manager'
  const locked = (o.status === 'completed' || o.status === 'cancelled') && !isManager
  const refresh = async () => { await Promise.all([order.reload(), activity.reload()]) }

  const applyStatus = async () => {
    if (!status) return
    setBusy('status'); setError(null)
    try { await changeOrderStatus(o.id, status, statusNote); setStatus(''); setStatusNote(''); await refresh() }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(null) }
  }
  const saveNote = async () => {
    if (!note.trim()) return
    setBusy('note'); setError(null)
    try { await addOrderNote(o.id, note); setNote(''); await activity.reload() }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{o.order_number} <OrderStatusBadge status={o.status} /></span>}
        subtitle={o.customer ? <Link className="text-navy-500 underline" to={`/customers/${o.customer_id}`}>{o.customer.name}</Link> : 'No customer'}
        actions={<>
          {canSell && can('sales.view') && <ButtonLink variant="outline" to={`/sales/new?order=${o.id}`}><Receipt className="size-4" aria-hidden /> Record sale</ButtonLink>}
          {canEdit && o.status !== 'cancelled' && <ButtonLink variant="outline" to={`/orders/${o.id}/edit`}><Pencil className="size-4" aria-hidden /> Edit</ButtonLink>}
        </>}
      />
      {error && <Alert tone="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Details">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Order date">{formatDate(o.order_date)}</Item>
              <Item label="Due date">{formatDate(o.due_date)}</Item>
              <Item label="Assigned to">{o.assignee?.full_name ?? '—'}</Item>
              <Item label="Priority"><PriorityBadge priority={o.priority} /></Item>
              <Item label="Description" wide>{o.description ?? '—'}</Item>
              {o.notes && <Item label="Internal notes" wide><span className="whitespace-pre-wrap">{o.notes}</span></Item>}
            </dl>
          </Card>
          <Card title="Items & services" padded={false}>
            {o.items.length === 0 ? <p className="p-4 text-sm text-slate-500">No items listed.</p> : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Description</th><th>Type</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.description}</td><td className="capitalize">{i.item_type}</td>
                        <td className="text-right tabular-nums">{Number(i.quantity)}</td>
                        <td className="text-right tabular-nums">{formatMoney(i.unit_price_centavos, b.currency)}</td>
                        <td className="text-right tabular-nums">{formatMoney(i.line_total_centavos, b.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={4} className="text-right font-medium">Total</td><td className="text-right font-semibold tabular-nums">{formatMoney(o.total_centavos, b.currency)}</td></tr></tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {canEdit && (
            <Card title="Update status">
              {locked ? <p className="text-sm text-slate-600">Only an owner or manager can reopen this order.</p> : (
                <div className="space-y-3">
                  <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                    <option value="">Choose…</option>
                    {ORDER_STATUSES.filter((s) => s !== o.status).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
                  </Select>
                  <Textarea label="Note (optional)" rows={2} maxLength={2000} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                  <Button onClick={() => void applyStatus()} disabled={!status} loading={busy === 'status'}>Update status</Button>
                </div>
              )}
            </Card>
          )}
          <Card title="Activity">
            {canEdit && (
              <div className="mb-4 space-y-2">
                <Textarea aria-label="Add a note" placeholder="Add a note…" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" variant="outline" icon={<MessageSquare className="size-4" />} onClick={() => void saveNote()} disabled={!note.trim()} loading={busy === 'note'}>Add note</Button>
              </div>
            )}
            {activity.error ? <ErrorState error={activity.error} onRetry={activity.reload} /> : <ActivityLog items={activity.data ?? []} tz={b.timezone} />}
          </Card>
        </div>
      </div>
    </>
  )
}

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? 'sm:col-span-2' : undefined}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5">{children}</dd></div>
}

function ActivityLog({ items, tz }: { items: OrderActivity[]; tz: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">No activity yet.</p>
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4">
      {items.map((a) => (
        <li key={a.id} className="text-sm">
          <p className="text-xs text-slate-500">{formatDateTime(a.created_at, tz)} · {a.actor?.full_name || a.actor?.email || 'Unknown user'}</p>
          {a.kind === 'status_changed' ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {a.from_status && <OrderStatusBadge status={a.from_status} />}<ArrowRight className="size-3 text-slate-400" aria-label="to" />{a.to_status && <OrderStatusBadge status={a.to_status} />}
            </p>
          ) : null}
          {a.message && <p className={a.kind === 'note' ? 'mt-0.5 whitespace-pre-wrap rounded bg-surface p-2' : 'mt-0.5'}>{a.message}</p>}
        </li>
      ))}
    </ol>
  )
}
