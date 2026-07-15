import { describe, expect, it } from 'vitest'
import { PRAYER_ORDER, azanTimes } from '@core/prayer/azan'

describe('azan computation (Cairo / Egyptian GAS)', () => {
  it('matches the known computed times for 2026-06-18', () => {
    const t = azanTimes({ year: 2026, month: 6, day: 18 })
    expect(t).toEqual({
      fajr: '04:08:00',
      dhuhr: '12:57:00',
      asr: '16:32:00',
      maghrib: '19:59:00',
      isha: '21:32:00'
    })
  })

  it('returns the 5 prayers in chronological order', () => {
    const t = azanTimes({ year: 2026, month: 6, day: 18 })
    const times = PRAYER_ORDER.map((p) => t[p])
    const sorted = [...times].sort()
    expect(times).toEqual(sorted)
  })
})
