import type { MemberRole, Permission } from '@/lib/permissions'

export type BusinessCategory = 'service' | 'retail' | 'agency' | 'general'
export type AccessState = 'trialing' | 'active' | 'expired' | 'suspended'

export interface BusinessSummary {
  business_id: string
  name: string
  category: BusinessCategory
  role: MemberRole
  is_demo: boolean
  access_state: AccessState
  trial_ends_at: string
}

export interface Business {
  id: string
  name: string
  category: BusinessCategory
  address: string | null
  contact_email: string
  contact_number: string | null
  size: 'micro' | 'small' | 'medium'
  employee_count: number
  currency: string
  timezone: string
  is_demo: boolean
  created_at: string
}

export interface BusinessContext {
  business: Business
  role: MemberRole | null
  permissions: Permission[]
  support_access: boolean
  settings: {
    enabled_modules: string[]
    dashboard_kpis: string[]
    order_prefix: string
    sale_prefix: string
    max_discount_pct: number
  }
  subscription: {
    plan: 'trial' | 'standard' | 'demo'
    status: string
    access_state: AccessState
    trial_started_at: string
    trial_ends_at: string
    days_left: number
    max_users: number | null
    users_used: number
    max_transactions: number | null
    transactions_used: number
    upgrade_interest_at: string | null
  }
}

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  service: 'Service Business',
  retail: 'Retail / Trading',
  agency: 'Agency / Professional Services',
  general: 'General MSME',
}
