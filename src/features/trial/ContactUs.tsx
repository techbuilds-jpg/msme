import { useState } from 'react'
import { Alert, Button, Input, Modal, Textarea, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'

/** Lets a trial business ask for an implementation or subscription. Works even after the trial ends. */
export function ContactUsModal({ onClose }: { onClose: () => void }) {
  const { current, reload } = useCurrentBusiness()
  const contact = useAsync(async () => unwrap(await supabase.rpc('platform_contact')) as { email: string | null; message: string } | null, [])
  const [message, setMessage] = useState('')
  const [preferred, setPreferred] = useState(current.business.contact_number ?? current.business.contact_email)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const send = async () => {
    setError(null); setSaving(true)
    try {
      unwrap(await supabase.rpc('request_consultation', { p_business_id: current.business.id, p_message: message, p_preferred_contact: preferred }))
      setSent(true)
      void reload()
    } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Continue with the platform" size="sm"
      footer={sent ? <Button onClick={onClose}>Close</Button> : <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void send()} loading={saving}>Send request</Button></>}>
      {sent ? <Alert tone="success">Thanks! We received your request and will get in touch using the contact details you gave.</Alert> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{contact.data?.message ?? 'Tell us how we can help: an implementation, a subscription, or more trial time.'}</p>
          {contact.data?.email && <p className="text-sm">You can also email <a className="text-navy-500 underline" href={`mailto:${contact.data.email}`}>{contact.data.email}</a>.</p>}
          {error && <Alert tone="error">{error}</Alert>}
          <Textarea label="Message" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. We'd like to continue after the trial." />
          <Input label="Best way to reach you" maxLength={200} value={preferred} onChange={(e) => setPreferred(e.target.value)} />
        </div>
      )}
    </Modal>
  )
}
