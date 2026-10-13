import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { MemberRole, Permission } from '@/lib/permissions'

export interface Member {
  id: string
  user_id: string
  role: MemberRole
  extra_permissions: Permission[]
  is_active: boolean
  created_at: string
  profile: { full_name: string; email: string | null } | null
}
export interface Invitation {
  id: string
  email: string
  role: MemberRole
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

export async function listMembers(businessId: string) {
  return unwrap(await supabase.from('business_members')
    .select('id, user_id, role, extra_permissions, is_active, created_at, profile:profiles!business_members_user_id_fkey(full_name, email)')
    .eq('business_id', businessId).order('created_at')) as unknown as Member[]
}

export async function listPendingInvitations(businessId: string) {
  return unwrap(await supabase.from('business_invitations').select('id, email, role, expires_at, accepted_at, revoked_at, created_at')
    .eq('business_id', businessId).is('accepted_at', null).is('revoked_at', null).order('created_at', { ascending: false })) as Invitation[]
}

export async function createInvitation(businessId: string, email: string, role: MemberRole) {
  return unwrap(await supabase.rpc('create_invitation', { p_business_id: businessId, p_email: email, p_role: role })) as
    { id: string; token: string; email: string; role: MemberRole; expires_at: string }
}
export async function revokeInvitation(id: string) {
  unwrap(await supabase.rpc('revoke_invitation', { p_invitation_id: id }))
}
export async function updateMember(memberId: string, patch: { role?: MemberRole; extraPermissions?: Permission[]; isActive?: boolean }) {
  unwrap(await supabase.rpc('update_member', {
    p_member_id: memberId, p_role: patch.role ?? null, p_extra_permissions: patch.extraPermissions ?? null, p_is_active: patch.isActive ?? null,
  }))
}

export async function updateBusinessProfile(id: string, fields: Record<string, unknown>) {
  unwrap(await supabase.from('businesses').update(fields).eq('id', id).select('id').single())
}
export async function updateBusinessSettings(businessId: string, fields: Record<string, unknown>) {
  unwrap(await supabase.from('business_settings').update(fields).eq('business_id', businessId).select('business_id').single())
}
export async function updateCategory(id: string, fields: { name?: string; is_active?: boolean }) {
  unwrap(await supabase.from('expense_categories').update(fields).eq('id', id).select('id').single())
}

export interface AuditEntry {
  id: number
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}
export async function listAudit(businessId: string, opts: { before?: number; action?: string }) {
  let q = supabase.from('audit_logs').select('id, actor_id, action, entity_type, entity_id, details, created_at')
    .eq('business_id', businessId).order('id', { ascending: false }).limit(100)
  if (opts.before) q = q.lt('id', opts.before)
  if (opts.action) q = q.like('action', `${opts.action.replace(/[%_]/g, '')}%`)
  return unwrap(await q) as AuditEntry[]
}
