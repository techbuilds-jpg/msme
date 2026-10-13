import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Input, PageHeader, Select, Textarea, errorMessage } from '@/components/ui'
import { draftFromItem, emptyItem, itemsSubtotal, LineItemsEditor, parseItems, type ItemDraft } from '@/components/shared/LineItemsEditor'
import { CustomerSelect } from '@/components/shared/Pickers'
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/components/shared/StatusBadges'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { getOrder } from '@/features/orders/api'
import { todayIn } from '@/lib/dates'
import { formatMoney, parseMoney } from '@/lib/money'
import { useAsync } from '@/lib/useAsync'
import { createSale, listCatalog } from './api'

export function NewSalePage() {
  const { current, can, writable } = useCurrentBusiness()
  const b = current.business
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const orderId = params.get('order')
  const catalog = useAsync(() => listCatalog(b.id, true), [b.id])
  const order = useAsync(() => (orderId ? getOrder(orderId) : Promise.resolve(null)), [orderId])

  const [customerId, setCustomerId] = useState<string | null>(params.get('customer'))
  const [saleDate, setSaleDate] = useState(todayIn(b.timezone))
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payRef, setPayRef] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Stable keys: a retried submit (double click, flaky network) is recognised by the database and not duplicated.
  const saleKey = useRef(crypto.randomUUID())
  const payKey = useRef(crypto.randomUUID())

  useEffect(() => {
    const o = order.data
    if (!o) return
    setCustomerId(o.customer_id)
    if (o.items.length) setItems(o.items.map(draftFromItem))
  }, [order.data])

  if (!can('sales.manage') || !writable) return <Alert tone="warning">You can't record sales right now.</Alert>

  const subtotal = itemsSubtotal(items)
  const discountCents = discount.trim() ? parseMoney(discount) : 0
  const total = subtotal - (discountCents ?? 0)
  const canDiscount = can('sales.discount')
  const canPay = can('payments.manage')
  const maxPct = current.settings.max_discount_pct

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const parsed = parseItems(items)
    if (parsed.error) return setError(parsed.error)
    if (!parsed.items.length) return setError('Add at least one item.')
    if (discountCents == null || discountCents > subtotal) return setError('Enter a discount between zero and the subtotal.')
    const payCents = payAmount.trim() ? parseMoney(payAmount) : 0
    if (payCents == null) return setError('Enter a valid payment amount.')
    if (payCents > total) return setError('The payment is more than the sale total.')
    setSaving(true)
    try {
      const id = await createSale(b.id, {
        idempotencyKey: saleKey.current, items: parsed.items, customerId, orderId, saleDate, discountCentavos: discountCents, notes,
        payment: payCents > 0 ? { amount_centavos: payCents, method: payMethod, reference_no: payRef || null, idempotency_key: payKey.current } : null,
      })
      navigate(`/sales/${id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="New sale" subtitle={order.data ? <>For order <Link className="text-navy-500 underline" to={`/orders/${order.data.id}`}>{order.data.order_number}</Link></> : undefined} />
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Card title="Sale">
          <div className="grid gap-4 md:grid-cols-2">
            <CustomerSelect businessId={b.id} value={customerId} onChange={setCustomerId} />
            <Input label="Sale date" type="date" required value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
        </Card>
        <Card title="Items">
          <LineItemsEditor value={items} onChange={setItems} catalog={catalog.data} currency={b.currency} />
          <div className="mt-4 ml-auto max-w-xs space-y-2 text-sm">
            <Row label="Subtotal">{formatMoney(subtotal, b.currency)}</Row>
            {canDiscount && (
              <Input label="Discount" inputMode="decimal" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)}
                hint={current.role !== 'owner' ? `Up to ${maxPct}% of the subtotal` : undefined}
                error={discountCents == null ? 'Enter a valid amount' : undefined} />
            )}
            <Row label={<strong>Total</strong>}><strong>{formatMoney(Math.max(total, 0), b.currency)}</strong></Row>
          </div>
        </Card>
        {canPay && (
          <Card title="Payment received now (optional)">
            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Amount" inputMode="decimal" placeholder="0.00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                hint={<button type="button" className="text-navy-500 underline" onClick={() => setPayAmount((Math.max(total, 0) / 100).toFixed(2))}>Pay in full</button>} />
              <Select label="Method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </Select>
              <Input label="Reference no." hint="Optional, e.g. GCash ref" maxLength={80} value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Leave the amount empty to record payments later. Partial payments are allowed.</p>
          </Card>
        )}
        <Card title="Notes"><Textarea aria-label="Notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Card>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>Save sale</Button>
          <Link to="/sales"><Button variant="outline">Cancel</Button></Link>
        </div>
      </form>
    </>
  )
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span>{label}</span><span className="tabular-nums">{children}</span></div>
}
