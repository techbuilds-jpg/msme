import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, Select } from '@/components/ui'
import { CanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { ROLE_LABELS } from '@/lib/permissions'
import { useAsync } from '@/lib/useAsync'
import { EMPLOYMENT_LABEL, listEmployees, type EmploymentStatus } from './api'
import { EmployeeFormModal } from './EmployeeForm'

export const EMPLOYMENT_TONE: Record<EmploymentStatus, string> = { active: 'green', on_leave: 'amber', resigned: 'slate', terminated: 'slate' }

export function EmployeesPage() {
  const { current } = useCurrentBusiness()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'current' | 'all'>('current')
  const [adding, setAdding] = useState(false)
  const { data, loading, error, reload } = useAsync(() => listEmployees(current.business.id), [current.business.id])
  const rows = data?.filter((e) => status === 'all' || e.employment_status === 'active' || e.employment_status === 'on_leave')

  return (
    <>
      <PageHeader title="Employees" subtitle="Staff directory. People with a login are managed under Settings → Team."
        actions={<CanWrite perm="team.manage"><Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add employee</Button></CanWrite>} />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-3">
          <Select aria-label="Show" wrapperClassName="w-48" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="current">Current staff</option>
            <option value="all">Everyone, incl. former</option>
          </Select>
        </div>
        <DataTable rows={rows} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/employees/${r.id}`)}
          empty={<EmptyState title="No employees listed" description="Add staff so you can assign orders to them. They don't need a login." />}
          columns={[
            { header: 'Name', cell: (r) => <span className="font-medium">{r.full_name}</span> },
            { header: 'Position', cell: (r) => [r.job_title, r.department].filter(Boolean).join(' · ') || '—' },
            { header: 'Contact', cell: (r) => <span className="text-slate-600">{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}</span> },
            { header: 'App access', cell: (r) => r.member ? (r.member.is_active ? <Badge tone="navy">{ROLE_LABELS[r.member.role]}</Badge> : <Badge>Deactivated</Badge>) : <span className="text-slate-400">No login</span> },
            { header: 'Status', cell: (r) => <Badge tone={EMPLOYMENT_TONE[r.employment_status]}>{EMPLOYMENT_LABEL[r.employment_status]}</Badge> },
          ]} />
      </Card>
      {adding && <EmployeeFormModal onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); navigate(`/employees/${id}`) }} />}
    </>
  )
}
