import { describe, expect, it } from 'vitest'
import { dayRows } from '@core/format/expand'
import { resolveForDate } from '@core/format/resolveDay'
import { emptyFormatSet, type HourFormat } from '@core/format/types'
import { mulberry32 } from '@core/sequential/rng'

// 2026-06-24 is a Wednesday (weekday 3).
const WED = { year: 2026, month: 6, day: 24 }

describe('default clocks (one clock applies to a whole day)', () => {
  const base: HourFormat = {
    id: 'base',
    name: 'Base',
    color: '#fff',
    rows: [{ minute: 0, second: 0, cue: '@', name: 'ID' }] // top-of-hour ID
  }
  const special: HourFormat = {
    id: 'sp',
    name: 'Special',
    color: '#fff',
    rows: [{ minute: 30, second: 0, cue: '+', name: 'SHOW' }]
  }

  it('applies the chosen default clock to every hour, layered under the grid', () => {
    const set = emptyFormatSet()
    set.formats.push(special)
    set.defaultClocks!.push(base)
    set.dayDefaults![3] = 'base' // Wednesday uses Base as its default
    set.grid.cells[3][9] = 'sp' // and a show at 09:30

    const events = dayRows(set, 3)
    expect(events.filter((e) => e.name === 'ID')).toHaveLength(24) // every hour
    expect(events.some((e) => e.time === '09:30:00' && e.name === 'SHOW')).toBe(true)
  })

  it('a row pinned to a specific hour fires only at that hour', () => {
    const set = emptyFormatSet()
    set.defaultClocks!.push({
      id: 'd',
      name: 'D',
      color: '#fff',
      rows: [
        { minute: 0, second: 0, cue: '@', name: 'EVERY' }, // every hour
        { hour: 6, minute: 30, second: 0, cue: '+', name: 'WAKEUP' } // 06:30 only
      ]
    })
    set.dayDefaults![3] = 'd'
    const events = dayRows(set, 3)
    expect(events.filter((e) => e.name === 'EVERY')).toHaveLength(24)
    const wake = events.filter((e) => e.name === 'WAKEUP')
    expect(wake).toHaveLength(1)
    expect(wake[0].time).toBe('06:30:00')
  })

  it('only days that opt in get a default (different days can differ)', () => {
    const set = emptyFormatSet()
    set.defaultClocks!.push(base)
    set.dayDefaults![3] = 'base' // Wed has it
    set.dayDefaults![1] = null // Mon has none
    expect(dayRows(set, 3).filter((e) => e.name === 'ID')).toHaveLength(24)
    expect(dayRows(set, 1)).toHaveLength(0)
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

  it('is row-level: name (log filename) + description both advance to next day', () => {
    const set = emptyFormatSet()
    set.defaultClocks!.push({
      id: 'd',
      name: 'D',
      color: '#fff',
      rows: [
        {
          hour: 23,
          minute: 59,
          second: 59,
          cue: '+',
          name: 'H[YYMMDD]',
          category: 'LOG',
          description: '[Day] [YYMMDD] Log [NEXT]'
        }
      ]
    })
    set.dayDefaults![3] = 'd' // Wednesday 2026-06-24 → next day Thu 2026-06-25
    const { text } = resolveForDate(set, WED, [], mulberry32(1))
    expect(text).toContain('23:59:59|+|H260625|LOG|Thursday 260625 Log')
  })

  it('a next-day date token ([TOKEN][NEXT]) strips cleanly to the next-day date', () => {
    const set = emptyFormatSet()
    set.defaultClocks!.push({
      id: 'd',
      name: 'D',
      color: '#fff',
      rows: [
        { hour: 23, minute: 59, second: 59, cue: '+', name: 'H[YYMMDD][NEXT]', category: 'LOG' }
      ]
    })
    set.dayDefaults![3] = 'd'
    const { text } = resolveForDate(set, WED, [], mulberry32(1))
    expect(text).toContain('23:59:59|+|H260625|LOG|') // clean, no stray spaces / no [NEXT]
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
