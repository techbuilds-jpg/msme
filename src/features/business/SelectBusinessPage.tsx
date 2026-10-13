import { ChevronRight } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Badge, ErrorState, Spinner } from '@/components/ui'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { useAuth } from '@/features/auth/AuthProvider'
import { ROLE_LABELS } from '@/lib/permissions'
import { useBusiness } from './BusinessProvider'
import { CATEGORY_LABELS, type AccessState } from './types'

const STATE_BADGE: Record<AccessState, { tone: string; label: string }> = {
  trialing: { tone: 'navy', label: 'Trial' },
  active: { tone: 'green', label: 'Active' },
  expired: { tone: 'amber', label: 'Trial ended' },
  suspended: { tone: 'red', label: 'Suspended' },
}

export function SelectBusinessPage() {
  const { businesses, loading, error, reload, select } = useBusiness()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  if (error) return <div className="mx-auto max-w-lg p-6"><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !businesses) return <Spinner className="min-h-dvh" />
  if (businesses && businesses.length === 0) return <Navigate to="/onboarding" replace />

  return (
    <AuthLayout title="Choose a business" subtitle={profile?.email ?? undefined}
      footer={<button type="button" className="text-navy-500 underline" onClick={() => void signOut()}>Sign out</button>}>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {businesses?.map((b) => (
          <li key={b.business_id}>
            <button type="button" onClick={() => { select(b.business_id); navigate('/') }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="block text-xs text-slate-600">{CATEGORY_LABELS[b.category]} · {ROLE_LABELS[b.role]}</span>
              </span>
              {b.is_demo && <Badge tone="violet">Demo</Badge>}
              <Badge tone={STATE_BADGE[b.access_state].tone}>{STATE_BADGE[b.access_state].label}</Badge>
              <ChevronRight className="size-4 text-slate-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </AuthLayout>
  )
}
