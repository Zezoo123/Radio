import { describe, expect, it } from 'vitest'
import { dayRows, expandFormatAtHour, serializeDay, serializeWeek } from '@core/format/expand'
import { emptyFormatSet, type FormatSet, type HourFormat } from '@core/format/types'
import { eventLine } from '@core/export/simian'

const topOfHour: HourFormat = {
  id: 'f1',
  name: 'Music hour',
  color: '#4f8cff',
  rows: [
    { minute: 0, second: 0, cue: '@', name: 'ID_TOP', category: 'FEA', description: 'Top of hour' },
    { minute: 20, second: 0, cue: '+', name: 'LINER_A' },
    { minute: 0, second: 30, cue: '+', name: 'SWEEP_1' }
  ]
}

describe('format expansion', () => {
  it('places rows at the assigned hour and sorts by time', () => {
    const events = expandFormatAtHour(topOfHour, 9)
    expect(events.map(eventLine)).toEqual([
      '09:00:00|@|ID_TOP|FEA|Top of hour',
      '09:00:30|+|SWEEP_1',
      '09:20:00|+|LINER_A'
    ])
  })

  it('emits 3-column rows when no category/description', () => {
    const e = expandFormatAtHour(topOfHour, 0)[1]
    expect(eventLine(e)).toBe('00:00:30|+|SWEEP_1')
  })

  it('fires hour-restricted rows only at their listed hours', () => {
    const clock: HourFormat = {
      id: 'd1',
      name: 'Default',
      color: '#4f8cff',
      rows: [
        { minute: 0, second: 0, cue: '+', name: 'EVERY_HOUR' },
        { hours: [7, 8, 9, 17], minute: 30, second: 0, cue: '+', name: 'DRIVE_TIME' },
        { hour: 12, minute: 15, second: 0, cue: '+', name: 'LEGACY_NOON' } // pre-migration shape
      ]
    }
    const names = (h: number): string[] => expandFormatAtHour(clock, h).map((e) => e.name)
    expect(names(7)).toEqual(['EVERY_HOUR', 'DRIVE_TIME'])
    expect(names(9)).toEqual(['EVERY_HOUR', 'DRIVE_TIME'])
    expect(names(10)).toEqual(['EVERY_HOUR'])
    expect(names(12)).toEqual(['EVERY_HOUR', 'LEGACY_NOON'])
    expect(names(17)).toEqual(['EVERY_HOUR', 'DRIVE_TIME'])
  })
})

describe('week grid → day rows', () => {
  function setWith(): FormatSet {
    const set = emptyFormatSet()
    set.formats.push(topOfHour)
    // Assign the format to Monday (1) hours 8 and 9.
    set.grid.cells[1][8] = 'f1'
    set.grid.cells[1][9] = 'f1'
    return set
  }

  it('expands every assigned hour, time-sorted across the day', () => {
    const events = dayRows(setWith(), 1)
    const times = events.map((e) => e.time)
    expect(times).toEqual(['08:00:00', '08:00:30', '08:20:00', '09:00:00', '09:00:30', '09:20:00'])
  })

  it('serializes a day skeleton with CRLF and trailing newline', () => {
    const text = serializeDay(setWith(), 1)
    expect(text.startsWith('08:00:00|@|ID_TOP|FEA|Top of hour')).toBe(true)
    expect(text.endsWith('\r\n')).toBe(true)
  })

  it('serializes the full week with one labeled block per weekday', () => {
    const text = serializeWeek(setWith())
    expect(text).toContain('|||COMMENT|Mon')
    expect(text).toContain('|||COMMENT|Sun')
    expect((text.match(/\|\|\|COMMENT\|(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/g) ?? []).length).toBe(7)
  })
})
