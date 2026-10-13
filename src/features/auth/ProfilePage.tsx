import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Button, Card, Input, PageHeader } from '@/components/ui'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces, +, - or ()'),
})
const passwordSchema = z.object({ password: z.string().min(8, 'Use at least 8 characters').max(72), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export function ProfilePage() {
  const { profile, session, refresh } = useAuth()
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pf = useForm({ resolver: zodResolver(profileSchema), values: { full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' } })
  const pw = useForm({ resolver: zodResolver(passwordSchema) })

  const saveProfile = pf.handleSubmit(async (v) => {
    setSaved(null); setError(null)
    try {
      unwrap(await supabase.from('profiles').update({ full_name: v.full_name, phone: v.phone || null }).eq('id', session!.user.id).select('id').single())
      await refresh()
      setSaved('Profile saved.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  })
  const savePassword = pw.handleSubmit(async (v) => {
    setSaved(null); setError(null)
    const { error: e } = await supabase.auth.updateUser({ password: v.password })
    if (e) setError(e.message)
    else { pw.reset({ password: '', confirm: '' }); setSaved('Password changed.') }
  })

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader title="My profile" subtitle={profile?.email ?? undefined} />
      {saved && <Alert tone="success" onClose={() => setSaved(null)}>{saved}</Alert>}
      {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
      <Card title="Personal details">
        <form onSubmit={saveProfile} className="space-y-4" noValidate>
          <Input label="Full name" required error={pf.formState.errors.full_name?.message} {...pf.register('full_name')} />
          <Input label="Phone" type="tel" hint="Optional" error={pf.formState.errors.phone?.message} {...pf.register('phone')} />
          <Button type="submit" loading={pf.formState.isSubmitting}>Save</Button>
        </form>
      </Card>
      <Card title="Change password">
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          <Input label="New password" type="password" autoComplete="new-password" error={pw.formState.errors.password?.message} {...pw.register('password')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" error={pw.formState.errors.confirm?.message} {...pw.register('confirm')} />
          <Button type="submit" variant="outline" loading={pw.formState.isSubmitting}>Change password</Button>
        </form>
      </Card>
    </div>
  )
}
