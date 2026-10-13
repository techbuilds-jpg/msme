import { Select } from '@/components/ui'
import { customerOptions } from '@/features/customers/api'
import { employeeOptions } from '@/features/orders/api'
import { useAsync } from '@/lib/useAsync'

export function CustomerSelect({ businessId, value, onChange, label = 'Customer', allowNone = true, noneLabel = '— No customer / walk-in —' }: {
  businessId: string; value: string | null; onChange: (id: string | null) => void; label?: string; allowNone?: boolean; noneLabel?: string
}) {
  const { data, loading } = useAsync(() => customerOptions(businessId), [businessId])
  return (
    <Select label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={loading}>
      {allowNone && <option value="">{noneLabel}</option>}
      {data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.contact_number ? ` · ${c.contact_number}` : ''}</option>)}
    </Select>
  )
}

export function EmployeeSelect({ businessId, value, onChange, label = 'Assigned to' }: {
  businessId: string; value: string | null; onChange: (id: string | null) => void; label?: string
}) {
  const { data, loading } = useAsync(() => employeeOptions(businessId), [businessId])
  return (
    <Select label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={loading}>
      <option value="">— Unassigned —</option>
      {data?.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
    </Select>
  )
}
