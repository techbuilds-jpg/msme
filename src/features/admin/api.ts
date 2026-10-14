import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { AccessState, BusinessCategory } from '@/features/business/types'

export interface AdminOverview {
  businesses: number; active_trials: number; expired_trials: number; active_subscriptions: number; suspended: number
  new_7d: number; new_30d: number; upgrade_interest: number; demos_active: number; users: number
  consultations_new: number; errors_24h: number; errors_7d: number; retention_days: number
  by_category: Partial<Record<BusinessCategory, number>>
}
export interface AdminBusiness {
  id: string; name: string; category: BusinessCategory; size: string; created_at: string
  suspended_at: string | null; suspended_reason: string | null; owner_email: string | null
  plan: 'trial' | 'standard' | 'demo'; status: string; trial_started_at: string; trial_ends_at: string
  max_users: number | null; max_transactions: number | null; transactions_used: number; users_used: number
  upgrade_interest_at: string | null; access_state: AccessState; enabled_modules: string[]; past_retention: boolean
}
export interface Consultation {
  id: string; created_at: string; status: 'new' | 'contacted' | 'closed'; message: string | null; preferred_contact: string | null
  business_name: string | null; category: BusinessCategory | null; requested_by: string | null; requested_by_email: string | null
  business_contact_number: string | null
}

export const adminOverview = async () => unwrap(await supabase.rpc('admin_overview')) as AdminOverview
export const adminBusinesses = async () => unwrap(await supabase.rpc('admin_list_businesses')) as AdminBusiness[]
export const adminConsultations = async () => unwrap(await supabase.rpc('admin_list_consultations')) as Consultation[]

export async function extendTrial(id: string, days: number, reason: string) {
  unwrap(await supabase.rpc('admin_extend_trial', { p_business_id: id, p_days: days, p_reason: reason }))
}
export async function setSuspension(id: string, suspend: boolean, reason: string) {
  unwrap(await supabase.rpc('admin_set_suspension', { p_business_id: id, p_suspend: suspend, p_reason: reason }))
}
export async function setPlan(id: string, p: { plan: 'trial' | 'standard'; maxUsers: number | null; maxTransactions: number | null; modules: string[]; reason: string }) {
  unwrap(await supabase.rpc('admin_set_plan', {
    p_business_id: id, p_plan: p.plan, p_max_users: p.maxUsers, p_max_transactions: p.maxTransactions, p_enabled_modules: p.modules, p_reason: p.reason,
  }))
}
export async function updateConsultation(id: string, status: Consultation['status']) {
  unwrap(await supabase.rpc('admin_update_consultation', { p_id: id, p_status: status }))
}
export async function setPlatformSetting(key: string, value: unknown) {
  unwrap(await supabase.rpc('admin_set_setting', { p_key: key, p_value: value }))
}
export async function platformSettings() {
  return unwrap(await supabase.from('platform_settings').select('key, value, updated_at')) as { key: string; value: unknown; updated_at: string }[]
}
export async function appErrors() {
  return unwrap(await supabase.from('app_errors').select('id, message, url, context, created_at, user_id, business_id').order('id', { ascending: false }).limit(200)) as
    { id: number; message: string; url: string | null; context: Record<string, unknown>; created_at: string; user_id: string | null; business_id: string | null }[]
}
/** Platform-level and admin/support events only (RLS). */
export async function platformAudit() {
  return unwrap(await supabase.from('audit_logs').select('id, business_id, actor_id, action, entity_type, entity_id, details, created_at')
    .or('business_id.is.null,action.like.admin.*,action.like.support.*').order('id', { ascending: false }).limit(200)) as
    { id: number; business_id: string | null; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; details: Record<string, unknown>; created_at: string }[]
}
export async function supportOpen(businessId: string) {
  unwrap(await supabase.rpc('support_open', { p_business_id: businessId }))
}
