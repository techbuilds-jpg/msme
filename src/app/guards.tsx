import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ErrorState, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBusiness } from '@/features/business/BusinessProvider'
import { getPendingInvite } from '@/lib/pendingInvite'

/** Signed-in users only. The database enforces access regardless; this only routes. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner className="min-h-dvh" />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return <Outlet />
}

/** Requires a selected business; sends new users to onboarding and multi-business users to the picker. */
export function RequireBusiness() {
  const { businesses, current, loading, error, reload } = useBusiness()
  if (error) return <div className="mx-auto max-w-lg p-6"><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !current) return <Spinner className="min-h-dvh" />
  // Someone who was invited must accept the invitation, not start their own business.
  if (businesses && businesses.length === 0) return <Navigate to={getPendingInvite() ? '/invite' : '/onboarding'} replace />
  if (!current) return <Navigate to="/businesses" replace />
  return <Outlet />
}

export function RequirePlatformAdmin() {
  const { isPlatformAdmin, loading } = useAuth()
  if (loading) return <Spinner className="min-h-dvh" />
  if (!isPlatformAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
