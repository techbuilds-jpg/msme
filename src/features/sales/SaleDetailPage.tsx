import { Ban, Plus, Undo2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, ErrorState, Input, Modal, PageHeader, Select, Spinner, Stat, Textarea, errorMessage } from '@/components/ui'
import { PaymentStatusBadge, PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/components/shared/StatusBadges'
import { useCanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney, parseMoney } from '@/lib/money'
import { useAsync } from '@/lib/useAsync'
import { getSale, recordPayment, voidPayment, voidSale, type Payment } from './api'

export function SaleDetailPage() {
  const { id = '' } = useParams()
  const { current } = useCurrentBusiness()
  const b = current.business
  const sale = useAsync(() => getSale(id), [id])
  const canPay = useCanWrite('payments.manage')
  const canSell = useCanWrite('sales.manage')
  const isManager = current.role === 'owner' || current.role === 'manager'
  const [paying, setPaying] = useState<'payment' | 'refund' | null>(null)
  const [voiding, setVoiding] = useState<{ kind: 'sale' } | { kind: 'payment'; payment: Payment } | null>(null)

  if (sale.loading && !sale.data) return <Spinner />
  if (sale.error) return <ErrorState error={sale.error} onRetry={sale.reload} />
  const s = sale.data
  if (!s) return <ErrorState error="Sale not found, or you don't have access to it." />
  const voided = s.status === 'voided'
  const balance = s.total_centavos - s.paid_centavos
  const m = (c: number) => formatMoney(c, b.currency)

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.sale_number} <PaymentStatusBadge status={s.payment_status} voided={voided} /></span>}
        subtitle={<>{formatDate(s.sale_date)} · {s.customer ? <Link className="text-navy-500 underline" to={`/customers/${s.customer_id}`}>{s.customer.name}</Link> : 'Walk-in'}
          {s.order && <> · Order <Link className="text-navy-500 underline" to={`/orders/${s.order_id}`}>{s.order.order_number}</Link></>}</>}
        actions={!voided && <>
          {canPay && balance > 0 && <Button icon={<Plus className="size-4" />} onClick={() => setPaying('payment')}>Record payment</Button>}
          {canPay && s.paid_centavos > 0 && <Button variant="outline" icon={<Undo2 className="size-4" />} onClick={() => setPaying('refund')}>Refund</Button>}
          {canSell && isManager && s.paid_centavos === 0 && <Button variant="outline" icon={<Ban className="size-4" />} onClick={() => setVoiding({ kind: 'sale' })}>Void sale</Button>}
        </>}
      />
      {voided && <Alert tone="warning" className="mb-4" title="This sale was voided">{s.void_reason} · {formatDateTime(s.voided_at, b.timezone)}</Alert>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={m(s.total_centavos)} hint={s.discount_centavos ? `After ${m(s.discount_centavos)} discount` : undefined} />
        <Stat label="Paid" value={m(s.paid_centavos)} hint={s.refunded_centavos ? `Net of ${m(s.refunded_centavos)} refunded` : undefined} tone="good" />
        <Stat label="Balance" value={voided ? '—' : m(balance)} tone={balance > 0 && !voided ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Items" padded={false}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.id}><td>{i.description}</td><td className="text-right tabular-nums">{Number(i.quantity)}</td>
                    <td className="text-right tabular-nums">{m(i.unit_price_centavos)}</td><td className="text-right tabular-nums">{m(i.line_total_centavos)}</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} className="text-right">Subtotal</td><td className="text-right tabular-nums">{m(s.subtotal_centavos)}</td></tr>
                {!!s.discount_centavos && <tr><td colSpan={3} className="text-right">Discount</td><td className="text-right tabular-nums">−{m(s.discount_centavos)}</td></tr>}
                <tr><td colSpan={3} className="text-right font-medium">Total</td><td className="text-right font-semibold tabular-nums">{m(s.total_centavos)}</td></tr>
              </tfoot>
            </table>
          </div>
          {s.notes && <p className="border-t border-slate-100 p-4 text-sm whitespace-pre-wrap">{s.notes}</p>}
        </Card>

        <Card title="Payments" padded={false}>
          {s.payments.length === 0 ? <p className="p-4 text-sm text-slate-500">No payments recorded yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {s.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 p-4 text-sm">
                  <div className={p.status === 'voided' ? 'text-slate-400' : undefined}>
                    <p className="font-medium">
                      {p.kind === 'refund' ? 'Refund' : 'Payment'} · {PAYMENT_METHOD_LABEL[p.method]}
                      {p.status === 'voided' && <Badge className="ml-2">Voided</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(p.paid_at, b.timezone)}{p.reference_no && ` · Ref ${p.reference_no}`} · by {p.recorder?.full_name || p.recorder?.email || 'unknown'}
                    </p>
                    {p.notes && <p className="mt-1">{p.notes}</p>}
                    {p.void_reason && <p className="mt-1 text-xs">Void reason: {p.void_reason}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold tabular-nums ${p.status === 'voided' ? 'text-slate-400 line-through' : p.kind === 'refund' ? 'text-red-700' : ''}`}>
                      {p.kind === 'refund' ? '−' : ''}{m(p.amount_centavos)}
                    </p>
                    {canPay && isManager && p.status === 'active' && !voided && (
                      <button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => setVoiding({ kind: 'payment', payment: p })}>Void</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {paying && <PaymentModal kind={paying} saleId={s.id} max={paying === 'payment' ? balance : s.paid_centavos} currency={b.currency}
        onClose={() => setPaying(null)} onSaved={() => { setPaying(null); void sale.reload() }} />}
      {voiding && <VoidModal title={voiding.kind === 'sale' ? `Void ${s.sale_number}?` : 'Void this payment?'}
        description={voiding.kind === 'sale' ? 'The sale stays on record, marked as voided, and is excluded from totals.' : 'The payment stays on record, marked as voided, and the balance is recalculated.'}
        onClose={() => setVoiding(null)}
        onConfirm={async (reason) => {
          if (voiding.kind === 'sale') await voidSale(s.id, reason)
          else await voidPayment(voiding.payment.id, reason)
          setVoiding(null); void sale.reload()
        }} />}
    </>
  )
}

function PaymentModal({ kind, saleId, max, currency, onClose, onSaved }: {
  kind: 'payment' | 'refund'; saleId: string; max: number; currency: string; onClose: () => void; onSaved: () => void
}) {
  const [amount, setAmount] = useState(kind === 'payment' ? (max / 100).toFixed(2) : '')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const key = useRef(crypto.randomUUID()) // same key for retries of this one payment

  const save = async () => {
    setError(null)
    const cents = parseMoney(amount)
    if (!cents) return setError('Enter an amount greater than zero.')
    if (cents > max) return setError(`The most you can ${kind === 'payment' ? 'collect' : 'refund'} is ${formatMoney(max, currency)}.`)
    setSaving(true)
    try {
      await recordPayment({ saleId, amountCentavos: cents, method, idempotencyKey: key.current, kind, referenceNo: ref, notes })
      onSaved()
    } catch (e) { setError(errorMessage(e)); setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={kind === 'payment' ? 'Record payment' : 'Record refund'} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} loading={saving}>Save</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Up to ${formatMoney(max, currency)}`} />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
        </Select>
        <Input label="Reference no." hint="Optional" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} />
        <Textarea label="Notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}

export function VoidModal({ title, description, onClose, onConfirm }: {
  title: string; description: string; onClose: () => void; onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const confirm = async () => {
    if (!reason.trim()) return setError('Give a reason. It is kept in the audit log.')
    setSaving(true); setError(null)
    try { await onConfirm(reason.trim()) } catch (e) { setError(errorMessage(e)); setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title={title} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => void confirm()} loading={saving}>Void</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{description}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Textarea label="Reason" required rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}
