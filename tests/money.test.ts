import { describe, expect, it } from 'vitest'
import { formatMoney, lineTotal, parseMoney } from '../src/lib/money'

describe('money', () => {
  it('parses common inputs into centavos', () => {
    expect(parseMoney('1,250.50')).toBe(125050)
    expect(parseMoney('₱ 99')).toBe(9900)
    expect(parseMoney('0.5')).toBe(50)
    expect(parseMoney('12.345')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })
  it('formats PHP', () => {
    expect(formatMoney(125050)).toMatch(/1,250\.50/)
  })
  it('rounds line totals like the database', () => {
    expect(lineTotal(1.5, 333)).toBe(500)
    expect(lineTotal(3, 1999)).toBe(5997)
  })
})
