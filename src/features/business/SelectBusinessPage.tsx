import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supportOpen } from '@/features/admin/api'
import { Alert, Badge, ErrorState, Spinner, errorMessage } from '@/components/ui'
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
  const { profile, signOut, isPlatformAdmin } = useAuth()
  const navigate = useNavigate()
  const [openError, setOpenError] = useState<string | null>(null)
  const open = async (id: string, support: boolean) => {
    setOpenError(null)
    try {
      if (support) await supportOpen(id) // every support session is recorded in the owner's audit log
      select(id)
      navigate('/')
    } catch (e) { setOpenError(errorMessage(e)) }
  }

  if (error) return <div className="mx-auto max-w-lg p-6"><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !businesses) return <Spinner className="min-h-dvh" />
  if (businesses && businesses.length === 0) return <Navigate to="/onboarding" replace />

  return (
    <AuthLayout title="Choose a business" subtitle={profile?.email ?? undefined}
      footer={<span className="flex gap-4">{isPlatformAdmin && <Link className="text-navy-500 underline" to="/admin">Platform admin</Link>}<button type="button" className="text-navy-500 underline" onClick={() => void signOut()}>Sign out</button></span>}>
      {openError && <Alert tone="error" className="mb-3">{openError}</Alert>}
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {businesses?.map((b) => (
          <li key={b.business_id}>
            <button type="button" onClick={() => void open(b.business_id, b.support_access)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="block text-xs text-slate-600">{CATEGORY_LABELS[b.category]} · {b.role ? ROLE_LABELS[b.role] : 'Support access (read-only)'}</span>
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
