import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Button, Input, Modal, Select, Textarea, errorMessage } from '@/components/ui'
import { createCustomer, updateCustomer, type Customer } from './api'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the customer name').max(160),
  contact_number: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces, +, - or ()'),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email').max(254)]),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(2000),
  status: z.enum(['active', 'inactive']),
})

export function CustomerFormModal({ open, onClose, businessId, customer, onSaved }: {
  open: boolean; onClose: () => void; businessId: string; customer?: Customer | null; onSaved: (c: Customer) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const newId = useRef(crypto.randomUUID())
  const { register, handleSubmit, formState, reset } = useForm({
    resolver: zodResolver(schema),
    values: {
      name: customer?.name ?? '', contact_number: customer?.contact_number ?? '', email: customer?.email ?? '',
      address: customer?.address ?? '', notes: customer?.notes ?? '', status: customer?.status ?? 'active',
    },
  })

  const close = () => { setError(null); reset(); onClose() }
  const submit = handleSubmit(async (v) => {
    setError(null)
    const input = { ...v, contact_number: v.contact_number || null, email: v.email || null, address: v.address || null, notes: v.notes || null }
    try {
      const saved = customer ? await updateCustomer(customer.id, input) : await createCustomer(businessId, input, newId.current)
      newId.current = crypto.randomUUID()
      onSaved(saved)
      close()
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <Modal open={open} onClose={close} title={customer ? 'Edit customer' : 'Add customer'}
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={() => void submit()} loading={formState.isSubmitting}>Save</Button></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Name" required error={formState.errors.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Contact number" type="tel" error={formState.errors.contact_number?.message} {...register('contact_number')} />
          <Input label="Email" type="email" error={formState.errors.email?.message} {...register('email')} />
        </div>
        <Input label="Address" hint="Optional" error={formState.errors.address?.message} {...register('address')} />
        <Textarea label="Notes" error={formState.errors.notes?.message} {...register('notes')} />
        {customer && (
          <Select label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
