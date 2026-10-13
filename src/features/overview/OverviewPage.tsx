import { Card, PageHeader, Stat } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { CATEGORY_LABELS } from '@/features/business/types'
import { ROLE_LABELS } from '@/lib/permissions'

const dateFmt = (iso: string, tz: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: tz }).format(new Date(iso))

/**
 * Phase 1 overview: business and trial status from the database. Sales, orders and cash KPIs are added in
 * Phase 2 once those modules exist; until then nothing here is estimated or invented.
 */
export function OverviewPage() {
  const { current } = useCurrentBusiness()
  const { business: b, subscription: s } = current
  return (
    <>
      <PageHeader title="Overview" subtitle={`${b.name} · ${CATEGORY_LABELS[b.category]}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Trial days left" value={s.access_state === 'trialing' ? s.days_left : '—'} hint={`Ends ${dateFmt(s.trial_ends_at, b.timezone)}`}
          tone={s.access_state === 'expired' ? 'bad' : s.days_left <= 3 ? 'warn' : 'default'} />
        <Stat label="Orders & sales used" value={s.max_transactions != null ? `${s.transactions_used} / ${s.max_transactions}` : s.transactions_used} />
        <Stat label="Users" value={s.max_users != null ? `${s.users_used} / ${s.max_users}` : s.users_used} hint="Includes pending invitations" />
        <Stat label="Your role" value={current.role ? ROLE_LABELS[current.role] : 'Support'} />
      </div>
      <Card className="mt-5" title="Business dashboard">
        <p className="text-sm text-slate-600">
          Sales, collections, receivables, expenses, cash movement and order KPIs appear here once the Sales, Orders
          and Expenses modules are built (Phase 2). They will be calculated only from records you enter.
        </p>
      </Card>
    </>
  )
}
