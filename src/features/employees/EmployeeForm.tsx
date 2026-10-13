import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Button, Input, Modal, Select, Textarea, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { createEmployee, EMPLOYMENT_LABEL, updateEmployee, type Employee, type EmploymentStatus } from './api'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Enter the name').max(120),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email').max(254)]),
  phone: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces, +, - or ()'),
  job_title: z.string().trim().max(80),
  department: z.string().trim().max(80),
  employment_status: z.enum(['active', 'on_leave', 'resigned', 'terminated']),
  hired_on: z.string(),
  notes: z.string().trim().max(2000),
})

export function EmployeeFormModal({ employee, onClose, onSaved }: { employee?: Employee; onClose: () => void; onSaved: (id: string) => void }) {
  const { current } = useCurrentBusiness()
  const [error, setError] = useState<string | null>(null)
  const id = useRef(crypto.randomUUID())
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: employee?.full_name ?? '', email: employee?.email ?? '', phone: employee?.phone ?? '', job_title: employee?.job_title ?? '',
      department: employee?.department ?? '', employment_status: employee?.employment_status ?? 'active', hired_on: employee?.hired_on ?? '', notes: employee?.notes ?? '',
    },
  })
  const submit = handleSubmit(async (v) => {
    setError(null)
    const input = {
      full_name: v.full_name, email: v.email || null, phone: v.phone || null, job_title: v.job_title || null, department: v.department || null,
      employment_status: v.employment_status as EmploymentStatus, hired_on: v.hired_on || null, notes: v.notes || null,
    }
    try {
      if (employee) { await updateEmployee(employee.id, input); onSaved(employee.id) }
      else { await createEmployee(current.business.id, id.current, input); onSaved(id.current) }
    } catch (e) { setError(errorMessage(e)) }
  })
  return (
    <Modal open onClose={onClose} title={employee ? 'Edit employee' : 'Add employee'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} loading={formState.isSubmitting}>Save</Button></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Full name" required error={formState.errors.full_name?.message} {...register('full_name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Job title" error={formState.errors.job_title?.message} {...register('job_title')} />
          <Input label="Department" hint="Optional" error={formState.errors.department?.message} {...register('department')} />
          <Input label="Phone" type="tel" error={formState.errors.phone?.message} {...register('phone')} />
          <Input label="Email" type="email" error={formState.errors.email?.message} {...register('email')} />
          <Select label="Employment status" {...register('employment_status')}>
            {(Object.keys(EMPLOYMENT_LABEL) as EmploymentStatus[]).map((s) => <option key={s} value={s}>{EMPLOYMENT_LABEL[s]}</option>)}
          </Select>
          <Input label="Hired on" type="date" {...register('hired_on')} />
        </div>
        <Textarea label="Notes" error={formState.errors.notes?.message} {...register('notes')} />
        <p className="text-xs text-slate-500">Keep only what you need for work. Don't store government IDs or salary details here.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
