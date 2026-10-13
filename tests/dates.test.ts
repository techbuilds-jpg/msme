import { describe, expect, it } from 'vitest'
import { addDays, presetRange, todayIn } from '../src/lib/dates'

describe('dates', () => {
  // 2026-10-13 23:30 UTC is already 2026-10-14 in Manila (UTC+8)
  const now = new Date('2026-10-13T23:30:00Z')
  it('uses the business timezone for today', () => {
    expect(todayIn('Asia/Manila', now)).toBe('2026-10-14')
    expect(todayIn('UTC', now)).toBe('2026-10-13')
  })
  it('builds preset ranges', () => {
    expect(presetRange('today', 'Asia/Manila', now)).toEqual({ from: '2026-10-14', to: '2026-10-14' })
    expect(presetRange('week', 'Asia/Manila', now)).toEqual({ from: '2026-10-12', to: '2026-10-14' }) // Monday
    expect(presetRange('month', 'Asia/Manila', now)).toEqual({ from: '2026-10-01', to: '2026-10-14' })
  })
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
