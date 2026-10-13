import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { BusinessCategory, BusinessContext, BusinessSummary } from './types'
import type { MemberRole } from '@/lib/permissions'

export async function listMyBusinesses(): Promise<BusinessSummary[]> {
  return unwrap(await supabase.rpc('my_businesses')) as BusinessSummary[]
}

export async function getBusinessContext(businessId: string): Promise<BusinessContext> {
  return unwrap(await supabase.rpc('business_context', { p_business_id: businessId })) as BusinessContext
}

export interface NewBusiness {
  name: string
  category: BusinessCategory
  contact_email: string
  size: 'micro' | 'small' | 'medium'
  employee_count: number
  address?: string
  contact_number?: string
  currency: string
  timezone: string
}

export async function createBusiness(b: NewBusiness): Promise<string> {
  return unwrap(await supabase.rpc('create_business', {
    p_name: b.name,
    p_category: b.category,
    p_contact_email: b.contact_email,
    p_size: b.size,
    p_employee_count: b.employee_count,
    p_address: b.address || null,
    p_contact_number: b.contact_number || null,
    p_currency: b.currency,
    p_timezone: b.timezone,
  })) as string
}

export interface InvitationPreview {
  business_name: string
  email: string
  role: MemberRole
  expires_at: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  return unwrap(await supabase.rpc('preview_invitation', { p_token: token })) as InvitationPreview
}

export async function acceptInvitation(token: string): Promise<string> {
  return unwrap(await supabase.rpc('accept_invitation', { p_token: token })) as string
}
