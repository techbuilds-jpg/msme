import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, ButtonLink, Card, DataTable, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '@/components/ui'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/shared/StatusBadges'
import { useCanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { listOrders } from '@/features/orders/api'
import { listSales } from '@/features/sales/api'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useAsync } from '@/lib/useAsync'
import { customerBalances, getCustomer } from './api'
import { CustomerFormModal } from './CustomerForm'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { current, can } = useCurrentBusiness()
  const b = current.business
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const canEdit = useCanWrite('customers.manage')
  const canOrder = useCanWrite('orders.manage')
  const canSell = useCanWrite('sales.manage')
  const seesSales = can('sales.view')

  const customer = useAsync(() => getCustomer(id), [id])
  const orders = useAsync(() => (can('orders.view') ? listOrders(b.id, { customerId: id, status: 'all' }) : Promise.resolve([])), [b.id, id])
  const sales = useAsync(() => (seesSales ? listSales(b.id, { customerId: id, showVoided: true }) : Promise.resolve([])), [b.id, id])
  const balance = useAsync(async () => (seesSales ? (await customerBalances(b.id, [id]))[0] ?? null : null), [b.id, id])

  if (customer.loading && !customer.data) return <Spinner />
  if (customer.error) return <ErrorState error={customer.error} onRetry={customer.reload} />
  const c = customer.data
  if (!c) return <ErrorState error="Customer not found, or you don't have access to them." />
  const m = (x: number) => formatMoney(x, b.currency)

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{c.name} {c.status === 'inactive' && <Badge>Inactive</Badge>}</span>}
        subtitle={[c.contact_number, c.email].filter(Boolean).join(' · ') || 'No contact details'}
        actions={<>
          {canOrder && <ButtonLink variant="outline" to={`/orders/new?customer=${c.id}`}><Plus className="size-4" aria-hidden /> Order</ButtonLink>}
          {canSell && seesSales && <ButtonLink variant="outline" to={`/sales/new?customer=${c.id}`}><Plus className="size-4" aria-hidden /> Sale</ButtonLink>}
          {canEdit && <Button variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>}
        </>}
      />

      {seesSales && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Stat label="Total sales" value={m(balance.data?.total_centavos ?? 0)} hint={`${balance.data?.sales_count ?? 0} sales`} />
          <Stat label="Paid" value={m(balance.data?.paid_centavos ?? 0)} tone="good" />
          <Stat label="Outstanding balance" value={m(balance.data?.balance_centavos ?? 0)} tone={(balance.data?.balance_centavos ?? 0) > 0 ? 'warn' : 'default'} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Details">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Address</dt><dd>{c.address ?? '—'}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{c.notes ?? '—'}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer since</dt><dd>{formatDate(c.created_at)}</dd></div>
          </dl>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          {can('orders.view') && (
            <Card title="Orders" padded={false}>
              <DataTable rows={orders.data} loading={orders.loading} error={orders.error} onRetry={orders.reload} rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/orders/${r.id}`)} empty={<EmptyState title="No orders yet" />}
                columns={[
                  { header: 'Order', cell: (r) => <span className="font-medium">{r.order_number}</span> },
                  { header: 'Date', cell: (r) => formatDate(r.order_date) },
                  { header: 'Status', cell: (r) => <OrderStatusBadge status={r.status} /> },
                  { header: 'Amount', className: 'text-right', cell: (r) => <span className="tabular-nums">{m(r.total_centavos)}</span> },
                ]} />
            </Card>
          )}
          {seesSales && (
            <Card title="Transaction history" padded={false}>
              <DataTable rows={sales.data} loading={sales.loading} error={sales.error} onRetry={sales.reload} rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/sales/${r.id}`)} empty={<EmptyState title="No sales yet" />}
                columns={[
                  { header: 'Sale', cell: (r) => <span className={r.status === 'voided' ? 'text-slate-400 line-through' : 'font-medium'}>{r.sale_number}</span> },
                  { header: 'Date', cell: (r) => formatDate(r.sale_date) },
                  { header: 'Total', className: 'text-right', cell: (r) => <span className="tabular-nums">{m(r.total_centavos)}</span> },
                  { header: 'Balance', className: 'text-right', cell: (r) => <span className="tabular-nums">{r.status === 'voided' ? '—' : m(r.total_centavos - r.paid_centavos)}</span> },
                  { header: 'Status', cell: (r) => <PaymentStatusBadge status={r.payment_status} voided={r.status === 'voided'} /> },
                ]} />
            </Card>
          )}
        </div>
      </div>
      <CustomerFormModal open={editing} onClose={() => setEditing(false)} businessId={b.id} customer={c} onSaved={() => void customer.reload()} />
    </>
  )
}
