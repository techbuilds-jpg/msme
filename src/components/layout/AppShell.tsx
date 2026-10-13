import { clsx } from 'clsx'
import {
  BarChart3, Briefcase, ClipboardList, LayoutDashboard, LogOut, Menu, Receipt, Settings, Shield, ShoppingCart,
  UserCircle, Users, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT_NAME } from '@/app/config'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { TrialBanner } from '@/features/business/TrialBanner'
import type { Permission } from '@/lib/permissions'
import { ROLE_LABELS } from '@/lib/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** module key in business_settings.enabled_modules; null = always shown */
  module: string | null
  /** shown only if the member has this permission */
  perm?: Permission
}

/** Primary navigation. Add future business-specific modules here. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, module: null },
  { to: '/sales', label: 'Sales & Collections', icon: ShoppingCart, module: 'sales', perm: 'sales.view' },
  { to: '/orders', label: 'Orders & Operations', icon: ClipboardList, module: 'orders', perm: 'orders.view' },
  { to: '/customers', label: 'Customers', icon: Users, module: 'customers', perm: 'customers.view' },
  { to: '/expenses', label: 'Expenses', icon: Receipt, module: 'expenses', perm: 'expenses.view' },
  { to: '/employees', label: 'Employees', icon: Briefcase, module: 'employees' },
  { to: '/reports', label: 'Reports', icon: BarChart3, module: 'reports', perm: 'reports.view' },
  { to: '/settings', label: 'Settings', icon: Settings, module: null },
]

export function AppShell() {
  const { profile, isPlatformAdmin, signOut } = useAuth()
  const { current, businesses, can } = useCurrentBusiness()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])

  const modules = new Set(current.settings.enabled_modules)
  const items = NAV.filter((n) => (n.module === null || modules.has(n.module)) && (!n.perm || can(n.perm)))

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col bg-navy-900 text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-xs uppercase tracking-wider text-white/60">{PRODUCT_NAME}</p>
        <p className="mt-1 truncate font-semibold" title={current.business.name}>{current.business.name}</p>
        <p className="text-xs text-white/60">
          {current.role ? ROLE_LABELS[current.role] : 'Support access (read-only)'}
          {current.business.is_demo && ' · Demo'}
        </p>
        {(businesses?.length ?? 0) > 1 && (
          <Link to="/businesses" className="mt-2 inline-block text-xs text-navy-100 underline">Switch business</Link>
        )}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.to === '/'}
              className={({ isActive }) => clsx('flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                isActive ? 'bg-navy-100 font-medium text-navy-900' : 'text-white/85 hover:bg-white/10')}>
              <n.icon className="size-4 shrink-0" aria-hidden />
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="space-y-0.5 border-t border-white/10 p-2 text-sm">
        {isPlatformAdmin && (
          <Link to="/admin" className="flex items-center gap-3 rounded-md px-3 py-2 text-white/85 hover:bg-white/10">
            <Shield className="size-4" aria-hidden /> Platform admin
          </Link>
        )}
        <Link to="/profile" className="flex items-center gap-3 rounded-md px-3 py-2 text-white/85 hover:bg-white/10">
          <UserCircle className="size-4" aria-hidden />
          <span className="truncate">{profile?.full_name || profile?.email || 'Profile'}</span>
        </Link>
        <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-white/85 hover:bg-white/10">
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>

      {/* desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh">{sidebar}</aside>

      {/* mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-navy-900 px-4 py-3 text-white lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="rounded p-1 hover:bg-white/10">
          <Menu className="size-5" />
        </button>
        <span className="truncate font-semibold">{current.business.name}</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-2 top-3 z-10 rounded p-1 text-white hover:bg-white/10">
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="min-w-0">
        <TrialBanner />
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
