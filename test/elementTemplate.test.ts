import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  eventsForDate,
  parseElementTemplate,
  parseElementWorkbook,
  sectionForDate,
  type ElementTemplate
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
      '08:20:01|+|ADS_1710-A',
      '09:20:01|+|ADS_1710-A',
      '17:20:01|+|ADS_1710-A',
      '18:20:01|+|ADS_1710-A'
    ])

    // Day 5 (Fri): no spots scheduled.
    expect(eventsForDate(tpl, { year: 2026, month: 6, day: 5 })).toHaveLength(0)
  })

  it('treats a cell of "1" as "play the bare code once" (no track suffix)', () => {
    // Day 1 col -> a track letter; day 2 col -> the "1" sentinel.
    const tpl: ElementTemplate = {
      group: 'Promo',
      code: 'ADS_1710',
      dayColumns: [
        { col: 2, day: 1, month: 6, year: 2026 },
        { col: 3, day: 2, month: 6, year: 2026 }
      ],
      timeRows: [
        {
          time: '08:00:00',
          tracks: new Map([
            [2, 'A'],
            [3, '1']
          ])
        }
      ]
    }

    expect(eventsForDate(tpl, { year: 2026, month: 6, day: 1 })[0].name).toBe('ADS_1710-A')
    expect(eventsForDate(tpl, { year: 2026, month: 6, day: 2 })[0].name).toBe('ADS_1710')
  })

  it('pads 1-digit hours to HH:MM:SS so times sort and export correctly', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')
    ws.addRow(['Test', 6, 2026])
    ws.addRow(['ADS_9', 1])
    ws.addRow(['', 'M']) // weekday letters row
    ws.addRow(['17:20:01', 'A'])
    ws.addRow(['8:20:01', 'A']) // Excel time cell without a leading zero

    const tpl = parseElementWorkbook(wb)
    const events = eventsForDate(tpl, { year: 2026, month: 6, day: 1 })
    expect(events.map((e) => e.time)).toEqual(['08:20:01', '17:20:01'])
  })

  it('emits the template category on every event (Simian Category column)', async () => {
    const tpl = await parseElementTemplate(fixture('Baheya.xlsx'))
    tpl.category = 'AUDIO'
    const line = serialize([
      { year: 2026, month: 6, day: 1, sections: [sectionForDate(tpl, { year: 2026, month: 6, day: 1 })] }
    ])
    expect(line).toContain('08:20:01|+|ADS_1710-A|AUDIO|')
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
