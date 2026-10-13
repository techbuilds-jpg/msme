/** Date helpers. Business dates are calendar dates in the business's timezone (ISO yyyy-mm-dd strings). */

export function todayIn(tz: string, now = new Date()): string {
  // en-CA formats as yyyy-mm-dd
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type RangeKey = 'today' | 'week' | 'month' | 'custom'
export interface DateRange { from: string; to: string }

/** Today, this week (Monday–today) or this month (1st–today), in the business timezone. */
export function presetRange(key: Exclude<RangeKey, 'custom'>, tz: string, now = new Date()): DateRange {
  const today = todayIn(tz, now)
  if (key === 'today') return { from: today, to: today }
  if (key === 'week') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = Sunday
    return { from: addDays(today, -((dow + 6) % 7)), to: today }
  }
  return { from: `${today.slice(0, 8)}01`, to: today }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso)
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: iso.length === 10 ? 'UTC' : undefined }).format(d)
}

export function formatDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso))
}
