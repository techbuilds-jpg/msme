import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui'
import { OrderStatusBadge, ORDER_STATUS_LABEL, type OrderStatus } from '@/components/shared/StatusBadges'
import { useCanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { listOrders } from '@/features/orders/api'
import { formatDate, formatDateTime } from '@/lib/dates'
import { ROLE_LABELS } from '@/lib/permissions'
import { useAsync } from '@/lib/useAsync'
import { EMPLOYMENT_LABEL, getEmployee, memberActivity } from './api'
import { EmployeeFormModal } from './EmployeeForm'
import { EMPLOYMENT_TONE } from './EmployeesPage'

export function EmployeeDetailPage() {
  const { id = '' } = useParams()
  const { current, can } = useCurrentBusiness()
  const b = current.business
  const navigate = useNavigate()
  const canEdit = useCanWrite('team.manage')
  const [editing, setEditing] = useState(false)
  const emp = useAsync(() => getEmployee(id), [id])
  const orders = useAsync(() => (can('orders.view') ? listOrders(b.id, { assignee: id, status: 'all' }) : Promise.resolve([])), [b.id, id])
  const userId = emp.data?.member?.user_id
  const activity = useAsync(() => (userId && can('orders.view') ? memberActivity(b.id, userId) : Promise.resolve([])), [b.id, userId])

  if (emp.loading && !emp.data) return <Spinner />
  if (emp.error) return <ErrorState error={emp.error} onRetry={emp.reload} />
  const e = emp.data
  if (!e) return <ErrorState error="Employee not found." />
  const open = orders.data?.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length ?? 0

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3">{e.full_name} <Badge tone={EMPLOYMENT_TONE[e.employment_status]}>{EMPLOYMENT_LABEL[e.employment_status]}</Badge></span>}
        subtitle={[e.job_title, e.department].filter(Boolean).join(' · ') || undefined}
        actions={canEdit && <Button variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Profile">
          <dl className="space-y-3 text-sm">
            <Row label="Phone">{e.phone ?? '—'}</Row>
            <Row label="Email">{e.email ?? '—'}</Row>
            <Row label="Hired on">{formatDate(e.hired_on)}</Row>
            <Row label="App access">{e.member ? <>{ROLE_LABELS[e.member.role]}{!e.member.is_active && ' (deactivated)'}</> : 'No login. Invite them under Settings → Team if they need one.'}</Row>
            {e.notes && <Row label="Notes"><span className="whitespace-pre-wrap">{e.notes}</span></Row>}
          </dl>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          {can('orders.view') && (
            <Card title={`Assigned orders · ${open} open`} padded={false}>
              <DataTable rows={orders.data} loading={orders.loading} error={orders.error} onRetry={orders.reload} rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/orders/${r.id}`)} empty={<EmptyState title="No orders assigned" />}
                columns={[
                  { header: 'Order', cell: (r) => <span className="font-medium">{r.order_number}</span> },
                  { header: 'Customer', cell: (r) => r.customer?.name ?? '—' },
                  { header: 'Due', cell: (r) => formatDate(r.due_date) },
                  { header: 'Status', cell: (r) => <OrderStatusBadge status={r.status} /> },
                ]} />
            </Card>
          )}
          {e.member && can('orders.view') && (
            <Card title="Recent activity">
              {activity.error ? <ErrorState error={activity.error} onRetry={activity.reload} /> : !activity.data?.length ? (
                <p className="text-sm text-slate-500">No order activity recorded by this person yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {activity.data.map((a) => (
                    <li key={a.id}>
                      <span className="text-xs text-slate-500">{formatDateTime(a.created_at, b.timezone)}</span>{' · '}
                      <Link className="text-navy-500 underline" to={`/orders/${a.order_id}`}>{a.order?.order_number ?? 'order'}</Link>{' · '}
                      {a.kind === 'status_changed' ? `Status → ${ORDER_STATUS_LABEL[a.to_status as OrderStatus] ?? a.to_status}` : a.kind === 'note' ? 'Added a note' : a.message}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
      {editing && <EmployeeFormModal employee={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void emp.reload() }} />}
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5">{children}</dd></div>
}
