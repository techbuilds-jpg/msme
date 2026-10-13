/** Mirrors private.all_permissions() in the database. The database is authoritative; this only drives the UI. */
export const PERMISSIONS = [
  'customers.view', 'customers.manage',
  'orders.view', 'orders.manage',
  'sales.view', 'sales.manage', 'sales.discount', 'payments.manage',
  'expenses.view', 'expenses.manage',
  'reports.view', 'reports.export',
  'team.manage', 'settings.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export type MemberRole = 'owner' | 'manager' | 'employee'
export const ROLE_LABELS: Record<MemberRole, string> = { owner: 'Owner', manager: 'Manager', employee: 'Employee' }
