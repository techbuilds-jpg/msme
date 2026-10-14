import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, errorMessage } from '@/components/ui'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { CAPTCHA_FAILED, CAPTCHA_MISSING, isCaptchaError, useCaptcha } from '@/components/shared/Turnstile'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBusiness } from '@/features/business/BusinessProvider'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/**
 * Demo sandbox: each visitor gets their own private business filled with fictional sample data.
 * Visitors without an account are signed in anonymously; the demo and the anonymous account are deleted after 48 hours.
 */
export function DemoPage() {
  const { session } = useAuth()
  const { select, reload } = useBusiness()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const captcha = useCaptcha()

  const start = async () => {
    setError(null)
    // The bot check only applies when a new anonymous session is created.
    if (!session && captcha.missing) return setError(CAPTCHA_MISSING)
    setStarting(true)
    try {
      if (!session) {
        const { error: e } = await supabase.auth.signInAnonymously({ options: { captchaToken: captcha.token ?? undefined } })
        captcha.reset()
        if (e) throw new Error(isCaptchaError(e) ? CAPTCHA_FAILED : e.message.includes('disabled') ? 'The demo is not available right now. Please try again later.' : e.message)
      }
      const id = unwrap(await supabase.rpc('start_demo')) as string
      select(id)
      await reload()
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setStarting(false)
    }
  }

  return (
    <AuthLayout title="Try the demo" subtitle="Explore the platform with a sample business. No sign-up needed."
      footer={<>Ready for your own business? <Link className="font-medium text-navy-500 underline" to="/register">Start a free trial</Link></>}>
      <ul className="mb-5 list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>Every customer, order, sale and expense in the demo is <strong>fictional</strong>.</li>
        <li>Your demo is private to you: nobody else sees it, and it never touches real business data.</li>
        <li>You can add and change anything. The demo is deleted automatically after 48 hours.</li>
      </ul>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {!session && <div className="mb-4">{captcha.widget}</div>}
      <Button className="w-full" loading={starting} onClick={() => void start()}>Open demo business</Button>
    </AuthLayout>
  )
}
