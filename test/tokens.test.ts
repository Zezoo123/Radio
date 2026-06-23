import { describe, expect, it } from 'vitest'
import { substituteDateTokens } from '@core/format/tokens'
import { serializeForDate } from '@core/format/expand'
import { emptyFormatSet, type HourFormat } from '@core/format/types'

// 2026-06-18 is a Thursday.
const DATE = { year: 2026, month: 6, day: 18 }

describe('date token substitution', () => {
  it('replaces date tokens for the export date', () => {
    expect(substituteDateTokens('NEWS[yymmdd]', DATE)).toBe('NEWS260618')
    expect(substituteDateTokens('[yyyymmdd]', DATE)).toBe('20260618')
    expect(substituteDateTokens('[mmddyy]', DATE)).toBe('061826')
    expect(substituteDateTokens('[ddmm]', DATE)).toBe('1806')
  })

  it('handles [Day] (full name) and [DayNum] (Mon=1…Sun=7)', () => {
    expect(substituteDateTokens('1234-[Day]', DATE)).toBe('1234-Thursday')
    expect(substituteDateTokens('[DayNum]', DATE)).toBe('4') // Thursday
    expect(substituteDateTokens('[DayNum]', { year: 2026, month: 6, day: 14 })).toBe('7') // Sunday
  })

  it('is case-insensitive and leaves unknown tokens untouched', () => {
    expect(substituteDateTokens('A[YYMMDD]B', DATE)).toBe('A260618B')
    expect(substituteDateTokens('keep [xyz] as-is', DATE)).toBe('keep [xyz] as-is')
  })
})

describe('serializeForDate', () => {
  it('derives the weekday and fills tokens', () => {
    const fmt: HourFormat = {
      id: 'f1',
      name: 'X',
      color: '#fff',
      rows: [{ minute: 0, second: 0, cue: '@', name: 'ID-[Day]', description: 'news [yymmdd]' }]
    }
    const set = emptyFormatSet()
    set.formats.push(fmt)
    // Assign to Thursday (weekday 4) at hour 9.
    set.grid.cells[4][9] = 'f1'

    const text = serializeForDate(set, DATE)
    expect(text).toBe('09:00:00|@|ID-Thursday||news 260618\r\n')
  })
})
