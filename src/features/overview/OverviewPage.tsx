import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, DataTable, EmptyState, ErrorState, Input, PageHeader, Spinner, Stat } from '@/components/ui'
import { ORDER_STATUSES, ORDER_STATUS_LABEL, PaymentStatusBadge, type OrderStatus, type PaymentStatus } from '@/components/shared/StatusBadges'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { CATEGORY_LABELS } from '@/features/business/types'
import { formatDate, presetRange, type RangeKey } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'

/** Validated categorical slots (dataviz reference palette, light surface). */
const SERIES = { sales: '#2a78d6', collected: '#eb6834' }

interface Summary {
  total_sales?: number
  sales_count?: number
  collected?: number
  refunds?: number
  receivables?: number
  expenses?: number
  net_cash?: number
  open_orders?: number
  completed_orders?: number
  active_customers?: number
  orders_by_status?: Partial<Record<OrderStatus, number>>
  trend?: { date: string; sales: number; collected: number }[]
  recent_sales?: { id: string; sale_number: string; sale_date: string; total_centavos: number; paid_centavos: number; payment_status: PaymentStatus; customer_name: string | null }[]
}

const KPI: Record<string, { label: string; money: boolean; hint?: string; key: keyof Summary }> = {
  total_sales: { label: 'Total sales', money: true, key: 'total_sales' },
  collected: { label: 'Collected payments', money: true, key: 'collected', hint: 'Payments received minus refunds' },
  receivables: { label: 'Outstanding receivables', money: true, key: 'receivables', hint: 'All unpaid balances, any date' },
  expenses: { label: 'Recorded expenses', money: true, key: 'expenses' },
  net_cash: { label: 'Net cash movement', money: true, key: 'net_cash', hint: 'Collected − expenses. Not accounting profit.' },
  open_orders: { label: 'Open orders', money: false, key: 'open_orders', hint: 'Not completed or cancelled' },
  completed_orders: { label: 'Completed orders', money: false, key: 'completed_orders', hint: 'Completed in this period' },
  active_customers: { label: 'Active customers', money: false, key: 'active_customers' },
}

export function OverviewPage() {
  const { current } = useCurrentBusiness()
  const b = current.business
  const navigate = useNavigate()
  const [rangeKey, setRangeKey] = useState<RangeKey>('month')
  const [custom, setCustom] = useState(() => presetRange('month', b.timezone))
  const range = rangeKey === 'custom' ? custom : presetRange(rangeKey, b.timezone)
  const validRange = !!range.from && !!range.to && range.from <= range.to

  const { data, loading, error, reload } = useAsync(async () => {
    if (!validRange) return null
    return unwrap(await supabase.rpc('dashboard_summary', { p_business_id: b.id, p_from: range.from, p_to: range.to })) as Summary
  }, [b.id, range.from, range.to])

  // Figures stay current: refetch when the user comes back to the tab (after recording elsewhere).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [reload])

  const m = (c: number | undefined) => formatMoney(c ?? 0, b.currency)
  const kpis = current.settings.dashboard_kpis.filter((k) => KPI[k] && data && data[KPI[k].key] !== undefined)
  const hasAnyData = !!data && ((data.sales_count ?? 0) > 0 || (data.open_orders ?? 0) > 0 || (data.expenses ?? 0) > 0 || (data.active_customers ?? 0) > 0 || (data.receivables ?? 0) > 0)

  return (
    <>
      <PageHeader title="Overview" subtitle={`${b.name} · ${CATEGORY_LABELS[b.category]}`} />

      <div className="mb-5 flex flex-wrap items-end gap-3" role="group" aria-label="Date range">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(['today', 'week', 'month', 'custom'] as RangeKey[]).map((k) => (
            <button key={k} type="button" aria-pressed={rangeKey === k} onClick={() => setRangeKey(k)}
              className={`rounded px-3 py-1.5 text-sm ${rangeKey === k ? 'bg-navy-900 text-white' : 'text-ink hover:bg-surface'}`}>
              {{ today: 'Today', week: 'This week', month: 'This month', custom: 'Custom' }[k]}
            </button>
          ))}
        </div>
        {rangeKey === 'custom' && <>
          <Input label="From" type="date" wrapperClassName="w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <Input label="To" type="date" wrapperClassName="w-40" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </>}
        <p className="pb-2 text-sm text-slate-600">{validRange ? `${formatDate(range.from)} – ${formatDate(range.to)}` : 'Choose a valid range (up to one year).'}</p>
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? (loading ? <Spinner /> : null) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => {
              const v = data[KPI[k].key] as number
              return <Stat key={k} label={KPI[k].label} hint={KPI[k].hint} value={KPI[k].money ? m(v) : v}
                tone={k === 'net_cash' && v < 0 ? 'bad' : k === 'receivables' && v > 0 ? 'warn' : 'default'} />
            })}
          </div>

          {!hasAnyData && (
            <Card className="mt-5">
              <EmptyState title="No business data yet" description="Add customers, orders, sales and expenses. Every figure here is calculated from the records you enter." />
            </Card>
          )}

          {hasAnyData && (
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              {data.trend && (
                <Card title="Sales and collections" className="lg:col-span-2">
                  {data.trend.length < 2 ? <p className="text-sm text-slate-600">Choose a range longer than one day to see the trend.</p> : (
                    <TrendChart data={data.trend} currency={b.currency} />
                  )}
                </Card>
              )}
              {data.orders_by_status && <Card title="Orders by status"><OrdersChart counts={data.orders_by_status} /></Card>}
            </div>
          )}

          {data.recent_sales && data.recent_sales.length > 0 && (
            <Card title="Recent transactions" className="mt-5" padded={false}>
              <DataTable rows={data.recent_sales} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/sales/${r.id}`)}
                columns={[
                  { header: 'Sale', cell: (r) => <span className="font-medium">{r.sale_number}</span> },
                  { header: 'Date', cell: (r) => formatDate(r.sale_date) },
                  { header: 'Customer', cell: (r) => r.customer_name ?? <span className="text-slate-400">Walk-in</span> },
                  { header: 'Total', className: 'text-right', cell: (r) => <span className="tabular-nums">{m(r.total_centavos)}</span> },
                  { header: 'Balance', className: 'text-right', cell: (r) => <span className="tabular-nums">{m(r.total_centavos - r.paid_centavos)}</span> },
                  { header: 'Status', cell: (r) => <PaymentStatusBadge status={r.payment_status} /> },
                ]} />
            </Card>
          )}
        </>
      )}
    </>
  )
}

const shortDate = (iso: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const compact = (centavos: number, currency: string) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(centavos / 100)

function TrendChart({ data, currency }: { data: NonNullable<Summary['trend']>; currency: string }) {
  return (
    <>
      <ul className="mb-2 flex gap-4 text-xs text-slate-600" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: SERIES.sales }} aria-hidden /> Sales (by sale date)</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: SERIES.collected }} aria-hidden /> Collected (by payment date)</li>
      </ul>
      <div className="h-64" role="img" aria-label="Line chart of daily sales and collections. A table version follows.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => compact(v, currency)} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
              formatter={(v, name) => [formatMoney(Number(v), currency), name === 'sales' ? 'Sales' : 'Collected']}
              labelFormatter={(l) => formatDate(String(l))}
              contentStyle={{ borderRadius: 6, borderColor: '#e2e8f0', fontSize: 13, color: '#172033' }} />
            <Line type="monotone" dataKey="sales" stroke={SERIES.sales} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="collected" stroke={SERIES.collected} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-navy-500">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th className="text-right">Sales</th><th className="text-right">Collected</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.date}><td>{formatDate(d.date)}</td><td className="text-right tabular-nums">{formatMoney(d.sales, currency)}</td><td className="text-right tabular-nums">{formatMoney(d.collected, currency)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  )
}

function OrdersChart({ counts }: { counts: Partial<Record<OrderStatus, number>> }) {
  const rows = ORDER_STATUSES.map((s) => ({ status: ORDER_STATUS_LABEL[s], count: counts[s] ?? 0 }))
  if (rows.every((r) => r.count === 0)) return <p className="text-sm text-slate-600">No orders dated in this period.</p>
  return (
    <>
      <div className="h-64" role="img" aria-label={`Orders by status: ${rows.map((r) => `${r.status} ${r.count}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="status" width={88} tick={{ fontSize: 12, fill: '#334155' }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: '#eaf1f8' }} formatter={(v) => [String(v), 'Orders']} contentStyle={{ borderRadius: 6, borderColor: '#e2e8f0', fontSize: 13 }} />
            <Bar dataKey="count" fill={SERIES.sales} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500">Orders with an order date in the selected period.</p>
    </>
  )
}
