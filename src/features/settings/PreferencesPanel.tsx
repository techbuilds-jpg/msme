import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Input, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { updateBusinessSettings } from './api'

const MODULES: { key: string; label: string }[] = [
  { key: 'sales', label: 'Sales & Collections' }, { key: 'orders', label: 'Orders & Operations' }, { key: 'customers', label: 'Customers' },
  { key: 'expenses', label: 'Expenses' }, { key: 'employees', label: 'Employees' }, { key: 'reports', label: 'Reports' },
]
const KPIS: Record<string, string> = {
  total_sales: 'Total sales', collected: 'Collected payments', receivables: 'Outstanding receivables', expenses: 'Recorded expenses',
  net_cash: 'Net cash movement', open_orders: 'Open orders', completed_orders: 'Completed orders', active_customers: 'Active customers',
}

export function PreferencesPanel() {
  const { current, writable, reload } = useCurrentBusiness()
  const st = current.settings
  const [modules, setModules] = useState<string[]>(st.enabled_modules)
  const [kpis, setKpis] = useState<string[]>(st.dashboard_kpis)
  const [orderPrefix, setOrderPrefix] = useState(st.order_prefix)
  const [salePrefix, setSalePrefix] = useState(st.sale_prefix)
  const [maxDiscount, setMaxDiscount] = useState(String(st.max_discount_pct))
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const move = (k: string, dir: -1 | 1) => {
    const i = kpis.indexOf(k), j = i + dir
    if (j < 0 || j >= kpis.length) return
    const next = [...kpis]; [next[i], next[j]] = [next[j], next[i]]; setKpis(next)
  }
  const save = async () => {
    setMsg(null)
    const pct = Number(maxDiscount)
    if (!/^[A-Z0-9]{1,8}$/.test(orderPrefix) || !/^[A-Z0-9]{1,8}$/.test(salePrefix)) return setMsg({ tone: 'error', text: 'Prefixes use 1–8 capital letters or digits.' })
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return setMsg({ tone: 'error', text: 'The discount limit must be between 0 and 100.' })
    setSaving(true)
    try {
      await updateBusinessSettings(current.business.id, {
        enabled_modules: ['dashboard', ...modules.filter((m) => m !== 'dashboard')], dashboard_kpis: kpis,
        order_prefix: orderPrefix, sale_prefix: salePrefix, max_discount_pct: pct,
      })
      await reload()
      setMsg({ tone: 'success', text: 'Preferences saved.' })
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }) } finally { setSaving(false) }
  }

  return (
    <fieldset disabled={!writable} className="grid max-w-4xl gap-5 lg:grid-cols-2">
      {msg && <Alert tone={msg.tone} className="lg:col-span-2" onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Card title="Modules">
        <p className="mb-3 text-sm text-slate-600">Hide modules you don't use. Data is kept; hiding only removes the menu item.</p>
        <div className="space-y-2">
          {MODULES.map((m) => <Checkbox key={m.key} label={m.label} checked={modules.includes(m.key)}
            onChange={(e) => setModules(e.target.checked ? [...modules, m.key] : modules.filter((x) => x !== m.key))} />)}
        </div>
      </Card>
      <Card title="Dashboard figures">
        <p className="mb-3 text-sm text-slate-600">Choose which figures appear on the Overview, and their order.</p>
        <ul className="space-y-1">
          {[...kpis, ...Object.keys(KPIS).filter((k) => !kpis.includes(k))].map((k) => {
            const on = kpis.includes(k)
            return (
              <li key={k} className="flex items-center gap-2">
                <Checkbox label={KPIS[k]} checked={on} className="flex-1" onChange={(e) => setKpis(e.target.checked ? [...kpis, k] : kpis.filter((x) => x !== k))} />
                {on && <>
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-surface" aria-label={`Move ${KPIS[k]} up`} onClick={() => move(k, -1)}><ArrowUp className="size-4" /></button>
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-surface" aria-label={`Move ${KPIS[k]} down`} onClick={() => move(k, 1)}><ArrowDown className="size-4" /></button>
                </>}
              </li>
            )
          })}
        </ul>
      </Card>
      <Card title="Numbering">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Order prefix" maxLength={8} value={orderPrefix} onChange={(e) => setOrderPrefix(e.target.value.toUpperCase())} hint={`Next: ${orderPrefix}-000…`} />
          <Input label="Sale prefix" maxLength={8} value={salePrefix} onChange={(e) => setSalePrefix(e.target.value.toUpperCase())} hint="Internal reference, not a BIR receipt number" />
        </div>
      </Card>
      <Card title="Discounts">
        <Input label="Maximum discount for managers and employees (%)" inputMode="decimal" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)}
          hint="Owners are not limited. Employees also need the 'Give discounts' permission." />
      </Card>
      {writable && <div className="lg:col-span-2"><Button onClick={() => void save()} loading={saving}>Save preferences</Button></div>}
    </fieldset>
  )
}
