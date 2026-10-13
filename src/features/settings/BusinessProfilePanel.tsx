import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Button, Card, Input, Select, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { CATEGORY_LABELS, type BusinessCategory } from '@/features/business/types'
import { updateBusinessProfile } from './api'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the business name').max(120),
  category: z.enum(['service', 'retail', 'agency', 'general']),
  address: z.string().trim().max(300),
  contact_email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  contact_number: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces, +, - or ()'),
  size: z.enum(['micro', 'small', 'medium']),
  employee_count: z.coerce.number<string>().int().min(0).max(100000),
  timezone: z.string().min(1),
})

export function BusinessProfilePanel() {
  const { current, can, writable, reload } = useCurrentBusiness()
  const b = current.business
  const editable = can('settings.manage') && writable
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const timezones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone') } catch { return [b.timezone] } }, [b.timezone])
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: b.name, category: b.category, address: b.address ?? '', contact_email: b.contact_email, contact_number: b.contact_number ?? '',
      size: b.size, employee_count: String(b.employee_count), timezone: b.timezone,
    },
  })
  const submit = handleSubmit(async (v) => {
    setMsg(null)
    try {
      await updateBusinessProfile(b.id, { ...v, address: v.address || null, contact_number: v.contact_number || null })
      await reload()
      setMsg({ tone: 'success', text: 'Business profile saved.' })
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }) }
  })

  return (
    <Card className="max-w-2xl">
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!editable} className="space-y-4">
          {msg && <Alert tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Alert>}
          {!can('settings.manage') && <p className="text-sm text-slate-600">Only the owner can change these details.</p>}
          <Input label="Business name" required error={formState.errors.name?.message} {...register('name')} />
          <Select label="Category" hint="Changing the category does not change your modules or dashboard; adjust those under Preferences." {...register('category')}>
            {(Object.keys(CATEGORY_LABELS) as BusinessCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Contact email" type="email" required error={formState.errors.contact_email?.message} {...register('contact_email')} />
            <Input label="Contact number" type="tel" error={formState.errors.contact_number?.message} {...register('contact_number')} />
          </div>
          <Input label="Address" error={formState.errors.address?.message} {...register('address')} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Size" {...register('size')}>
              <option value="micro">Micro (1–9)</option><option value="small">Small (10–99)</option><option value="medium">Medium (100–199)</option>
            </Select>
            <Input label="Employees" type="number" min={0} error={formState.errors.employee_count?.message} {...register('employee_count')} />
            <Select label="Timezone" {...register('timezone')}>{timezones.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </div>
          <p className="text-sm text-slate-600">Currency: {b.currency} (fixed after setup so amounts stay consistent).</p>
          {editable && <Button type="submit" loading={formState.isSubmitting}>Save</Button>}
        </fieldset>
      </form>
    </Card>
  )
}
