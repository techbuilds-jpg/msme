import { Download } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Card, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { downloadCsv } from '@/lib/csv'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/** Full-table exports. Each runs under the user's RLS, so a table they can't read comes back empty. */
const TABLES: { key: string; label: string; select: string; order: string }[] = [
  { key: 'customers', label: 'Customers', select: 'id, name, contact_number, email, address, notes, status, created_at', order: 'created_at' },
  { key: 'employees', label: 'Employees', select: 'id, full_name, job_title, department, phone, email, employment_status, hired_on, created_at', order: 'created_at' },
  { key: 'orders', label: 'Orders', select: 'id, order_number, order_date, customer_id, description, status, priority, assigned_employee_id, due_date, total_centavos, notes, created_at', order: 'created_at' },
  { key: 'order_items', label: 'Order items', select: 'order_id, item_type, description, quantity, unit_price_centavos, line_total_centavos', order: 'created_at' },
  { key: 'sales', label: 'Sales', select: 'id, sale_number, sale_date, customer_id, order_id, subtotal_centavos, discount_centavos, total_centavos, paid_centavos, payment_status, status, void_reason, created_at', order: 'created_at' },
  { key: 'sale_items', label: 'Sale items', select: 'sale_id, item_type, description, quantity, unit_price_centavos, line_total_centavos', order: 'created_at' },
  { key: 'payments', label: 'Payments & refunds', select: 'id, sale_id, kind, amount_centavos, method, reference_no, paid_at, status, void_reason', order: 'paid_at' },
  { key: 'expenses', label: 'Expenses', select: 'id, expense_date, category_id, amount_centavos, payment_method, vendor, description, status, void_reason, created_at', order: 'expense_date' },
]
const PAGE = 1000

export function DataExportPanel() {
  const { current } = useCurrentBusiness()
  const bid = current.business.id
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const exportTable = async (t: (typeof TABLES)[number]) => {
    setBusy(t.key); setMsg(null)
    try {
      const rows: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const page = unwrap(await supabase.from(t.key).select(t.select).eq('business_id', bid).order(t.order).range(from, from + PAGE - 1)) as unknown as Record<string, unknown>[]
        rows.push(...page)
        if (page.length < PAGE) break
      }
      if (!rows.length) { setMsg({ tone: 'success', text: `${t.label}: nothing to export (or you don't have access).` }); return }
      unwrap(await supabase.rpc('log_export', { p_business_id: bid, p_report: `full:${t.key}`, p_from: null, p_to: null, p_row_count: rows.length }))
      downloadCsv(`${t.key}.csv`, rows)
      setMsg({ tone: 'success', text: `${t.label}: ${rows.length} rows exported.` })
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  return (
    <Card className="max-w-2xl" title="Export your data">
      <p className="mb-4 text-sm text-slate-600">
        Download your records as CSV files. This works during and after the trial. Amounts are in centavos (divide by 100).
        Every export is recorded in the audit log.
      </p>
      {msg && <Alert tone={msg.tone} className="mb-4" onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <ul className="divide-y divide-slate-100">
        {TABLES.map((t) => (
          <li key={t.key} className="flex items-center justify-between py-2 text-sm">
            <span>{t.label}</span>
            <Button size="sm" variant="outline" icon={<Download className="size-4" />} loading={busy === t.key} disabled={!!busy} onClick={() => void exportTable(t)}>CSV</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
