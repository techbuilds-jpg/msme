import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, ErrorState, Input, PageHeader, Select, Spinner, Textarea, errorMessage } from '@/components/ui'
import { draftFromItem, emptyItem, itemsSubtotal, LineItemsEditor, parseItems, type ItemDraft } from '@/components/shared/LineItemsEditor'
import { CustomerSelect, EmployeeSelect } from '@/components/shared/Pickers'
import { PRIORITY_LABEL, type Priority } from '@/components/shared/StatusBadges'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { listCatalog } from '@/features/sales/api'
import { todayIn } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useAsync } from '@/lib/useAsync'
import { getOrder, saveOrder } from './api'

export function OrderFormPage() {
  const { id } = useParams()
  const { current, writable, can } = useCurrentBusiness()
  const b = current.business
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const existing = useAsync(() => (id ? getOrder(id) : Promise.resolve(null)), [id])
  const catalog = useAsync(() => listCatalog(b.id, true), [b.id])

  const [customerId, setCustomerId] = useState<string | null>(params.get('customer'))
  const [orderDate, setOrderDate] = useState(todayIn(b.timezone))
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority>('normal')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const o = existing.data
    if (!o) return
    setCustomerId(o.customer_id); setOrderDate(o.order_date); setDueDate(o.due_date ?? ''); setDescription(o.description ?? '')
    setAssignee(o.assigned_employee_id); setPriority(o.priority); setNotes(o.notes ?? '')
    setItems(o.items.length ? o.items.map(draftFromItem) : [emptyItem()])
  }, [existing.data])

  if (id && existing.loading) return <Spinner />
  if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />
  if (id && !existing.data) return <ErrorState error="Order not found." />
  if (!can('orders.manage') || !writable) return <Alert tone="warning">You can't create or edit orders right now.</Alert>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const parsed = parseItems(items)
    if (parsed.error) return setError(parsed.error)
    if (dueDate && dueDate < orderDate) return setError('The due date cannot be before the order date.')
    setSaving(true)
    try {
      const orderId = await saveOrder(b.id, {
        orderId: id ?? null, customerId, orderDate, description, assignedEmployeeId: assignee, dueDate: dueDate || null,
        priority, notes, items: parsed.items,
      })
      navigate(`/orders/${orderId}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title={id ? `Edit ${existing.data?.order_number}` : 'New order'} />
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Card title="Order details">
          <div className="grid gap-4 md:grid-cols-2">
            <CustomerSelect businessId={b.id} value={customerId} onChange={setCustomerId} noneLabel="— No customer —" />
            <EmployeeSelect businessId={b.id} value={assignee} onChange={setAssignee} />
            <Input label="Order date" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            <Input label="Due date" type="date" value={dueDate} min={orderDate} onChange={(e) => setDueDate(e.target.value)} hint="Optional" />
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
            <Textarea label="Description" wrapperClassName="md:col-span-2" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to be done" />
          </div>
        </Card>
        <Card title="Items & services">
          <LineItemsEditor value={items} onChange={setItems} catalog={catalog.data} currency={b.currency} />
          <p className="mt-4 text-right text-sm">Order total: <strong className="tabular-nums">{formatMoney(itemsSubtotal(items), b.currency)}</strong></p>
          <p className="mt-1 text-right text-xs text-slate-500">An order is not a sale. Record a sale when you bill the customer.</p>
        </Card>
        <Card title="Internal notes">
          <Textarea aria-label="Internal notes" rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Card>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>{id ? 'Save changes' : 'Create order'}</Button>
          <Link to={id ? `/orders/${id}` : '/orders'}><Button variant="outline">Cancel</Button></Link>
        </div>
      </form>
    </>
  )
}
