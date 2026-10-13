import { Copy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, Input, Modal, Select, errorMessage } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDate } from '@/lib/dates'
import { PERMISSIONS, ROLE_LABELS, type MemberRole, type Permission } from '@/lib/permissions'
import { useAsync } from '@/lib/useAsync'
import { createInvitation, listMembers, listPendingInvitations, revokeInvitation, updateMember, type Member } from './api'

/** Mirrors private.role_permissions(); the database is authoritative. */
const ROLE_DEFAULTS: Record<MemberRole, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: PERMISSIONS.filter((p) => p !== 'settings.manage'),
  employee: ['customers.view', 'customers.manage', 'orders.view', 'orders.manage'],
}
const PERMISSION_LABEL: Record<Permission, string> = {
  'customers.view': 'View customers', 'customers.manage': 'Add / edit customers',
  'orders.view': 'View orders', 'orders.manage': 'Create / update orders',
  'sales.view': 'View sales & payments', 'sales.manage': 'Record sales', 'sales.discount': 'Give discounts', 'payments.manage': 'Record payments & refunds',
  'expenses.view': 'View expenses', 'expenses.manage': 'Record expenses',
  'reports.view': 'View reports', 'reports.export': 'Export reports (CSV)',
  'team.manage': 'Manage employees & invitations', 'settings.manage': 'Business settings (owner)',
}
/** Permissions an owner may grant to employees individually. */
const GRANTABLE: Permission[] = ['sales.view', 'sales.manage', 'sales.discount', 'payments.manage', 'expenses.view', 'expenses.manage', 'reports.view', 'reports.export']

export function TeamPanel() {
  const { current, writable } = useCurrentBusiness()
  const { session } = useAuth()
  const bid = current.business.id
  const isOwner = current.role === 'owner'
  const s = current.subscription
  const members = useAsync(() => listMembers(bid), [bid])
  const invites = useAsync(() => listPendingInvitations(bid), [bid])
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reloadAll = () => { void members.reload(); void invites.reload() }

  const revoke = async (id: string) => {
    setError(null)
    try { await revokeInvitation(id); reloadAll() } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
      <Card title="People with access" actions={<>
        {s.max_users != null && <span className="text-sm text-slate-600">{s.users_used} of {s.max_users} users (incl. pending invitations)</span>}
        {writable && <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>Invite</Button>}
      </>} padded={false}>
        <DataTable rows={members.data} loading={members.loading} error={members.error} onRetry={members.reload} rowKey={(r) => r.id}
          onRowClick={writable ? (r) => setEditing(r) : undefined}
          columns={[
            { header: 'Name', cell: (r) => <><span className="font-medium">{r.profile?.full_name || r.profile?.email}</span>{r.user_id === session?.user.id && <span className="text-xs text-slate-500"> (you)</span>}<span className="block text-xs text-slate-500">{r.profile?.email}</span></> },
            { header: 'Role', cell: (r) => <Badge tone="navy">{ROLE_LABELS[r.role]}</Badge> },
            { header: 'Extra permissions', cell: (r) => r.extra_permissions.length ? <span className="text-xs">{r.extra_permissions.map((p) => PERMISSION_LABEL[p]).join(', ')}</span> : <span className="text-slate-400">—</span> },
            { header: 'Status', cell: (r) => (r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>) },
          ]} />
      </Card>

      <Card title="Pending invitations" padded={false}>
        <DataTable rows={invites.data} loading={invites.loading} error={invites.error} onRetry={invites.reload} rowKey={(r) => r.id}
          empty={<EmptyState title="No pending invitations" />}
          columns={[
            { header: 'Email', cell: (r) => r.email },
            { header: 'Role', cell: (r) => ROLE_LABELS[r.role] },
            { header: 'Expires', cell: (r) => (new Date(r.expires_at) < new Date() ? <Badge tone="amber">Expired</Badge> : formatDate(r.expires_at)) },
            { header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (r) => writable && <button type="button" className="text-xs text-red-700 underline" onClick={() => void revoke(r.id)}>Revoke</button> },
          ]} />
      </Card>

      <Card title="What each role can do">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Permission</th><th>Owner</th><th>Manager</th><th>Employee</th></tr></thead>
            <tbody>{PERMISSIONS.map((p) => (
              <tr key={p}><td>{PERMISSION_LABEL[p]}</td>
                {(['owner', 'manager', 'employee'] as MemberRole[]).map((r) => <td key={r}>{ROLE_DEFAULTS[r].includes(p) ? '✓' : GRANTABLE.includes(p) && r === 'employee' ? <span className="text-xs text-slate-500">if granted</span> : '—'}</td>)}
              </tr>))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Managers can manage employees but cannot change owners, managers or permissions.</p>
      </Card>

      {inviting && <InviteModal isOwner={isOwner} onClose={() => setInviting(false)} onDone={reloadAll} />}
      {editing && <MemberModal member={editing} isOwner={isOwner} self={editing.user_id === session?.user.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadAll() }} />}
    </div>
  )
}

function InviteModal({ isOwner, onClose, onDone }: { isOwner: boolean; onClose: () => void; onDone: () => void }) {
  const { current, reload } = useCurrentBusiness()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('employee')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const create = async () => {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.')
    setSaving(true)
    try {
      const inv = await createInvitation(current.business.id, email.trim(), role)
      setLink(`${window.location.origin}/invite#${inv.token}`)
      onDone(); void reload()
    } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
  }
  const copy = async () => { if (link) { await navigator.clipboard.writeText(link); setCopied(true) } }

  return (
    <Modal open onClose={onClose} title="Invite someone" size="sm"
      footer={link ? <Button onClick={onClose}>Done</Button> : <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void create()} loading={saving}>Create invitation</Button></>}>
      {link ? (
        <div className="space-y-3 text-sm">
          <Alert tone="success">Invitation created for {email.trim().toLowerCase()}.</Alert>
          <p>Send this link to them (e.g. by email or chat). It works once, only for that email address, and expires in 7 days. It won't be shown again.</p>
          <div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
            <Button variant="outline" icon={<Copy className="size-4" />} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Email address" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)} disabled={!isOwner}
            hint={isOwner ? 'You can grant extra permissions after they join.' : 'Managers can invite employees only.'}>
            <option value="employee">Employee</option>
            {isOwner && <option value="manager">Manager</option>}
          </Select>
        </div>
      )}
    </Modal>
  )
}

function MemberModal({ member, isOwner, self, onClose, onSaved }: { member: Member; isOwner: boolean; self: boolean; onClose: () => void; onSaved: () => void }) {
  const { reload } = useCurrentBusiness()
  const [role, setRole] = useState<MemberRole>(member.role)
  const [extra, setExtra] = useState<Permission[]>(member.extra_permissions)
  const [active, setActive] = useState(member.is_active)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canChangeRole = isOwner && !self
  const canToggle = !self && (isOwner || member.role === 'employee')

  const save = async () => {
    setError(null); setSaving(true)
    try {
      await updateMember(member.id, {
        role: canChangeRole && role !== member.role ? role : undefined,
        extraPermissions: isOwner && role === 'employee' ? extra : undefined,
        isActive: canToggle && active !== member.is_active ? active : undefined,
      })
      await reload()
      onSaved()
    } catch (e) { setError(errorMessage(e)); setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={member.profile?.full_name || member.profile?.email || 'Member'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} loading={saving} disabled={!canChangeRole && !canToggle && !isOwner}>Save</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {self && <p className="text-sm text-slate-600">You can't change your own role or deactivate yourself.</p>}
        <Select label="Role" value={role} disabled={!canChangeRole} onChange={(e) => setRole(e.target.value as MemberRole)}>
          <option value="employee">Employee</option><option value="manager">Manager</option><option value="owner">Owner</option>
        </Select>
        {role === 'employee' && (
          <fieldset disabled={!isOwner}>
            <legend className="label">Extra permissions {!isOwner && <span className="font-normal text-slate-500">(owner only)</span>}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {GRANTABLE.map((p) => (
                <Checkbox key={p} label={PERMISSION_LABEL[p]} checked={extra.includes(p)}
                  onChange={(e) => setExtra(e.target.checked ? [...extra, p] : extra.filter((x) => x !== p))} />
              ))}
            </div>
          </fieldset>
        )}
        <Checkbox label="Active (can sign in to this business)" checked={active} disabled={!canToggle} onChange={(e) => setActive(e.target.checked)} />
      </div>
    </Modal>
  )
}
