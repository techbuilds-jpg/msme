import { Link } from 'react-router-dom'
import { PRODUCT_NAME } from '@/app/config'

/** DRAFT notice prepared with the Philippine Data Privacy Act (RA 10173) in mind. Must be reviewed before launch. */
export function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6">
      <Link to="/" className="text-navy-500 underline">← Back</Link>
      <h1 className="mt-4 text-2xl font-semibold">Privacy notice (draft)</h1>
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
        Draft for review. The platform operator must confirm its identity, Data Protection Officer contact and retention
        periods before this notice is used with real customers.
      </p>
      <h2 className="mt-6 text-lg font-semibold">What we collect</h2>
      <p>Your name, email address, optional phone number and the business information you enter. Business owners also
        enter records about their own customers, employees, sales and expenses; the business is responsible for that data
        and the platform processes it on the business's behalf.</p>
      <h2 className="mt-6 text-lg font-semibold">Why</h2>
      <p>To provide {PRODUCT_NAME}: sign-in, keeping each business's records separate and secure, the free trial, and support you ask for.</p>
      <h2 className="mt-6 text-lg font-semibold">How it is protected</h2>
      <p>Each business's records are isolated at the database level. Receipts are stored in private storage. Sensitive
        actions are logged. Platform staff cannot read a business's records unless its owner grants temporary support access.</p>
      <h2 className="mt-6 text-lg font-semibold">Where and how long</h2>
      <p>Data is hosted by Supabase in Singapore. After a trial ends, records are kept read-only for a limited retention
        period and are not deleted automatically without notice. Owners can export their data.</p>
      <h2 className="mt-6 text-lg font-semibold">Your rights</h2>
      <p>You may ask to access, correct or delete your personal data, and you may object to processing, by contacting the platform operator.</p>
    </main>
  )
}
