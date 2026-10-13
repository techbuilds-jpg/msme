import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, DataTable, EmptyState, PageHeader, Select, ButtonLink } from '@/components/ui'
import { OrderStatusBadge, ORDER_STATUSES, ORDER_STATUS_LABEL, PriorityBadge, type OrderStatus } from '@/components/shared/StatusBadges'
import { CanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { LIST_LIMIT } from '@/lib/search'
import { useAsync } from '@/lib/useAsync'
import { useDebounced } from '@/lib/useDebounced'
import { employeeOptions, listOrders } from './api'

export function OrdersPage() {
  const { current } = useCurrentBusiness()
  const bid = current.business.id
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? 'open') as OrderStatus | 'open' | 'all'
  const assignee = params.get('assignee') ?? ''
  const [search, setSearch] = useState('')
  const q = useDebounced(search, 300)
  const setFilter = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }

  const employees = useAsync(() => employeeOptions(bid), [bid])
  const { data, loading, error, reload } = useAsync(() => listOrders(bid, { search: q, status, assignee: assignee || undefined }), [bid, q, status, assignee])

  return (
    <>
      <PageHeader title="Orders & Operations" actions={
        <CanWrite perm="orders.manage"><ButtonLink to="/orders/new"><Plus className="size-4" aria-hidden /> New order</ButtonLink></CanWrite>
      } />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" placeholder="Search order number or description" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Select aria-label="Status" wrapperClassName="w-44" value={status} onChange={(e) => setFilter('status', e.target.value === 'open' ? '' : e.target.value)}>
            <option value="open">Open orders</option>
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </Select>
          <Select aria-label="Assigned to" wrapperClassName="w-48" value={assignee} onChange={(e) => setFilter('assignee', e.target.value)}>
            <option value="">Anyone</option>
            {employees.data?.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </div>
        <DataTable
          rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/orders/${r.id}`)}
          empty={<EmptyState title={q || status !== 'open' || assignee ? 'No matching orders' : 'No open orders'} description="Orders you create appear here with their status and assignee." />}
          columns={[
            { header: 'Order', cell: (r) => <><span className="font-medium">{r.order_number}</span><span className="block max-w-xs truncate text-xs text-slate-500">{r.description ?? ''}</span></> },
            { header: 'Customer', cell: (r) => r.customer?.name ?? <span className="text-slate-400">—</span> },
            { header: 'Date', cell: (r) => formatDate(r.order_date) },
            { header: 'Due', cell: (r) => formatDate(r.due_date) },
            { header: 'Assigned', cell: (r) => r.assignee?.full_name ?? <span className="text-slate-400">—</span> },
            { header: 'Priority', cell: (r) => <PriorityBadge priority={r.priority} /> },
            { header: 'Status', cell: (r) => <OrderStatusBadge status={r.status} /> },
            { header: 'Amount', className: 'text-right', cell: (r) => <span className="tabular-nums">{formatMoney(r.total_centavos, current.business.currency)}</span> },
          ]}
        />
        {data?.length === LIST_LIMIT && <p className="p-3 text-xs text-slate-500">Showing the latest {LIST_LIMIT}. Use filters to narrow the list.</p>}
      </Card>
    </>
  )
}
