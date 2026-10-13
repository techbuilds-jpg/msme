import { supabase } from './supabase'

/**
 * Sends uncaught client errors to the database (public.app_errors) for the platform health view.
 * Only signed-in users can report; messages are truncated and rate-limited server-side. No form data is sent.
 */
export function installErrorReporting() {
  let sent = 0
  const report = (message: string) => {
    if (sent >= 10) return // per page load
    sent++
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return
      void supabase.rpc('report_client_error', {
        p_message: message.slice(0, 1000),
        p_url: window.location.pathname.slice(0, 500), // path only: no query strings or invite fragments
        p_context: { ua: navigator.userAgent.slice(0, 200) },
      })
    })
  }
  window.addEventListener('error', (e) => report(e.message || 'Unknown error'))
  window.addEventListener('unhandledrejection', (e) => report(String(e.reason?.message ?? e.reason ?? 'Unhandled rejection')))
}
