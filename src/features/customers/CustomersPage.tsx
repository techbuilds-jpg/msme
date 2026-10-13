import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, Select } from '@/components/ui'
import { CanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatMoney } from '@/lib/money'
import { LIST_LIMIT } from '@/lib/search'
import { useAsync } from '@/lib/useAsync'
import { useDebounced } from '@/lib/useDebounced'
import { customerBalances, listCustomers } from './api'
import { CustomerFormModal } from './CustomerForm'

export function CustomersPage() {
  const { current, can } = useCurrentBusiness()
  const bid = current.business.id
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [adding, setAdding] = useState(false)
  const q = useDebounced(search, 300)

  const { data, loading, error, reload } = useAsync(async () => {
    const customers = await listCustomers(bid, { search: q, status })
    const balances = can('sales.view') && customers.length ? await customerBalances(bid, customers.map((c) => c.id)) : []
    const byId = new Map(balances.map((b) => [b.customer_id, b]))
    return customers.map((c) => ({ ...c, balance: byId.get(c.id) }))
  }, [bid, q, status])

  return (
    <>
      <PageHeader title="Customers" actions={
        <CanWrite perm="customers.manage"><Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add customer</Button></CanWrite>
      } />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search customers</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" placeholder="Search name, number or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} wrapperClassName="w-40">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </div>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/customers/${r.id}`)}
          empty={<EmptyState title={q ? 'No matching customers' : 'No customers yet'} description={q ? 'Try a different search.' : 'Add your first customer to start recording orders and sales.'} />}
          columns={[
            { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: 'Contact', cell: (r) => <span className="text-slate-600">{[r.contact_number, r.email].filter(Boolean).join(' · ') || '—'}</span> },
            ...(can('sales.view') ? [{ header: 'Outstanding', className: 'text-right', cell: (r: NonNullable<typeof data>[number]) => r.balance?.balance_centavos ? <span className="font-medium text-amber-800">{formatMoney(r.balance.balance_centavos, current.business.currency)}</span> : <span className="text-slate-400">—</span> }] : []),
            { header: 'Status', cell: (r) => r.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge> },
          ]}
        />
        {data?.length === LIST_LIMIT && <p className="p-3 text-xs text-slate-500">Showing the first {LIST_LIMIT}. Use search to narrow the list.</p>}
      </Card>
      <CustomerFormModal open={adding} onClose={() => setAdding(false)} businessId={bid} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </>
  )
}
