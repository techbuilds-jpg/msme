import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { emptyItem, type ItemDraft } from '@/lib/items'
import { formatMoney, lineTotal, parseMoney } from '@/lib/money'

export * from '@/lib/items'

interface CatalogOption { id: string; name: string; kind: 'product' | 'service'; unit_price_centavos: number }

export function LineItemsEditor({ value, onChange, catalog, currency, disabled }: {
  value: ItemDraft[]; onChange: (v: ItemDraft[]) => void; catalog?: CatalogOption[]; currency: string; disabled?: boolean
}) {
  const update = (key: string, patch: Partial<ItemDraft>) => onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const addFromCatalog = (id: string) => {
    const c = catalog?.find((x) => x.id === id)
    if (!c) return
    const blank = value.length === 1 && !value[0].description && !value[0].price
    const row: ItemDraft = { key: crypto.randomUUID(), description: c.name, quantity: '1', price: (c.unit_price_centavos / 100).toFixed(2), item_type: c.kind, catalog_item_id: c.id }
    onChange(blank ? [row] : [...value, row])
  }

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="label">Items</legend>
      <div className="hidden grid-cols-[1fr_7rem_6rem_8rem_7rem_2rem] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid">
        <span>Description</span><span>Type</span><span>Qty</span><span>Unit price</span><span className="text-right">Amount</span><span />
      </div>
      {value.map((d, i) => {
        const q = Number(d.quantity), p = parseMoney(d.price || '0')
        const amount = Number.isFinite(q) && q > 0 && p != null ? lineTotal(q, p) : null
        return (
          <div key={d.key} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[1fr_7rem_6rem_8rem_7rem_2rem] md:items-center md:border-0 md:p-0">
            <input className="input col-span-2 md:col-span-1" aria-label={`Line ${i + 1} description`} placeholder="Product or service" value={d.description}
              onChange={(e) => update(d.key, { description: e.target.value, catalog_item_id: null })} maxLength={300} />
            <select className="input" aria-label={`Line ${i + 1} type`} value={d.item_type} onChange={(e) => update(d.key, { item_type: e.target.value as ItemDraft['item_type'] })}>
              <option value="service">Service</option>
              <option value="product">Product</option>
            </select>
            <input className="input" aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={d.quantity} onChange={(e) => update(d.key, { quantity: e.target.value })} />
            <input className="input" aria-label={`Line ${i + 1} unit price`} inputMode="decimal" placeholder="0.00" value={d.price} onChange={(e) => update(d.key, { price: e.target.value })} />
            <span className="self-center text-right text-sm tabular-nums">{amount == null ? '—' : formatMoney(amount, currency)}</span>
            <button type="button" className="justify-self-end rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:invisible" aria-label={`Remove line ${i + 1}`}
              disabled={value.length === 1} onClick={() => onChange(value.filter((x) => x.key !== d.key))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...value, emptyItem()])} disabled={value.length >= 100}>Add line</Button>
        {!!catalog?.length && (
          <select className="input w-auto py-1.5" aria-label="Add from price list" value="" onChange={(e) => addFromCatalog(e.target.value)}>
            <option value="">Add from price list…</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} — {formatMoney(c.unit_price_centavos, currency)}</option>)}
          </select>
        )}
      </div>
    </fieldset>
  )
}
