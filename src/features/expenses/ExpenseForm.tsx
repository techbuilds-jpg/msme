import { Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Alert, Button, Input, Modal, Select, Textarea, errorMessage } from '@/components/ui'
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/components/shared/StatusBadges'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { todayIn } from '@/lib/dates'
import { parseMoney } from '@/lib/money'
import { addCategory, createExpense, discardReceipt, receiptProblem, updateExpense, uploadReceipt, type Expense, type ExpenseCategory } from './api'

export function ExpenseFormModal({ expense, categories, onClose, onSaved, onCategoryAdded }: {
  expense: Expense | null; categories: ExpenseCategory[]; onClose: () => void; onSaved: () => void; onCategoryAdded: () => void
}) {
  const { current, can } = useCurrentBusiness()
  const b = current.business
  const active = categories.filter((c) => c.is_active || c.id === expense?.category_id)
  const [date, setDate] = useState(expense?.expense_date ?? todayIn(b.timezone))
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? active[0]?.id ?? '')
  const [amount, setAmount] = useState(expense ? (expense.amount_centavos / 100).toFixed(2) : '')
  const [method, setMethod] = useState<PaymentMethod>(expense?.payment_method ?? 'cash')
  const [vendor, setVendor] = useState(expense?.vendor ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [receiptPath, setReceiptPath] = useState<string | null>(expense?.receipt_path ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const id = useRef(crypto.randomUUID())

  const pickFile = (f: File | undefined) => {
    setError(null)
    if (!f) return
    const problem = receiptProblem(f)
    if (problem) return setError(problem)
    setFile(f)
  }

  const createCategory = async () => {
    if (!newCategory.trim()) return
    try { await addCategory(b.id, newCategory, categories.length + 1); setNewCategory(''); onCategoryAdded() }
    catch (e) { setError(errorMessage(e)) }
  }

  const save = async () => {
    setError(null)
    const cents = parseMoney(amount)
    if (!cents) return setError('Enter an amount greater than zero.')
    if (!categoryId) return setError('Choose a category.')
    if (!date) return setError('Choose the expense date.')
    setSaving(true)
    let uploaded: string | null = null
    try {
      if (file) uploaded = await uploadReceipt(b.id, file)
      const input = { expense_date: date, category_id: categoryId, amount_centavos: cents, payment_method: method,
        vendor: vendor.trim() || null, description: description.trim() || null, receipt_path: uploaded ?? receiptPath }
      if (expense) await updateExpense(expense.id, input)
      else await createExpense(b.id, id.current, input)
      onSaved()
    } catch (e) {
      if (uploaded) await discardReceipt(uploaded) // don't leave orphaned files behind
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} loading={saving}>Save</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Amount" required inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </Select>
        </div>
        {can('expenses.manage') && (
          <div className="flex items-end gap-2">
            <Input label="New category" hint="Optional: add a category of your own" wrapperClassName="flex-1" maxLength={60} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            <Button variant="outline" onClick={() => void createCategory()} disabled={!newCategory.trim()} className="mb-5">Add</Button>
          </div>
        )}
        <Input label="Vendor / payee" maxLength={160} value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <Textarea label="Description" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div>
          <span className="label">Receipt (optional)</span>
          {file || receiptPath ? (
            <div className="flex items-center gap-2 text-sm">
              <Paperclip className="size-4 text-slate-500" aria-hidden />
              <span className="truncate">{file ? file.name : 'Receipt attached'}</span>
              <button type="button" className="rounded p-1 text-slate-500 hover:bg-surface" aria-label="Remove receipt" onClick={() => { setFile(null); setReceiptPath(null) }}><X className="size-4" /></button>
            </div>
          ) : (
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block text-sm" aria-label="Receipt file"
              onChange={(e) => pickFile(e.target.files?.[0])} />
          )}
          <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP or PDF up to 5 MB. Stored privately; only people who can view expenses can open it.</p>
        </div>
      </div>
    </Modal>
  )
}
