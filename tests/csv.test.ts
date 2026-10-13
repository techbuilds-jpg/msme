import { describe, expect, it } from 'vitest'
import { toCsv } from '../src/lib/csv'

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: 'line\nbreak' }])).toBe('a,b,c\r\n"x,y","say ""hi""","line\nbreak"')
  })
  it('neutralises spreadsheet formulas', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: '+63 917', c: '-5', d: '@x' }])).toBe("a,b,c,d\r\n'=SUM(A1),'+63 917,'-5,'@x")
  })
  it('keeps numbers as numbers', () => {
    expect(toCsv([{ amount: -12.5, n: 3 }])).toBe('amount,n\r\n-12.5,3')
  })
})
