import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ButtonLink, Card, Checkbox, DataTable, EmptyState, Input, PageHeader, Select, Tabs } from '@/components/ui'
import { PaymentStatusBadge, PAYMENT_STATUS_LABEL, type PaymentStatus } from '@/components/shared/StatusBadges'
import { CanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { LIST_LIMIT } from '@/lib/search'
import { useAsync } from '@/lib/useAsync'
import { useDebounced } from '@/lib/useDebounced'
import { listSales } from './api'
import { CatalogPanel } from './CatalogPanel'

export function SalesPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'catalog' ? 'catalog' : 'sales'
  return (
    <>
      <PageHeader title="Sales & Collections" actions={
        <CanWrite perm="sales.manage"><ButtonLink to="/sales/new"><Plus className="size-4" aria-hidden /> New sale</ButtonLink></CanWrite>
      } />
      <p className="-mt-3 mb-4 text-xs text-slate-500">Sale numbers are internal references, not official BIR receipts or invoices.</p>
      <Tabs value={tab} onChange={(v) => setParams(v === 'catalog' ? { tab: 'catalog' } : {}, { replace: true })}
        tabs={[{ value: 'sales', label: 'Sales' }, { value: 'catalog', label: 'Price list' }]} />
      {tab === 'sales' ? <SalesList /> : <CatalogPanel />}
    </>
  )
}

function SalesList() {
  const { current } = useCurrentBusiness()
  const b = current.business
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | 'open' | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const q = useDebounced(search, 300)
  const { data, loading, error, reload } = useAsync(
    () => listSales(b.id, { search: q, paymentStatus, from: from || undefined, to: to || undefined, showVoided }),
    [b.id, q, paymentStatus, from, to, showVoided])

  const outstanding = data?.reduce((s, r) => (r.status === 'active' ? s + r.total_centavos - r.paid_centavos : s), 0) ?? 0

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search by sale number</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" placeholder="Search sale number" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Select aria-label="Payment status" wrapperClassName="w-44" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)}>
          <option value="all">All payment statuses</option>
          <option value="open">With balance</option>
          {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
        </Select>
        <Input label="From" type="date" wrapperClassName="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" wrapperClassName="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <Checkbox label="Show voided" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="pb-2" />
      </div>
      <DataTable
        rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/sales/${r.id}`)}
        empty={<EmptyState title="No sales found" description="Sales you record appear here with their payment status." />}
        columns={[
          { header: 'Sale', cell: (r) => <span className={r.status === 'voided' ? 'font-medium text-slate-400 line-through' : 'font-medium'}>{r.sale_number}</span> },
          { header: 'Date', cell: (r) => formatDate(r.sale_date) },
          { header: 'Customer', cell: (r) => r.customer?.name ?? <span className="text-slate-400">Walk-in</span> },
          { header: 'Total', className: 'text-right', cell: (r) => <span className="tabular-nums">{formatMoney(r.total_centavos, b.currency)}</span> },
          { header: 'Paid', className: 'text-right', cell: (r) => <span className="tabular-nums">{formatMoney(r.paid_centavos, b.currency)}</span> },
          { header: 'Balance', className: 'text-right', cell: (r) => <span className="tabular-nums">{r.status === 'voided' ? '—' : formatMoney(r.total_centavos - r.paid_centavos, b.currency)}</span> },
          { header: 'Status', cell: (r) => <PaymentStatusBadge status={r.payment_status} voided={r.status === 'voided'} /> },
        ]}
      />
      {!!data?.length && (
        <p className="border-t border-slate-100 p-3 text-right text-sm">Outstanding on listed sales: <strong className="tabular-nums">{formatMoney(outstanding, b.currency)}</strong></p>
      )}
      {data?.length === LIST_LIMIT && <p className="p-3 text-xs text-slate-500">Showing the latest {LIST_LIMIT}. Use filters to narrow the list.</p>}
    </Card>
  )
}
