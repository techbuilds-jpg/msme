/** Money is stored as integer centavos. These helpers are the only place conversion happens. */

export function formatMoney(centavos: number | null | undefined, currency = 'PHP'): string {
  const v = (centavos ?? 0) / 100
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(v)
}

/** Parses user input such as "1,250.50" or "₱1250.5" into centavos. Returns null when invalid. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  const centavos = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(centavos) ? centavos : null
}

/** Line total rounded to the nearest centavo, mirroring the database's generated column. */
export function lineTotal(quantity: number, unitPriceCentavos: number): number {
  return Math.round(quantity * unitPriceCentavos)
}
