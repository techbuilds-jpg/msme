import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { MemberRole } from '@/lib/permissions'

export type EmploymentStatus = 'active' | 'on_leave' | 'resigned' | 'terminated'
export const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = { active: 'Active', on_leave: 'On leave', resigned: 'Resigned', terminated: 'Terminated' }

export interface Employee {
  id: string
  member_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  job_title: string | null
  department: string | null
  employment_status: EmploymentStatus
  hired_on: string | null
  notes: string | null
  created_at: string
  member: { role: MemberRole; is_active: boolean; user_id: string } | null
}

const COLS = 'id, member_id, full_name, email, phone, job_title, department, employment_status, hired_on, notes, created_at, member:business_members(role, is_active, user_id)'

export async function listEmployees(businessId: string) {
  return unwrap(await supabase.from('employees').select(COLS).eq('business_id', businessId).order('full_name')) as unknown as Employee[]
}
export async function getEmployee(id: string) {
  return unwrap(await supabase.from('employees').select(COLS).eq('id', id).maybeSingle()) as unknown as Employee | null
}

export type EmployeeInput = Pick<Employee, 'full_name' | 'email' | 'phone' | 'job_title' | 'department' | 'employment_status' | 'hired_on' | 'notes'>

export async function createEmployee(businessId: string, id: string, input: EmployeeInput) {
  return unwrap(await supabase.from('employees').insert({ id, business_id: businessId, ...input }).select('id').single()) as { id: string }
}
export async function updateEmployee(id: string, input: EmployeeInput) {
  unwrap(await supabase.from('employees').update(input).eq('id', id).select('id').single())
}

/** Order activity performed by a signed-in member (status changes, notes, edits). */
export async function memberActivity(businessId: string, userId: string) {
  return unwrap(await supabase.from('order_activity')
    .select('id, kind, from_status, to_status, message, created_at, order_id, order:orders(order_number)')
    .eq('business_id', businessId).eq('actor_id', userId).order('created_at', { ascending: false }).limit(50)) as unknown as
    { id: number; kind: string; from_status: string | null; to_status: string | null; message: string | null; created_at: string; order_id: string; order: { order_number: string } | null }[]
}
