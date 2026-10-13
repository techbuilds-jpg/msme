import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, EmptyState, Input, Select, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDateTime } from '@/lib/dates'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'

/** The owner can let a named platform support person see (not change) this business for a limited time. */
export function SupportAccessPanel() {
  const { current, writable } = useCurrentBusiness()
  const bid = current.business.id
  const grants = useAsync(async () => unwrap(await supabase.from('support_access_grants')
    .select('id, admin_email, reason, expires_at, revoked_at, created_at')
    .eq('business_id', bid).order('created_at', { ascending: false }).limit(50)) as
    { id: string; admin_email: string | null; reason: string; expires_at: string; revoked_at: string | null; created_at: string }[], [bid])
  const [email, setEmail] = useState('')
  const [hours, setHours] = useState('24')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const grant = async () => {
    setMsg(null); setSaving(true)
    try {
      unwrap(await supabase.rpc('grant_support_access', { p_business_id: bid, p_admin_email: email.trim(), p_hours: Number(hours), p_reason: reason }))
      setEmail(''); setReason(''); setMsg({ tone: 'success', text: 'Support access granted.' }); void grants.reload()
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }) } finally { setSaving(false) }
  }
  const revoke = async (id: string) => {
    setMsg(null)
    try { unwrap(await supabase.rpc('revoke_support_access', { p_grant_id: id })); void grants.reload() } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }) }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Card title="Grant support access">
        <p className="mb-4 text-sm text-slate-600">
          Platform staff cannot see your records unless you allow it here. Access is read-only, expires automatically,
          and every time they open your business it is recorded in your audit log.
        </p>
        {msg && <Alert tone={msg.tone} className="mb-4" onClose={() => setMsg(null)}>{msg.text}</Alert>}
        <fieldset disabled={!writable} className="grid gap-4 sm:grid-cols-2">
          <Input label="Support staff email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select label="For" value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="2">2 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option>
          </Select>
          <Input label="Reason" wrapperClassName="sm:col-span-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Help setting up reports" />
          <div><Button onClick={() => void grant()} loading={saving} disabled={!email.trim() || !reason.trim()}>Grant access</Button></div>
        </fieldset>
      </Card>
      <Card title="Access history" padded={false}>
        <DataTable rows={grants.data} loading={grants.loading} error={grants.error} onRetry={grants.reload} rowKey={(r) => r.id}
          empty={<EmptyState title="Support has never been given access" />}
          columns={[
            { header: 'Support staff', cell: (r) => r.admin_email ?? '—' },
            { header: 'Reason', cell: (r) => r.reason },
            { header: 'Until', cell: (r) => formatDateTime(r.expires_at, current.business.timezone) },
            { header: 'Status', cell: (r) => r.revoked_at ? <Badge>Revoked</Badge> : new Date(r.expires_at) < new Date() ? <Badge>Expired</Badge> : <Badge tone="amber">Active</Badge> },
            { header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (r) => !r.revoked_at && new Date(r.expires_at) > new Date() && <button type="button" className="text-xs text-red-700 underline" onClick={() => void revoke(r.id)}>Revoke</button> },
          ]} />
      </Card>
    </div>
  )
}
