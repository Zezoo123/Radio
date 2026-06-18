import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  eventsForDate,
  parseElementTemplate,
  sectionForDate
} from '@core/parsers/elementTemplate'
import { serialize } from '@core/export/simian'
import { dateRange } from '@core/dates'
import type { ScheduleDay } from '@core/types'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)

describe('element template parser', () => {
  it('reads group, code and day columns from Baheya.xlsx', async () => {
    const tpl = await parseElementTemplate(fixture('Baheya.xlsx'))
    expect(tpl.group).toBe('Baheya')
    expect(tpl.code).toBe('ADS_1710')
    expect(tpl.dayColumns).toHaveLength(30) // June has 30 days
    expect(tpl.timeRows.map((r) => r.time)).toEqual([
      '08:20:01',
      '09:20:01',
      '17:20:01',
      '18:20:01'
    ])
  })

  it('builds underscore file names and skips blank days', async () => {
    const tpl = await parseElementTemplate(fixture('Baheya.xlsx'))

    // Day 1 (Mon): all four times play track A.
    const d1 = eventsForDate(tpl, { year: 2026, month: 6, day: 1 })
    expect(d1.map((e) => `${e.time}|${e.cue}|${e.name}`)).toEqual([
      '08:20:01|+|ADS_1710_A',
      '09:20:01|+|ADS_1710_A',
      '17:20:01|+|ADS_1710_A',
      '18:20:01|+|ADS_1710_A'
    ])

    // Day 5 (Fri): no spots scheduled.
    expect(eventsForDate(tpl, { year: 2026, month: 6, day: 5 })).toHaveLength(0)
  })
})

describe('Simian export — Baheya golden file', () => {
  it('reproduces the full month byte-for-byte (underscore convention)', async () => {
    const tpl = await parseElementTemplate(fixture('Baheya.xlsx'))

    const days: ScheduleDay[] = dateRange(
      { year: 2026, month: 6, day: 1 },
      { year: 2026, month: 6, day: 30 }
    ).map((date) => ({ ...date, sections: [sectionForDate(tpl, date)] }))

    const output = serialize(days)
    const expected = readFileSync(fixture('Baheya.expected.txt'), 'utf-8')

    expect(output).toBe(expected)
  })
})
