import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PRODUCT_NAME } from '@/app/config'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-6 text-sm font-semibold uppercase tracking-wider text-navy-900">{PRODUCT_NAME}</Link>
      <main className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
      {footer && <div className="mt-4 text-sm text-slate-600">{footer}</div>}
    </div>
  )
}
