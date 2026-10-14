import { ArrowLeft, Eye } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Spinner, Stat, Tabs, Textarea, errorMessage } from '@/components/ui'
import { PRODUCT_NAME } from '@/app/config'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBusiness } from '@/features/business/BusinessProvider'
import { CATEGORY_LABELS, type AccessState } from '@/features/business/types'
import { formatDate, formatDateTime } from '@/lib/dates'
import { useAsync } from '@/lib/useAsync'
import {
  adminBusinesses, adminConsultations, adminOverview, appErrors, extendTrial, platformAudit, platformSettings,
  setPlan, setPlatformSetting, setSuspension, supportOpen, updateConsultation, type AdminBusiness,
} from './api'

type Tab = 'overview' | 'businesses' | 'consultations' | 'support' | 'errors' | 'audit' | 'settings'
const STATE: Record<AccessState, { tone: string; label: string }> = {
  trialing: { tone: 'navy', label: 'Trial' }, active: { tone: 'green', label: 'Active' },
  expired: { tone: 'amber', label: 'Expired' }, suspended: { tone: 'red', label: 'Suspended' },
}

/**
 * Platform administration. Shows account metadata and aggregates only; tenant records are reachable solely
 * through an owner-issued support grant (Support tab), and every admin action is audited.
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' }, { value: 'businesses', label: 'Businesses' }, { value: 'consultations', label: 'Inquiries' },
    { value: 'support', label: 'Support access' }, { value: 'errors', label: 'App errors' }, { value: 'audit', label: 'Admin audit' },
    { value: 'settings', label: 'Platform settings' },
  ]
  const tab = tabs.find((t) => t.value === params.get('tab'))?.value ?? 'overview'
  return (
    <div className="min-h-dvh">
      <header className="bg-navy-900 px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="font-semibold">{PRODUCT_NAME} · Platform administration</p>
          <Link to="/" className="flex items-center gap-1 text-sm text-navy-100 underline"><ArrowLeft className="size-4" aria-hidden /> Back to app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <PageHeader title="Platform administration" subtitle="Account data and usage only. Business records require the owner's support grant." />
        <Tabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={tabs} />
        {tab === 'overview' && <OverviewTab />}
        {tab === 'businesses' && <BusinessesTab />}
        {tab === 'consultations' && <ConsultationsTab />}
        {tab === 'support' && <SupportTab />}
        {tab === 'errors' && <ErrorsTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}

function OverviewTab() {
  const { data, error, reload } = useAsync(adminOverview, [])
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return <Spinner />
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered businesses" value={data.businesses} hint={`${data.users} user accounts`} />
        <Stat label="Active trials" value={data.active_trials} />
        <Stat label="Expired trials" value={data.expired_trials} tone={data.expired_trials ? 'warn' : 'default'} />
        <Stat label="Subscribed" value={data.active_subscriptions} tone="good" />
        <Stat label="New registrations" value={data.new_7d} hint={`${data.new_30d} in the last 30 days`} />
        <Stat label="Inquiries (new)" value={data.consultations_new} hint={`${data.upgrade_interest} businesses showed upgrade interest`} tone={data.consultations_new ? 'warn' : 'default'} />
        <Stat label="Suspended" value={data.suspended} tone={data.suspended ? 'bad' : 'default'} />
        <Stat label="App errors (24 h)" value={data.errors_24h} hint={`${data.errors_7d} in 7 days`} tone={data.errors_24h ? 'warn' : 'good'} />
      </div>
      <Card title="Businesses by category">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((c) => (
            <li key={c} className="flex justify-between border-b border-slate-100 py-1"><span>{CATEGORY_LABELS[c]}</span><span className="tabular-nums">{data.by_category[c] ?? 0}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Active demo sandboxes: {data.demos_active} (not counted above). Data retention after trial expiry: {data.retention_days} days.</p>
      </Card>
    </div>
  )
}

function BusinessesTab() {
  const { data, loading, error, reload } = useAsync(adminBusinesses, [])
  const [filter, setFilter] = useState<'all' | AccessState | 'interest' | 'retention'>('all')
  const [selected, setSelected] = useState<AdminBusiness | null>(null)
  const rows = data?.filter((b) => filter === 'all' || (filter === 'interest' ? !!b.upgrade_interest_at : filter === 'retention' ? b.past_retention : b.access_state === filter))
  return (
    <Card padded={false}>
      <div className="border-b border-slate-100 p-3">
        <Select aria-label="Filter" wrapperClassName="w-60" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All businesses</option><option value="trialing">Active trials</option><option value="expired">Expired trials</option>
          <option value="active">Subscribed</option><option value="suspended">Suspended</option><option value="interest">Showed upgrade interest</option>
          <option value="retention">Past retention period</option>
        </Select>
      </div>
      <DataTable rows={rows} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id} onRowClick={setSelected}
        empty={<EmptyState title="No businesses" />}
        columns={[
          { header: 'Business', cell: (r) => <><span className="font-medium">{r.name}</span><span className="block text-xs text-slate-500">{CATEGORY_LABELS[r.category]} · {r.owner_email ?? 'no owner'}</span></> },
          { header: 'Registered', cell: (r) => formatDate(r.created_at) },
          { header: 'State', cell: (r) => <span className="flex flex-wrap gap-1"><Badge tone={STATE[r.access_state].tone}>{STATE[r.access_state].label}</Badge>{r.past_retention && <Badge tone="red">Past retention</Badge>}{r.upgrade_interest_at && <Badge tone="violet">Interested</Badge>}</span> },
          { header: 'Trial ends', cell: (r) => (r.plan === 'trial' ? formatDate(r.trial_ends_at) : '—') },
          { header: 'Usage', cell: (r) => <span className="text-xs">{r.transactions_used}{r.max_transactions != null && `/${r.max_transactions}`} txns · {r.users_used}{r.max_users != null && `/${r.max_users}`} users</span> },
        ]} />
      {selected && <BusinessModal b={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void reload() }} />}
    </Card>
  )
}

const ALL_MODULES = ['sales', 'orders', 'customers', 'expenses', 'employees', 'reports']

function BusinessModal({ b, onClose, onSaved }: { b: AdminBusiness; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState<'extend' | 'suspend' | 'plan'>('extend')
  const [days, setDays] = useState('7')
  const [plan, setPlanValue] = useState<'trial' | 'standard'>(b.plan === 'standard' ? 'standard' : 'trial')
  const [maxUsers, setMaxUsers] = useState(b.max_users?.toString() ?? '')
  const [maxTx, setMaxTx] = useState(b.max_transactions?.toString() ?? '')
  const [modules, setModules] = useState(b.enabled_modules.filter((m) => m !== 'dashboard'))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const suspended = !!b.suspended_at

  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const save = async () => {
    setError(null)
    if (!reason.trim()) return setError('Give a reason. It is recorded in the audit log and visible to the owner.')
    setSaving(true)
    try {
      if (action === 'extend') await extendTrial(b.id, Number(days), reason)
      else if (action === 'suspend') await setSuspension(b.id, !suspended, reason)
      else {
        const mu = num(maxUsers), mt = num(maxTx)
        if ((mu != null && (!Number.isInteger(mu) || mu < 1)) || (mt != null && (!Number.isInteger(mt) || mt < 1))) throw new Error('Limits must be whole numbers above zero, or empty for unlimited.')
        await setPlan(b.id, { plan, maxUsers: mu, maxTransactions: mt, modules, reason })
      }
      onSaved()
    } catch (e) { setError(errorMessage(e)); setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={b.name} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={action === 'suspend' && !suspended ? 'danger' : 'primary'} onClick={() => void save()} loading={saving}>Apply</Button></>}>
      <div className="space-y-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Owner</dt><dd>{b.owner_email ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Plan / state</dt><dd>{b.plan} · {STATE[b.access_state].label}</dd></div>
          <div><dt className="text-xs text-slate-500">Trial</dt><dd>{formatDate(b.trial_started_at)} – {formatDate(b.trial_ends_at)}</dd></div>
          <div><dt className="text-xs text-slate-500">Upgrade interest</dt><dd>{b.upgrade_interest_at ? formatDateTime(b.upgrade_interest_at) : 'No'}</dd></div>
          {suspended && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Suspended</dt><dd>{formatDateTime(b.suspended_at)} — {b.suspended_reason}</dd></div>}
        </dl>
        {error && <Alert tone="error">{error}</Alert>}
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          {b.plan === 'trial' && <option value="extend">Extend trial</option>}
          <option value="suspend">{suspended ? 'Lift suspension' : 'Suspend account'}</option>
          <option value="plan">Plan, limits and modules</option>
        </Select>
        {action === 'extend' && <Input label="Extend by (days)" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} hint="Counted from the later of today or the current end date." />}
        {action === 'suspend' && !suspended && <Alert tone="warning">Suspending makes the business read-only for everyone in it. Records are kept.</Alert>}
        {action === 'plan' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Plan" value={plan} onChange={(e) => setPlanValue(e.target.value as typeof plan)}>
              <option value="trial">Trial</option><option value="standard">Standard (no expiry)</option>
            </Select>
            <Input label="Max users" type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} hint="Empty = unlimited" />
            <Input label="Max orders + sales" type="number" min={1} value={maxTx} onChange={(e) => setMaxTx(e.target.value)} hint="Empty = unlimited" />
            <fieldset className="sm:col-span-3">
              <legend className="label">Available modules</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {ALL_MODULES.map((m) => <Checkbox key={m} label={m[0].toUpperCase() + m.slice(1)} checked={modules.includes(m)}
                  onChange={(e) => setModules(e.target.checked ? [...modules, m] : modules.filter((x) => x !== m))} />)}
              </div>
            </fieldset>
          </div>
        )}
        <Textarea label="Reason" required rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}

function ConsultationsTab() {
  const { data, loading, error, reload } = useAsync(adminConsultations, [])
  const [err, setErr] = useState<string | null>(null)
  const change = async (id: string, status: 'new' | 'contacted' | 'closed') => {
    setErr(null)
    try { await updateConsultation(id, status); void reload() } catch (e) { setErr(errorMessage(e)) }
  }
  return (
    <Card padded={false}>
      {err && <Alert tone="error" className="m-3">{err}</Alert>}
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id}
        empty={<EmptyState title="No inquiries yet" description="Trial users can contact you from the trial banner." />}
        columns={[
          { header: 'Received', cell: (r) => formatDateTime(r.created_at) },
          { header: 'Business', cell: (r) => <><span className="font-medium">{r.business_name ?? '—'}</span><span className="block text-xs text-slate-500">{r.requested_by} · {r.requested_by_email}</span></> },
          { header: 'Message', cell: (r) => <span className="block max-w-sm whitespace-pre-wrap">{r.message ?? '—'}</span> },
          { header: 'Reach them at', cell: (r) => r.preferred_contact ?? r.business_contact_number ?? '—' },
          { header: 'Status', cell: (r) => (
            <select className="input w-32 py-1" aria-label="Status" value={r.status} onChange={(e) => void change(r.id, e.target.value as typeof r.status)}>
              <option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option>
            </select>) },
        ]} />
    </Card>
  )
}

function SupportTab() {
  const { businesses, select, reload } = useBusiness()
  const navigate = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const granted = businesses?.filter((b) => b.support_access) ?? []
  const open = async (id: string) => {
    setErr(null)
    try { await supportOpen(id); select(id); await reload(); navigate('/') } catch (e) { setErr(errorMessage(e)) }
  }
  return (
    <Card title="Businesses that granted you access">
      <p className="mb-3 text-sm text-slate-600">Owners grant access from Settings → Support access. It is read-only, time-limited, and every opening is logged in their audit log.</p>
      {err && <Alert tone="error" className="mb-3">{err}</Alert>}
      {!granted.length ? <p className="text-sm text-slate-500">No active grants.</p> : (
        <ul className="divide-y divide-slate-100">
          {granted.map((b) => (
            <li key={b.business_id} className="flex items-center justify-between py-2 text-sm">
              <span>{b.name} <span className="text-slate-500">· {CATEGORY_LABELS[b.category]}</span></span>
              <Button size="sm" variant="outline" icon={<Eye className="size-4" />} onClick={() => void open(b.business_id)}>Open read-only</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ErrorsTab() {
  const { data, loading, error, reload } = useAsync(appErrors, [])
  return (
    <Card padded={false}>
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => String(r.id)}
        empty={<EmptyState title="No client errors reported" />}
        columns={[
          { header: 'When', cell: (r) => formatDateTime(r.created_at) },
          { header: 'Page', cell: (r) => <code className="text-xs">{r.url ?? '—'}</code> },
          { header: 'Error', cell: (r) => <span className="block max-w-xl break-words">{r.message}</span> },
        ]} />
    </Card>
  )
}

function AuditTab() {
  const { data, loading, error, reload } = useAsync(platformAudit, [])
  return (
    <Card padded={false}>
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => String(r.id)}
        empty={<EmptyState title="No platform events yet" />}
        columns={[
          { header: 'When', cell: (r) => formatDateTime(r.created_at) },
          { header: 'Event', cell: (r) => <code className="text-xs">{r.action}</code> },
          { header: 'Details', cell: (r) => <code className="block max-w-xl break-all text-xs">{JSON.stringify(r.details)}</code> },
        ]} />
    </Card>
  )
}

const SETTINGS: { key: string; label: string; hint: string }[] = [
  { key: 'trial_days', label: 'Trial length (days)', hint: 'Applies to businesses created from now on.' },
  { key: 'trial_max_users', label: 'Trial user limit', hint: 'Active users plus pending invitations.' },
  { key: 'trial_max_transactions', label: 'Trial orders + sales limit', hint: '' },
  { key: 'retention_days_after_expiry', label: 'Retention after trial expiry (days)', hint: 'Flags expired businesses for review. Nothing is deleted automatically.' },
]

function SettingsTab() {
  const { session } = useAuth()
  const { data, error, reload } = useAsync(platformSettings, [])
  const [values, setValues] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return <Spinner />
  const get = (k: string) => data.find((s) => s.key === k)?.value
  const contact = (get('contact') ?? {}) as { email?: string | null; message?: string }

  const save = async (key: string, value: unknown) => {
    setMsg(null)
    try { await setPlatformSetting(key, value); setMsg({ tone: 'success', text: 'Saved.' }); void reload() } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }) }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {msg && <Alert tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Card title="Trial defaults and retention">
        <div className="space-y-3">
          {SETTINGS.map((s) => (
            <div key={s.key} className="flex items-end gap-2">
              <Input label={s.label} hint={s.hint} type="number" min={1} max={3650} wrapperClassName="flex-1"
                value={values[s.key] ?? String(get(s.key) ?? '')} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
              <Button variant="outline" className="mb-5" disabled={values[s.key] === undefined} onClick={() => void save(s.key, Number(values[s.key]))}>Save</Button>
            </div>
          ))}
        </div>
      </Card>
      <ContactSettings key={JSON.stringify(contact)} initial={contact} onSave={(v) => void save('contact', v)} />
      <p className="text-xs text-slate-500">Signed in as {session?.user.email}. Platform admins are added in the database (see docs/SETUP.md).</p>
    </div>
  )
}

function ContactSettings({ initial, onSave }: { initial: { email?: string | null; message?: string }; onSave: (v: { email: string | null; message: string }) => void }) {
  const [email, setEmail] = useState(initial.email ?? '')
  const [message, setMessage] = useState(initial.message ?? '')
  return (
    <Card title="Contact details shown to trial users">
      <div className="space-y-3">
        <Input label="Contact email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Textarea label="Message" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        <Button variant="outline" onClick={() => onSave({ email: email.trim() || null, message: message.trim() })}>Save contact details</Button>
      </div>
    </Card>
  )
}
