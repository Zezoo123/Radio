import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { arabicTimeTo24, parseEsaMonthHtml } from '@core/prayer/esaTimes'
import { calibratedAzanTimes, fitBiases, rawAzanSeconds } from '@core/prayer/calibrate'
import { PRAYER_ORDER, type PrayerName } from '@core/prayer/azan'
import type { AzanTimes } from '@core/prayer/azan'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)

// The full official Cairo year as fetched from esa.gov.eg (parsed form).
const YEAR: { date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] =
  JSON.parse(readFileSync(fixture('esa-cairo-2026.json'), 'utf-8'))

const toStore = (): Record<string, AzanTimes> =>
  Object.fromEntries(
    YEAR.map((d) => [
      d.date,
      {
        fajr: d.fajr + ':00',
        dhuhr: d.dhuhr + ':00',
        asr: d.asr + ':00',
        maghrib: d.maghrib + ':00',
        isha: d.isha + ':00'
      }
    ])
  )

describe('ESA month parser', () => {
  it('converts Arabic 12-hour times', () => {
    expect(arabicTimeTo24('5:2 ص')).toBe('05:02:00')
    expect(arabicTimeTo24('12:55 م')).toBe('12:55:00')
    expect(arabicTimeTo24('12:10 ص')).toBe('00:10:00')
    expect(arabicTimeTo24('7:18 م')).toBe('19:18:00')
    expect(arabicTimeTo24('nope')).toBeNull()
  })

  it('parses the committed September page: 30 days, correct first day', () => {
    const days = parseEsaMonthHtml(readFileSync(fixture('esa-cairo-2026-09.html'), 'utf-8'))
    expect(days).toHaveLength(30)
    expect(days[0].date).toBe('2026-09-01')
    expect(days[0].times).toEqual({
      fajr: '05:02:00',
      dhuhr: '12:55:00',
      asr: '16:29:00',
      maghrib: '19:18:00',
      isha: '20:38:00'
    })
    // Every parsed time is a well-formed HH:MM:00.
    for (const d of days)
      for (const p of PRAYER_ORDER) expect(d.times[p]).toMatch(/^\d{2}:\d{2}:00$/)
  })

  it('returns [] for HTML without a table (failed postback)', () => {
    expect(parseEsaMonthHtml('<html><body>error</body></html>')).toEqual([])
  })
})

describe('calibrated fallback vs the official year', () => {
  const biases = fitBiases(toStore())

  it('fits sane per-prayer biases (seconds, dhuhr strongly negative)', () => {
    expect(biases.dhuhr).toBeLessThan(-50)
    expect(biases.dhuhr).toBeGreaterThan(-90)
    for (const p of PRAYER_ORDER) expect(Math.abs(biases[p])).toBeLessThan(120)
  })

  it('matches the official tables almost everywhere, never off by more than a minute', () => {
    const off: Record<PrayerName, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
    for (const d of YEAR) {
      const [y, m, day] = d.date.split('-').map(Number)
      const mine = calibratedAzanTimes({ year: y, month: m, day }, biases)
      for (const p of PRAYER_ORDER) {
        const want = (d as Record<string, string>)[p]
        const got = mine[p].slice(0, 5)
        if (got !== want) {
          off[p]++
          // never off by more than one minute
          const mins = (t: string): number => +t.slice(0, 2) * 60 + +t.slice(3, 5)
          expect(Math.abs(mins(got) - mins(want))).toBeLessThanOrEqual(1)
        }
      }
    }
    // Measured with the grid-search fit: dhuhr 1, fajr 15, maghrib 10,
    // isha 23, asr 117 (ESA's asr algorithm drifts seasonally beyond any
    // constant offset). Bounds leave a little slack so an adhan patch release
    // doesn't break the suite; a real regression blows well past them.
    expect(off.dhuhr).toBeLessThanOrEqual(5)
    expect(off.fajr + off.maghrib + off.isha).toBeLessThanOrEqual(60)
    expect(off.asr).toBeLessThanOrEqual(130)
  })

  it('rawAzanSeconds carries real seconds (unrounded)', () => {
    const raw = rawAzanSeconds({ year: 2026, month: 9, day: 1 })
    expect(Object.values(raw).some((s) => s % 60 !== 0)).toBe(true)
  })
})
