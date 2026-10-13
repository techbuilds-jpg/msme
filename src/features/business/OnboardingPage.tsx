import { zodResolver } from '@hookform/resolvers/zod'
import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert, Button, Input, Select } from '@/components/ui'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/components/ui'
import { createBusiness } from './api'
import { useBusiness } from './BusinessProvider'
import { CATEGORY_LABELS, type BusinessCategory } from './types'

const CATEGORY_HELP: Record<BusinessCategory, string> = {
  service: 'Jobs and appointments first: dashboard leads with open and completed orders.',
  retail: 'Selling products: dashboard leads with sales, collections and cash movement.',
  agency: 'Client projects billed over time: dashboard leads with receivables and collections.',
  general: 'A balanced setup with every module switched on.',
}

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the business name').max(120),
  category: z.enum(['service', 'retail', 'agency', 'general'], { error: 'Choose a category' }),
  address: z.string().trim().max(300).optional(),
  contact_email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  contact_number: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces, +, - or ()').optional(),
  size: z.enum(['micro', 'small', 'medium']),
  employee_count: z.coerce.number<string>().int('Whole number').min(0).max(100000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().min(1),
})

export function OnboardingPage() {
  const { session, profile, isPlatformAdmin } = useAuth()
  const { select, reload, businesses } = useBusiness()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const timezones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return ['Asia/Manila'] }
  }, [])

  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      contact_email: session?.user.email ?? '', size: 'micro' as const, employee_count: '1',
      currency: 'PHP', timezone: 'Asia/Manila', category: undefined,
    },
  })
  const category = watch('category')

  // One trial business per account (also enforced by the database).
  if (profile?.trial_used_at && !isPlatformAdmin) {
    return (
      <AuthLayout title="You have already started a trial">
        <p className="text-sm text-slate-600">Each account can start one free trial business. Contact us if you need another one.</p>
        {!!businesses?.length && <Button className="mt-4" onClick={() => navigate('/')}>Go to my business</Button>}
      </AuthLayout>
    )
  }
  if (!session) return <Navigate to="/login" replace />

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      const id = await createBusiness({ ...v, employee_count: v.employee_count })
      select(id)
      await reload()
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <AuthLayout title="Set up your business" subtitle="Your 14-day free trial starts when you finish this step.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Business name" required error={formState.errors.name?.message} {...register('name')} />

        <fieldset>
          <legend className="label">Business category <span className="text-red-600" aria-hidden>*</span></legend>
          <div className="grid gap-2">
            {(Object.keys(CATEGORY_LABELS) as BusinessCategory[]).map((c) => (
              <label key={c} className={clsx('flex cursor-pointer gap-3 rounded-md border p-3 text-sm',
                category === c ? 'border-navy-500 bg-navy-100' : 'border-slate-200 hover:bg-surface')}>
                <input type="radio" value={c} className="mt-0.5 accent-navy-900" {...register('category')} />
                <span>
                  <span className="font-medium">{CATEGORY_LABELS[c]}</span>
                  <span className="block text-slate-600">{CATEGORY_HELP[c]}</span>
                </span>
              </label>
            ))}
          </div>
          {formState.errors.category && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{formState.errors.category.message}</p>}
        </fieldset>

        <Input label="Contact email" type="email" required error={formState.errors.contact_email?.message} {...register('contact_email')} />
        <Input label="Contact number" type="tel" hint="Optional" error={formState.errors.contact_number?.message} {...register('contact_number')} />
        <Input label="Business address" hint="Optional" error={formState.errors.address?.message} {...register('address')} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Business size" {...register('size')}>
            <option value="micro">Micro (1–9 staff)</option>
            <option value="small">Small (10–99 staff)</option>
            <option value="medium">Medium (100–199 staff)</option>
          </Select>
          <Input label="Number of employees" type="number" min={0} inputMode="numeric" error={formState.errors.employee_count?.message} {...register('employee_count')} />
          <Select label="Currency" {...register('currency')}>
            <option value="PHP">PHP — Philippine peso</option>
            <option value="USD">USD — US dollar</option>
          </Select>
          <Select label="Timezone" {...register('timezone')}>
            {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>

        <Button type="submit" className="w-full" loading={formState.isSubmitting}>Create business and start trial</Button>
      </form>
    </AuthLayout>
  )
}
