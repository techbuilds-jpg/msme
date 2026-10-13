import { useEffect, useState } from 'react'
import { Button, Card, ErrorState, Select, Spinner } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDateTime } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { listAudit, type AuditEntry } from './api'

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All events' },
  { value: 'business_members', label: 'Team & roles' },
  { value: 'business_invitations', label: 'Invitations' },
  { value: 'sales', label: 'Sales' },
  { value: 'payments', label: 'Payments' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'report.', label: 'Exports' },
  { value: 'business_settings', label: 'Settings' },
]

/** Readable one-liner for an audit row. Details are shown raw underneath for completeness. */
function describe(a: AuditEntry): string {
  const changes = (a.details as { changes?: Record<string, { from: unknown; to: unknown }> }).changes
  if (a.action === 'report.exported') return `Exported report "${a.entity_id}" (${String(a.details.rows)} rows)`
  if (a.action === 'business.created') return 'Business created'
  const [table, op] = a.action.split('.')
  const what = table.replace(/_/g, ' ')
  if (op === 'insert') return `Created ${what} record`
  if (op === 'delete') return `Deleted ${what} record`
  if (changes) {
    if (changes.status?.to === 'voided') return `Voided ${what} record${changes.void_reason ? `: ${String(changes.void_reason.to)}` : ''}`
    return `Changed ${what}: ${Object.keys(changes).join(', ')}`
  }
  return a.action
}

export function AuditLogPanel() {
  const { current } = useCurrentBusiness()
  const bid = current.business.id
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [more, setMore] = useState(false)

  const load = async (before?: number) => {
    setLoading(true); setError(null)
    try {
      const page = await listAudit(bid, { before, action: filter })
      setRows((r) => (before ? [...r, ...page] : page))
      setMore(page.length === 100)
      const ids = [...new Set(page.map((p) => p.actor_id).filter(Boolean))] as string[]
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        setNames((n) => ({ ...n, ...Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name || p.email || 'Unknown'])) }))
      }
    } catch (e) { setError(e) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [bid, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
        <Select aria-label="Filter events" wrapperClassName="w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <p className="text-xs text-slate-500">The audit log can't be edited or deleted from the app.</p>
      </div>
      {error ? <ErrorState error={error} onRetry={() => void load()} /> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((a) => (
            <li key={a.id} className="p-3 text-sm">
              <p><span className="font-medium">{a.actor_id ? names[a.actor_id] ?? 'Former member' : 'System'}</span> · {describe(a)}</p>
              <p className="text-xs text-slate-500">{formatDateTime(a.created_at, current.business.timezone)}</p>
              <details className="mt-1 text-xs"><summary className="cursor-pointer text-navy-500">Details</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface p-2 whitespace-pre-wrap break-all">{JSON.stringify(a.details, null, 2)}</pre>
              </details>
            </li>
          ))}
          {!loading && !rows.length && <li className="p-6 text-center text-sm text-slate-500">No events recorded.</li>}
        </ul>
      )}
      {loading && <Spinner />}
      {more && !loading && <div className="border-t border-slate-100 p-3"><Button variant="outline" size="sm" onClick={() => void load(rows[rows.length - 1]?.id)}>Load older</Button></div>}
    </Card>
  )
}
