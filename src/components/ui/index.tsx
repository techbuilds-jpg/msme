import { clsx } from 'clsx'
import { AlertCircle, CheckCircle2, Info, Loader2, X, Inbox } from 'lucide-react'
import {
  forwardRef, useEffect, useId, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { Link, type LinkProps } from 'react-router-dom'

export { clsx as cx }

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-700',
  secondary: 'bg-navy-100 text-navy-900 hover:bg-navy-100/70',
  outline: 'border border-slate-300 bg-white text-navy-900 hover:bg-surface',
  ghost: 'text-navy-700 hover:bg-navy-100',
  danger: 'bg-red-700 text-white hover:bg-red-600',
}
const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
}
export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) =>
  clsx('inline-flex items-center justify-center rounded-md font-medium disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
    variants[variant], sizes[size], extra)

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label} {required && <span className="text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {children(id, describedBy)}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapperClassName?: string }
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, required, wrapperClassName, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(id, describedBy) => (
        <input ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required}
          className={clsx('input', error && 'input-error', className)} {...rest} />
      )}
    </Field>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapperClassName?: string }
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, required, wrapperClassName, className, rows = 3, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(id, describedBy) => (
        <textarea ref={ref} id={id} rows={rows} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required}
          className={clsx('input', error && 'input-error', className)} {...rest} />
      )}
    </Field>
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapperClassName?: string }
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, required, wrapperClassName, className, children, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(id, describedBy) => (
        <select ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required}
          className={clsx('input pr-8', error && 'input-error', className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  )
})

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; error?: string }
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, error, className, ...rest }, ref) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-start gap-3 text-sm text-ink cursor-pointer">
        <input ref={ref} id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-navy-900" aria-invalid={!!error || undefined} {...rest} />
        <span>{label}</span>
      </label>
      {error && <p role="alert" className="mt-1 ml-7 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
export function Card({ className, children, title, actions, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && 'p-4 sm:p-5')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneClass = { default: 'text-navy-900', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' }[tone]
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={clsx('mt-1 text-2xl font-bold tabular-nums', toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status & feedback
// ---------------------------------------------------------------------------
const toneClasses: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  orange: 'bg-orange-50 text-orange-800 ring-orange-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  navy: 'bg-navy-100 text-navy-900 ring-navy-100',
}
export function Badge({ tone = 'slate', children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', toneClasses[tone] ?? toneClasses.slate, className)}>
      {children}
    </span>
  )
}

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={clsx('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="size-5 animate-spin text-navy-500" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-navy-100 p-3 text-navy-500">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="font-semibold text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'info', title, children, className, onClose }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: ReactNode; children?: ReactNode; className?: string; onClose?: () => void }) {
  const cfg = {
    info: { cls: 'bg-navy-100 border-navy-100 text-navy-900', Icon: Info },
    success: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-900', Icon: CheckCircle2 },
    warning: { cls: 'bg-amber-50 border-amber-200 text-amber-900', Icon: AlertCircle },
    error: { cls: 'bg-red-50 border-red-200 text-red-900', Icon: AlertCircle },
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-md border p-3 text-sm', cfg.cls, className)}>
      <cfg.Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5')}>{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="py-8">
      <Alert tone="error" title="Something went wrong">
        <p>{errorMessage(error)}</p>
        {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
      </Alert>
    </div>
  )
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Unknown error'
}

// ---------------------------------------------------------------------------
// Modal (native <dialog> for focus trapping and Escape handling)
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose() }}
      className={clsx('m-auto w-[calc(100%-2rem)] rounded-lg bg-white p-0 shadow-lg backdrop:bg-navy-900/40', width)}>
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={clsx('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
            value === t.value ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-900')}>
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table wrapper with built-in loading / error / empty states
// ---------------------------------------------------------------------------
export function DataTable<T>({ rows, columns, loading, error, onRetry, empty, rowKey, onRowClick }: {
  rows: T[] | null | undefined
  columns: { header: ReactNode; cell: (row: T) => ReactNode; className?: string }[]
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (loading && !rows) return <Spinner />
  if (!rows?.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} className={c.className}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx(onRowClick && 'cursor-pointer hover:bg-surface')}>
              {columns.map((c, i) => <td key={i} className={c.className}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
