import { Download } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Spinner, errorMessage } from '@/components/ui'
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PRIORITY_LABEL, type OrderStatus, type PaymentMethod, type Priority } from '@/components/shared/StatusBadges'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatDateTime, presetRange } from '@/lib/dates'
import { unwrap } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import type { Permission } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'

type Row = Record<string, string | number | null>
type Col = { key: string; label: string; kind?: 'money' | 'date' | 'datetime' | 'number' | 'status' | 'method' | 'priority' | 'kind'; total?: boolean }

interface ReportDef { key: string; label: string; perm: Permission; description: string; columns: Col[] }

const REPORTS: ReportDef[] = [
  { key: 'sales_summary', label: 'Sales summary', perm: 'sales.view', description: 'Sales per day, excluding voided sales.',
    columns: [{ key: 'date', label: 'Date', kind: 'date' }, { key: 'sales', label: 'Sales', kind: 'number', total: true },
      { key: 'gross_centavos', label: 'Gross', kind: 'money', total: true }, { key: 'discount_centavos', label: 'Discounts', kind: 'money', total: true },
      { key: 'total_centavos', label: 'Net sales', kind: 'money', total: true }, { key: 'paid_centavos', label: 'Paid so far', kind: 'money', total: true },
      { key: 'balance_centavos', label: 'Balance', kind: 'money', total: true }] },
  { key: 'collections', label: 'Collection summary', perm: 'sales.view', description: 'Every payment and refund received in the period, by payment date.',
    columns: [{ key: 'paid_at', label: 'Received', kind: 'datetime' }, { key: 'kind', label: 'Type', kind: 'kind' }, { key: 'method', label: 'Method', kind: 'method' },
      { key: 'sale_number', label: 'Sale' }, { key: 'customer', label: 'Customer' }, { key: 'reference_no', label: 'Reference' },
      { key: 'amount_centavos', label: 'Amount', kind: 'money' }] },
  { key: 'receivables', label: 'Outstanding receivables', perm: 'sales.view', description: 'Unpaid balances on sales dated up to the end date. Age is counted to the end date.',
    columns: [{ key: 'sale_number', label: 'Sale' }, { key: 'sale_date', label: 'Date', kind: 'date' }, { key: 'customer', label: 'Customer' },
      { key: 'contact_number', label: 'Contact' }, { key: 'total_centavos', label: 'Total', kind: 'money', total: true },
      { key: 'paid_centavos', label: 'Paid', kind: 'money', total: true }, { key: 'balance_centavos', label: 'Balance', kind: 'money', total: true },
      { key: 'age_days', label: 'Age (days)', kind: 'number' }] },
  { key: 'expenses', label: 'Expense breakdown', perm: 'expenses.view', description: 'Every expense in the period, excluding voided ones.',
    columns: [{ key: 'date', label: 'Date', kind: 'date' }, { key: 'category', label: 'Category' }, { key: 'vendor', label: 'Vendor' },
      { key: 'description', label: 'Description' }, { key: 'method', label: 'Method', kind: 'method' }, { key: 'amount_centavos', label: 'Amount', kind: 'money', total: true }] },
  { key: 'orders_by_status', label: 'Orders by status', perm: 'orders.view', description: 'Orders dated in the period with their current status.',
    columns: [{ key: 'order_number', label: 'Order' }, { key: 'order_date', label: 'Date', kind: 'date' }, { key: 'status', label: 'Status', kind: 'status' },
      { key: 'priority', label: 'Priority', kind: 'priority' }, { key: 'customer', label: 'Customer' }, { key: 'assigned_to', label: 'Assigned to' },
      { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'total_centavos', label: 'Amount', kind: 'money', total: true }] },
  { key: 'employee_assignments', label: 'Employee order assignments', perm: 'orders.view', description: 'Orders dated in the period, per assigned employee. Overdue = open and past due today.',
    columns: [{ key: 'employee', label: 'Employee' }, { key: 'assigned', label: 'Assigned', kind: 'number', total: true }, { key: 'open', label: 'Open', kind: 'number', total: true },
      { key: 'completed', label: 'Completed', kind: 'number', total: true }, { key: 'cancelled', label: 'Cancelled', kind: 'number', total: true },
      { key: 'overdue', label: 'Overdue', kind: 'number', total: true }] },
  { key: 'customer_history', label: 'Customer transaction history', perm: 'sales.view', description: 'Sales per customer in the period (walk-in sales excluded).',
    columns: [{ key: 'customer', label: 'Customer' }, { key: 'contact_number', label: 'Contact' }, { key: 'sales', label: 'Sales', kind: 'number', total: true },
      { key: 'total_centavos', label: 'Total', kind: 'money', total: true }, { key: 'paid_centavos', label: 'Paid', kind: 'money', total: true },
      { key: 'balance_centavos', label: 'Balance', kind: 'money', total: true }, { key: 'last_sale', label: 'Last sale', kind: 'date' }] },
]

export function ReportsPage() {
  const { current, can } = useCurrentBusiness()
  const b = current.business
  const available = REPORTS.filter((r) => can(r.perm) || current.support_access)
  const month = presetRange('month', b.timezone)
  const [reportKey, setReportKey] = useState(available[0]?.key ?? '')
  const [from, setFrom] = useState(month.from)
  const [to, setTo] = useState(month.to)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const def = available.find((r) => r.key === reportKey)
  const valid = !!from && !!to && from <= to

  const { data, loading, error, reload } = useAsync(async () => {
    if (!def || !valid) return null
    return unwrap(await supabase.rpc('report_data', { p_business_id: b.id, p_report: def.key, p_from: from, p_to: to })) as { rows: Row[]; truncated: boolean }
  }, [b.id, def?.key, from, to])

  if (!available.length) return <><PageHeader title="Reports" /><Alert tone="info">You don't have access to any reports. Ask the owner if you need them.</Alert></>

  const cell = (c: Col, v: Row[string]): string => {
    if (v == null || v === '') return '—'
    switch (c.kind) {
      case 'money': return formatMoney(Number(v), b.currency)
      case 'date': return formatDate(String(v))
      case 'datetime': return formatDateTime(String(v), b.timezone)
      case 'status': return ORDER_STATUS_LABEL[v as OrderStatus] ?? String(v)
      case 'method': return PAYMENT_METHOD_LABEL[v as PaymentMethod] ?? String(v)
      case 'priority': return PRIORITY_LABEL[v as Priority] ?? String(v)
      case 'kind': return v === 'refund' ? 'Refund' : 'Payment'
      default: return String(v)
    }
  }
  // Collections: refunds count negative in the total.
  const signed = (c: Col, r: Row) => (def?.key === 'collections' && c.key === 'amount_centavos' && r.kind === 'refund' ? -Number(r[c.key]) : Number(r[c.key] ?? 0))
  const totals = def && data ? Object.fromEntries(def.columns.filter((c) => c.total || (def.key === 'collections' && c.key === 'amount_centavos'))
    .map((c) => [c.key, data.rows.reduce((s, r) => s + signed(c, r), 0)])) : {}

  const exportCsv = async () => {
    if (!def || !data) return
    setExportError(null); setExporting(true)
    try {
      // Logged (and permission-checked) before the file is built.
      unwrap(await supabase.rpc('log_export', { p_business_id: b.id, p_report: def.key, p_from: from, p_to: to, p_row_count: data.rows.length }))
      const rows = data.rows.map((r) => Object.fromEntries(def.columns.map((c) => {
        const v = r[c.key]
        if (c.kind === 'money') return [`${c.label} (${b.currency})`, v == null ? '' : signed(c, r) / 100]
        if (c.kind === 'number') return [c.label, v == null ? '' : Number(v)]
        return [c.label, c.kind === 'date' || c.kind === 'datetime' ? (v ?? '') : cell(c, v) === '—' ? '' : cell(c, v)]
      })))
      downloadCsv(`${def.key}_${from}_${to}.csv`, rows)
    } catch (e) { setExportError(errorMessage(e)) } finally { setExporting(false) }
  }

  return (
    <>
      <PageHeader title="Reports" actions={can('reports.export') && def && data?.rows.length ? (
        <Button variant="outline" icon={<Download className="size-4" />} onClick={() => void exportCsv()} loading={exporting}>Export CSV</Button>
      ) : null} />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Report" wrapperClassName="w-72" value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
            {available.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
          <Input label="From" type="date" wrapperClassName="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" wrapperClassName="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        {def && <p className="mt-3 text-sm text-slate-600">{def.description}</p>}
        {!valid && <p className="mt-2 text-sm text-red-700">Choose a valid date range (up to one year).</p>}
      </Card>
      {exportError && <Alert tone="error" className="mb-4" onClose={() => setExportError(null)}>{exportError}</Alert>}
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : def && data && (
        <Card padded={false}>
          {data.truncated && <p className="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Only the first 5,000 rows are shown. Use a shorter date range.</p>}
          {!data.rows.length ? <EmptyState title="Nothing to report for this period" /> : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr>{def.columns.map((c) => <th key={c.key} className={c.kind === 'money' || c.kind === 'number' ? 'text-right' : undefined}>{c.label}</th>)}</tr></thead>
                <tbody>{data.rows.map((r, i) => (
                  <tr key={i}>{def.columns.map((c) => (
                    <td key={c.key} className={c.kind === 'money' || c.kind === 'number' ? 'text-right tabular-nums' : undefined}>
                      {def.key === 'collections' && c.key === 'amount_centavos' && r.kind === 'refund' ? `−${cell(c, r[c.key])}` : cell(c, r[c.key])}
                    </td>))}
                  </tr>))}
                </tbody>
                {Object.keys(totals).length > 0 && (
                  <tfoot><tr>{def.columns.map((c, i) => (
                    <td key={c.key} className={c.kind === 'money' || c.kind === 'number' ? 'text-right font-semibold tabular-nums' : 'font-semibold'}>
                      {c.key in totals ? (c.kind === 'money' ? formatMoney(totals[c.key], b.currency) : totals[c.key]) : i === 0 ? `Total (${data.rows.length} rows)` : ''}
                    </td>))}
                  </tr></tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  )
}
