import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, ErrorState, Input, PageHeader, Select, errorMessage } from '@/components/ui'
import { PAYMENT_METHOD_LABEL } from '@/components/shared/StatusBadges'
import { CanWrite, useCanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { VoidModal } from '@/features/sales/SaleDetailPage'
import { formatDate, presetRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { LIST_LIMIT } from '@/lib/search'
import { useAsync } from '@/lib/useAsync'
import { expenseSummary, listCategories, listExpenses, receiptUrl, voidExpense, type Expense } from './api'
import { ExpenseFormModal } from './ExpenseForm'

export function ExpensesPage() {
  const { current } = useCurrentBusiness()
  const b = current.business
  const month = presetRange('month', b.timezone)
  const [from, setFrom] = useState(month.from)
  const [to, setTo] = useState(month.to)
  const [categoryId, setCategoryId] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const canManage = useCanWrite('expenses.manage')
  const validRange = !!from && !!to && from <= to

  const categories = useAsync(() => listCategories(b.id), [b.id])
  const list = useAsync(() => (validRange ? listExpenses(b.id, { from, to, categoryId: categoryId || undefined, showVoided }) : Promise.resolve([])), [b.id, from, to, categoryId, showVoided])
  const summary = useAsync(() => (validRange ? expenseSummary(b.id, from, to) : Promise.resolve([])), [b.id, from, to])
  const total = summary.data?.reduce((s, r) => s + Number(r.total_centavos), 0) ?? 0
  const m = (c: number) => formatMoney(c, b.currency)
  const reload = () => { void list.reload(); void summary.reload() }

  const openReceipt = async (path: string) => {
    setOpenError(null)
    try { window.open(await receiptUrl(path), '_blank', 'noopener') } catch (e) { setOpenError(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title="Expenses" actions={
        <CanWrite perm="expenses.manage"><Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add expense</Button></CanWrite>
      } />
      <Card className="mb-5" padded={false}>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Input label="From" type="date" wrapperClassName="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" wrapperClassName="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <Select label="Category" wrapperClassName="w-48" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Checkbox label="Show voided" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="pb-2" />
        </div>
        {!validRange && <p className="px-3 pb-3 text-sm text-red-700">Choose a valid date range.</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={`By category · ${m(total)}`} className="lg:order-2">
          {summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : !summary.data?.length ? (
            <p className="text-sm text-slate-500">No expenses in this period.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {summary.data.map((r) => (
                <li key={r.category_id}>
                  <div className="flex justify-between gap-2"><span>{r.category_name} <span className="text-slate-400">({r.expense_count})</span></span><span className="tabular-nums">{m(Number(r.total_centavos))}</span></div>
                  <div className="mt-1 h-1.5 rounded bg-navy-100" aria-hidden><div className="h-1.5 rounded bg-navy-500" style={{ width: `${total ? (Number(r.total_centavos) / total) * 100 : 0}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card padded={false} className="lg:order-1 lg:col-span-2">
          {openError && <p className="p-3 text-sm text-red-700">{openError}</p>}
          <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(r) => r.id}
            onRowClick={canManage ? (r) => r.status === 'active' && setEditing(r) : undefined}
            empty={<EmptyState title="No expenses in this period" description="Record rent, utilities, supplies and other costs to see where money goes." />}
            columns={[
              { header: 'Date', cell: (r) => formatDate(r.expense_date) },
              { header: 'Category', cell: (r) => <>{r.category?.name}{r.status === 'voided' && <Badge className="ml-2">Voided</Badge>}</> },
              { header: 'Details', cell: (r) => <span className="block max-w-xs truncate">{[r.vendor, r.description].filter(Boolean).join(' · ') || '—'}</span> },
              { header: 'Method', cell: (r) => PAYMENT_METHOD_LABEL[r.payment_method] },
              { header: 'Amount', className: 'text-right', cell: (r) => <span className={`tabular-nums ${r.status === 'voided' ? 'text-slate-400 line-through' : ''}`}>{m(r.amount_centavos)}</span> },
              { header: <span className="sr-only">Actions</span>, className: 'text-right whitespace-nowrap', cell: (r) => (
                <span className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {r.receipt_path && <button type="button" className="text-navy-500" aria-label="Open receipt" onClick={() => void openReceipt(r.receipt_path!)}><FileText className="size-4" /></button>}
                  {canManage && r.status === 'active' && <button type="button" className="text-xs text-red-700 underline" onClick={() => setVoiding(r)}>Void</button>}
                </span>
              ) },
            ]} />
          {list.data?.length === LIST_LIMIT && <p className="p-3 text-xs text-slate-500">Showing the latest {LIST_LIMIT}. Narrow the date range to see more. Category totals include everything.</p>}
        </Card>
      </div>

      {editing && <ExpenseFormModal expense={editing === 'new' ? null : editing} categories={categories.data ?? []}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} onCategoryAdded={categories.reload} />}
      {voiding && <VoidModal title="Void this expense?" description="The expense stays on record, marked as voided, and is excluded from totals."
        onClose={() => setVoiding(null)} onConfirm={async (reason) => { await voidExpense(voiding.id, reason); setVoiding(null); reload() }} />}
    </>
  )
}
