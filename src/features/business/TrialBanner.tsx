import { useCurrentBusiness } from './BusinessProvider'

/** Shows remaining trial days, expiry warnings and the read-only state. Data comes from business_context(). */
export function TrialBanner() {
  const { current } = useCurrentBusiness()
  const s = current.subscription
  const d = s.days_left

  if (current.support_access) {
    return <Bar tone="info">You are viewing this business with temporary, read-only support access. All access is logged.</Bar>
  }
  if (s.access_state === 'suspended') {
    return <Bar tone="error">This business account is suspended. Records are read-only. Please contact the platform team.</Bar>
  }
  if (s.access_state === 'expired') {
    return (
      <Bar tone="error">
        Your free trial has ended. Your records are safe and read-only: you can still view and export them.
        Contact us to continue with an implementation or subscription.
      </Bar>
    )
  }
  if (s.plan === 'demo') {
    return <Bar tone="info">Demo business with fictional data. It is deleted automatically after 48 hours.</Bar>
  }
  if (s.access_state !== 'trialing') return null

  const usage = s.max_transactions != null ? ` · ${s.transactions_used}/${s.max_transactions} orders & sales used` : ''
  const users = s.max_users != null ? ` · ${s.users_used}/${s.max_users} users` : ''
  return (
    <Bar tone={d <= 3 ? 'warn' : 'plain'}>
      Free trial: <strong>{d} {d === 1 ? 'day' : 'days'} left</strong>
      {d <= 3 && ' — your records become read-only when the trial ends'}
      <span className="text-slate-600">{usage}{users}</span>
    </Bar>
  )
}

function Bar({ tone, children }: { tone: 'plain' | 'info' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = {
    plain: 'bg-navy-100 text-navy-900',
    info: 'bg-navy-100 text-navy-900',
    warn: 'bg-amber-50 text-amber-900 border-b border-amber-200',
    error: 'bg-red-50 text-red-900 border-b border-red-200',
  }[tone]
  return <div role={tone === 'error' || tone === 'warn' ? 'alert' : 'status'} className={`px-4 py-2 text-sm sm:px-6 lg:px-8 ${cls}`}>{children}</div>
}
