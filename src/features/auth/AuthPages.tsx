import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert, Button, Checkbox, Input } from '@/components/ui'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)
const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters')

/** Only allow in-app redirects such as "/invite#…"; never absolute URLs. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

// -------------------------------------------------------------------------------------------------
export function LoginPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const next = safeNext(new URLSearchParams(location.search).get('next'))
  const [error, setError] = useState<string | null>(null)
  const schema = z.object({ email, password: z.string().min(1, 'Enter your password') })
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) })

  if (session) return <Navigate to={next} replace />

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
    if (e) {
      setError(e.message === 'Email not confirmed' ? 'Please verify your email first. Check your inbox for the link.' : 'Incorrect email or password.')
      return
    }
    navigate(next, { replace: true })
  })

  return (
    <AuthLayout title="Sign in" footer={<>No account yet? <Link className="font-medium text-navy-500 underline" to={`/register${location.search}`}>Start a free trial</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" required error={formState.errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" required error={formState.errors.password?.message} {...register('password')} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>Sign in</Button>
        <p className="text-center text-sm"><Link className="text-navy-500 underline" to="/forgot-password">Forgot password?</Link></p>
      </form>
    </AuthLayout>
  )
}

// -------------------------------------------------------------------------------------------------
export function RegisterPage() {
  const { session } = useAuth()
  const location = useLocation()
  const next = safeNext(new URLSearchParams(location.search).get('next'))
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const schema = z.object({
    full_name: z.string().trim().min(2, 'Enter your name').max(120),
    email,
    password,
    confirm: z.string(),
    consent: z.literal(true, { error: 'Please agree to continue' }),
  }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) })

  if (session) return <Navigate to={next} replace />
  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={<>We sent a verification link to <strong>{sentTo}</strong>.</>}>
        <p className="text-sm text-slate-600">Open the link to verify your address, then sign in. The link may take a minute to arrive; check spam too.</p>
        <Link to="/login" className="mt-4 inline-block text-sm font-medium text-navy-500 underline">Go to sign in</Link>
      </AuthLayout>
    )
  }

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.full_name }, emailRedirectTo: `${window.location.origin}${next}` },
    })
    if (e) {
      setError(e.message)
      return
    }
    setSentTo(v.email)
  })

  return (
    <AuthLayout title="Start your 14-day free trial" subtitle="No credit card required."
      footer={<>Already registered? <Link className="font-medium text-navy-500 underline" to={`/login${location.search}`}>Sign in</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Your name" autoComplete="name" required error={formState.errors.full_name?.message} {...register('full_name')} />
        <Input label="Email" type="email" autoComplete="email" required error={formState.errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters" error={formState.errors.password?.message} {...register('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required error={formState.errors.confirm?.message} {...register('confirm')} />
        <Checkbox
          label={<>I agree to the processing of my information to provide this service, as described in the <Link className="text-navy-500 underline" to="/privacy" target="_blank">privacy notice</Link>.</>}
          error={formState.errors.consent?.message}
          {...register('consent')}
        />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>Create account</Button>
      </form>
    </AuthLayout>
  )
}

// -------------------------------------------------------------------------------------------------
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(z.object({ email })) })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${window.location.origin}/reset-password` })
    // Same message whether or not the account exists, so the form cannot be used to discover accounts.
    if (e && e.status === 429) setError('Too many requests. Please wait a few minutes.')
    else setSent(true)
  })

  return (
    <AuthLayout title="Reset your password" footer={<Link className="text-navy-500 underline" to="/login">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success">If an account exists for that email, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Email" type="email" autoComplete="email" required error={formState.errors.email?.message} {...register('email')} />
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  )
}

// -------------------------------------------------------------------------------------------------
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const schema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate('/', { replace: true }), 1500)
      return () => clearTimeout(t)
    }
  }, [done, navigate])

  if (loading) return null
  if (!session) {
    return (
      <AuthLayout title="Reset link expired">
        <p className="text-sm text-slate-600">This link is invalid or has expired.</p>
        <Link className="mt-4 inline-block text-sm font-medium text-navy-500 underline" to="/forgot-password">Request a new link</Link>
      </AuthLayout>
    )
  }

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.updateUser({ password: v.password })
    if (e) setError(e.message)
    else setDone(true)
  })

  return (
    <AuthLayout title="Choose a new password">
      {done ? <Alert tone="success">Password updated. Taking you to the app…</Alert> : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="New password" type="password" autoComplete="new-password" required error={formState.errors.password?.message} {...register('password')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" required error={formState.errors.confirm?.message} {...register('confirm')} />
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  )
}
