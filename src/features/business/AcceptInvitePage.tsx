import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Spinner, errorMessage } from '@/components/ui'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { useAuth } from '@/features/auth/AuthProvider'
import { ROLE_LABELS } from '@/lib/permissions'
import { acceptInvitation, previewInvitation, type InvitationPreview } from './api'
import { useBusiness } from './BusinessProvider'

const PENDING_KEY = 'msme.pendingInvite'

/**
 * Invitation links look like /invite#<token>. The token sits in the URL fragment so it is never sent to
 * any server or written to access logs. If the visitor still has to sign up, it is kept in sessionStorage.
 */
function readToken(): string | null {
  const fromHash = window.location.hash.replace(/^#/, '')
  try {
    if (/^[a-f0-9]{64}$/.test(fromHash)) {
      sessionStorage.setItem(PENDING_KEY, fromHash)
      return fromHash
    }
    return sessionStorage.getItem(PENDING_KEY)
  } catch {
    return /^[a-f0-9]{64}$/.test(fromHash) ? fromHash : null
  }
}

export function AcceptInvitePage() {
  const { session, loading: authLoading, signOut } = useAuth()
  const { select, reload } = useBusiness()
  const navigate = useNavigate()
  const [token] = useState(readToken)
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!session || !token) return
    previewInvitation(token).then(setPreview).catch((e) => setError(errorMessage(e)))
  }, [session, token])

  if (!token) {
    return <AuthLayout title="Invitation link not valid"><p className="text-sm text-slate-600">Ask the person who invited you to send a new link.</p></AuthLayout>
  }
  if (authLoading) return <Spinner className="min-h-dvh" />
  if (!session) {
    return (
      <AuthLayout title="You've been invited" subtitle="Sign in or create an account with the email address the invitation was sent to.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to="/login?next=/invite" className="flex-1"><Button className="w-full">Sign in</Button></Link>
          <Link to="/register?next=/invite" className="flex-1"><Button variant="outline" className="w-full">Create account</Button></Link>
        </div>
      </AuthLayout>
    )
  }

  const accept = async () => {
    setAccepting(true)
    setError(null)
    try {
      const businessId = await acceptInvitation(token)
      try { sessionStorage.removeItem(PENDING_KEY) } catch { /* ignore */ }
      select(businessId)
      await reload()
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <AuthLayout title="Join a business">
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {!preview && !error && <Spinner />}
      {preview && (
        <>
          <p className="text-sm">
            You were invited to join <strong>{preview.business_name}</strong> as <strong>{ROLE_LABELS[preview.role]}</strong>.
          </p>
          <p className="mt-1 text-xs text-slate-600">Invitation for {preview.email}</p>
          {preview.status === 'pending' ? (
            <Button className="mt-5 w-full" loading={accepting} onClick={() => void accept()}>Accept invitation</Button>
          ) : (
            <Alert tone="warning" className="mt-4">This invitation is {preview.status}. Ask for a new one.</Alert>
          )}
          {session.user.email?.toLowerCase() !== preview.email && (
            <p className="mt-4 text-sm text-slate-600">
              You are signed in as {session.user.email}.{' '}
              <button type="button" className="text-navy-500 underline" onClick={() => void signOut()}>Sign out</button> and use {preview.email}.
            </p>
          )}
        </>
      )}
    </AuthLayout>
  )
}
