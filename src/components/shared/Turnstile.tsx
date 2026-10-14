import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * Cloudflare Turnstile bot check for auth forms. Supabase Auth verifies the token server-side
 * (Supabase → Auth → Attack Protection, provider Turnstile, with the secret key).
 * The site key is public; when it isn't configured (e.g. local dev) the widget is skipped.
 */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''
export const captchaEnabled = !!TURNSTILE_SITE_KEY

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<TurnstileApi> | null = null
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable')))
    s.onerror = () => { scriptPromise = null; reject(new Error('Could not load the security check')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  /** Tokens are single-use: call after every submit attempt so the next one gets a fresh token. */
  reset: () => void
}

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void; action?: string }>(
  function Turnstile({ onToken, action }, ref) {
    const box = useRef<HTMLDivElement>(null)
    const widgetId = useRef<string | null>(null)
    const cb = useRef(onToken)
    cb.current = onToken
    const [failed, setFailed] = useState(false)

    useImperativeHandle(ref, () => ({
      reset: () => {
        cb.current(null)
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
      },
    }), [])

    useEffect(() => {
      if (!captchaEnabled) return
      let cancelled = false
      loadTurnstile().then((t) => {
        if (cancelled || !box.current) return
        widgetId.current = t.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: 'light',
          size: 'flexible',
          callback: (token: string) => cb.current(token),
          'expired-callback': () => cb.current(null),
          'error-callback': () => { cb.current(null); setFailed(true) },
        })
      }).catch(() => setFailed(true))
      return () => {
        cancelled = true
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }, [action])

    if (!captchaEnabled) return null
    return (
      <div>
        <div ref={box} className="min-h-[65px]" />
        {failed && <p role="alert" className="mt-1 text-xs text-red-700">The security check couldn't load. Check your connection or disable content blockers, then reload the page.</p>}
      </div>
    )
  },
)

export const CAPTCHA_MISSING = 'Please complete the security check above the button.'
/** Supabase reports a rejected Turnstile token with this code. */
export const isCaptchaError = (e: { code?: string; message: string }) => e.code === 'captcha_failed' || /captcha/i.test(e.message)
export const CAPTCHA_FAILED = 'The security check failed or expired. Please complete it again.'

/** Shared Turnstile state for a form: token, ref to reset after each attempt, and a guard. */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null)
  const ref = useRef<TurnstileHandle>(null)
  return {
    token,
    widget: <Turnstile ref={ref} onToken={setToken} />,
    missing: captchaEnabled && !token,
    /** Tokens are single-use: always reset after a request that used one. */
    reset: () => ref.current?.reset(),
  }
}
