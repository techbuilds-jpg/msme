import { lineTotal, parseMoney } from './money'

/** Shape sent to save_order / create_sale. */
export interface ItemInput {
  description: string
  quantity: number
  unit_price_centavos: number
  item_type: 'product' | 'service'
  catalog_item_id: string | null
}

/** Editable row: price and quantity are kept as typed text until submit. */
export interface ItemDraft {
  key: string
  description: string
  quantity: string
  price: string
  item_type: 'product' | 'service'
  catalog_item_id: string | null
}

export const emptyItem = (): ItemDraft => ({ key: crypto.randomUUID(), description: '', quantity: '1', price: '', item_type: 'service', catalog_item_id: null })

export function draftFromItem(i: { description: string; quantity: number; unit_price_centavos: number; item_type: string; catalog_item_id?: string | null }): ItemDraft {
  return {
    key: crypto.randomUUID(), description: i.description, quantity: String(Number(i.quantity)),
    price: (i.unit_price_centavos / 100).toFixed(2), item_type: i.item_type === 'product' ? 'product' : 'service', catalog_item_id: i.catalog_item_id ?? null,
  }
}

/** Validates drafts. Returns items or a message for the first problem. Blank rows are ignored. */
export function parseItems(drafts: ItemDraft[]): { items: ItemInput[]; error: string | null } {
  const items: ItemInput[] = []
  for (const [idx, d] of drafts.entries()) {
    if (!d.description.trim() && !d.price.trim()) continue
    const n = idx + 1
    if (!d.description.trim()) return { items, error: `Line ${n}: enter a description.` }
    const qty = Number(d.quantity)
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000 || !/^\d+(\.\d{1,3})?$/.test(d.quantity.trim())) return { items, error: `Line ${n}: enter a quantity above zero (up to 3 decimals).` }
    const price = d.price.trim() === '' ? 0 : parseMoney(d.price)
    if (price == null) return { items, error: `Line ${n}: enter a valid price, e.g. 250 or 250.50.` }
    items.push({ description: d.description.trim().slice(0, 300), quantity: qty, unit_price_centavos: price, item_type: d.item_type, catalog_item_id: d.catalog_item_id })
  }
  return { items, error: null }
}

export function itemsSubtotal(drafts: ItemDraft[]): number {
  return drafts.reduce((sum, d) => {
    const q = Number(d.quantity), p = parseMoney(d.price || '0')
    return Number.isFinite(q) && q > 0 && p != null ? sum + lineTotal(q, p) : sum
  }, 0)
}

