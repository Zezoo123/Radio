import { describe, expect, it } from 'vitest'
import { dayRows } from '@core/format/expand'
import { resolveForDate } from '@core/format/resolveDay'
import { emptyFormatSet, type HourFormat } from '@core/format/types'
import { mulberry32 } from '@core/sequential/rng'

// 2026-06-24 is a Wednesday (weekday 3).
const WED = { year: 2026, month: 6, day: 24 }

describe('default 24-hour day', () => {
  it('layers the default day (per-hour) under the grid, applied to every weekday', () => {
    const morning: HourFormat = {
      id: 'm',
      name: 'Morning',
      color: '#fff',
      rows: [{ minute: 0, second: 0, cue: '@', name: 'MORNING_ID' }]
    }
    const night: HourFormat = {
      id: 'n',
      name: 'Night',
      color: '#fff',
      rows: [{ minute: 0, second: 0, cue: '@', name: 'NIGHT_ID' }]
    }
    const special: HourFormat = {
      id: 'sp',
      name: 'Special',
      color: '#fff',
      rows: [{ minute: 30, second: 0, cue: '+', name: 'SHOW' }]
    }
    const set = emptyFormatSet()
    set.formats.push(morning, night, special)
    // Default day: different formats per hour (not the same every hour).
    set.defaultDay![8] = 'm'
    set.defaultDay![23] = 'n'
    set.grid.cells[3][8] = 'sp' // Wednesday adds a show at 08:30

    // The default applies to EVERY weekday (check two different ones).
    for (const wd of [1, 3]) {
      const events = dayRows(set, wd)
      expect(events.some((e) => e.time === '08:00:00' && e.name === 'MORNING_ID')).toBe(true)
      expect(events.some((e) => e.time === '23:00:00' && e.name === 'NIGHT_ID')).toBe(true)
    }
    // Wednesday also has the grid's show layered on top at 08:30.
    const wed = dayRows(set, 3)
    expect(wed.some((e) => e.time === '08:30:00' && e.name === 'SHOW')).toBe(true)
    // Hours with no default and no grid format stay empty (e.g. 03:00).
    expect(dayRows(set, 1).some((e) => e.time.startsWith('03:'))).toBe(false)
  })
})

describe('[NEXT] token — load next day’s log', () => {
  it("resolves date tokens for the next day and strips [NEXT]", () => {
    const lastHour: HourFormat = {
      id: 'last',
      name: 'Last hour',
      color: '#fff',
      rows: [
        { minute: 59, second: 59, cue: '+', name: '', category: 'LOG', description: '[MMDDYY]C1 [NEXT]' }
      ]
    }
    const set = emptyFormatSet()
    set.formats.push(lastHour)
    set.grid.cells[3][23] = 'last' // Wednesday, last hour

    const { text } = resolveForDate(set, WED, [], mulberry32(1))
    // Export date Wed 2026-06-24 → next day 2026-06-25 → MMDDYY = 06 25 26
    expect(text).toContain('23:59:59|+||LOG|062526C1')
  })

  it('a normal date token still uses the export date', () => {
    const fmt: HourFormat = {
      id: 'f',
      name: 'F',
      color: '#fff',
      rows: [{ minute: 0, second: 0, cue: '+', name: 'TODAY[MMDDYY]' }]
    }
    const set = emptyFormatSet()
    set.formats.push(fmt)
    set.grid.cells[3][8] = 'f'
    const { text } = resolveForDate(set, WED, [], mulberry32(1))
    expect(text).toContain('08:00:00|+|TODAY062426') // export date 2026-06-24 → 06 24 26
  })
})
