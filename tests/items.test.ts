import { describe, expect, it } from 'vitest'
import { itemsSubtotal, parseItems, type ItemDraft } from '../src/lib/items'

const d = (description: string, quantity: string, price: string): ItemDraft =>
  ({ key: description + quantity + price, description, quantity, price, item_type: 'service', catalog_item_id: null })

describe('line items', () => {
  it('parses valid rows and skips blank ones', () => {
    const r = parseItems([d('Hemming', '3', '150'), d('', '1', '')])
    expect(r.error).toBeNull()
    expect(r.items).toEqual([{ description: 'Hemming', quantity: 3, unit_price_centavos: 15000, item_type: 'service', catalog_item_id: null }])
  })
  it('reports the first invalid row', () => {
    expect(parseItems([d('A', '0', '1')]).error).toMatch(/Line 1/)
    expect(parseItems([d('A', '1', '1'), d('B', '1', '1.234')]).error).toMatch(/Line 2/)
    expect(parseItems([d('', '1', '5')]).error).toMatch(/description/)
  })
  it('computes the subtotal like the database', () => {
    expect(itemsSubtotal([d('A', '1.5', '3.33'), d('B', '2', '10')])).toBe(500 + 2000)
  })
})
