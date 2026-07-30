import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  eventsForDate,
  parseElementTemplate,
  parseElementWorkbook,
  sectionForDate,
  templateGrid,
  type ElementTemplate
} from '@core/parsers/elementTemplate'
import { serialize } from '@core/export/simian'
import { dateRange } from '@core/dates'
import type { ScheduleDay } from '@core/types'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)

describe('element template parser', () => {
  it('reads group, code and day columns from Karama.xlsx', async () => {
    const tpl = await parseElementTemplate(fixture('Karama.xlsx'))
    expect(tpl.group).toBe('Karama')
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
    const tpl = await parseElementTemplate(fixture('Karama.xlsx'))

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

  it('splits multi-value cells (`A B`) into one event per track', () => {
    const tpl: ElementTemplate = {
      group: 'Promo',
      code: 'ADS_1734',
      dayColumns: [{ col: 2, day: 1, month: 6, year: 2026 }],
      timeRows: [{ time: '09:20:02', tracks: new Map([[2, 'A B']]) }]
    }
    const events = eventsForDate(tpl, { year: 2026, month: 6, day: 1 })
    expect(events.map((e) => `${e.time}|${e.name}`)).toEqual([
      '09:20:02|ADS_1734-A',
      '09:20:02|ADS_1734-B'
    ])
  })

  it('keeps multi-character track tokens whole (`F01 F02` → CODE-F01, CODE-F02)', () => {
    const tpl: ElementTemplate = {
      group: 'FEA 306',
      code: 'RH260630',
      dayColumns: [{ col: 2, day: 30, month: 6, year: 2026 }],
      timeRows: [
        { time: '08:20:00', tracks: new Map([[2, 'F01 F02']]) },
        { time: '09:20:00', tracks: new Map([[2, '1']]) }
      ]
    }
    const events = eventsForDate(tpl, { year: 2026, month: 6, day: 30 })
    expect(events.map((e) => e.name)).toEqual(['RH260630-F01', 'RH260630-F02', 'RH260630'])
    // The grid reports the real tokens — never single characters — so the
    // Booking tracks panel can build correct file names from them.
    expect(templateGrid(tpl).tracks).toEqual(['1', 'F01', 'F02'])
  })

  it('condenses the grid by hour: sorted letters per cell, play counts', () => {
    const tpl: ElementTemplate = {
      group: 'Promo',
      code: 'ADS_1710',
      dayColumns: [
        { col: 3, day: 2, month: 6, year: 2026 }, // out of order on purpose
        { col: 2, day: 1, month: 6, year: 2026 }
      ],
      timeRows: [
        // Three plays inside hour 09 on day 1 (B before A to prove sorting),
        // one of them a multi-value cell; day 2 gets one play at 09:50.
        { time: '09:20:00', tracks: new Map([[2, 'B']]) },
        {
          time: '09:40:00',
          tracks: new Map([
            [2, 'A B'],
            [3, 'C']
          ])
        },
        { time: '17:00:00', tracks: new Map([[2, 'B']]) }
      ]
    }
    const grid = templateGrid(tpl)
    expect(grid.days.map((d) => `${d.iso} ${d.weekday}`)).toEqual([
      '2026-06-01 Mon',
      '2026-06-02 Tue'
    ])
    // Hour rows, minutes gone; letters aggregated + compressed within the hour.
    expect(grid.rows.map((r) => r.time)).toEqual(['09:00', '17:00'])
    expect(grid.rows[0].cells).toEqual(['A 2B', 'C'])
    expect(grid.rows[1].cells).toEqual(['B', null])
    // Counts are plays (letters), not filled cells.
    expect(grid.rows.map((r) => r.count)).toEqual([4, 1])
    expect(grid.totals).toEqual([4, 1])
  })

  it('keeps single plays as a bare letter: 3×A, 1×B, 2×C → `3A B 2C`', async () => {
    const { formatHourCell } = await import('@core/parsers/elementTemplate')
    expect(formatHourCell(['A', 'C', 'B', 'A', 'C', 'A'])).toBe('3A B 2C')
    expect(formatHourCell(['A'])).toBe('A')
  })

  it('shows `1`-sentinel plays as a count, and mixes cleanly with letters', () => {
    const tpl: ElementTemplate = {
      group: 'Promo',
      code: 'FEA_0817',
      dayColumns: [{ col: 2, day: 1, month: 6, year: 2026 }],
      timeRows: [
        { time: '09:10:00', tracks: new Map([[2, '1']]) },
        { time: '09:40:00', tracks: new Map([[2, '1']]) },
        { time: '11:20:00', tracks: new Map([[2, '1']]) },
        { time: '14:15:00', tracks: new Map([[2, '1 A']]) }
      ]
    }
    const grid = templateGrid(tpl)
    expect(grid.rows.map((r) => [r.time, r.cells[0]])).toEqual([
      ['09:00', '2'], // two bare-code plays → the count, never `11`
      ['11:00', '1'],
      ['14:00', '1 A'] // sentinel count first, then track letters
    ])
    expect(grid.totals).toEqual([5])
  })

  it('emits the template category on every event (Simian Category column)', async () => {
    const tpl = await parseElementTemplate(fixture('Karama.xlsx'))
    tpl.category = 'AUDIO'
    const line = serialize([
      {
        year: 2026,
        month: 6,
        day: 1,
        sections: [sectionForDate(tpl, { year: 2026, month: 6, day: 1 })]
      }
    ])
    expect(line).toContain('08:20:01|+|ADS_1710-A|AUDIO|')
  })
})

describe('Simian export — Karama golden file', () => {
  it('reproduces the full month byte-for-byte (underscore convention)', async () => {
    const tpl = await parseElementTemplate(fixture('Karama.xlsx'))

    const days: ScheduleDay[] = dateRange(
      { year: 2026, month: 6, day: 1 },
      { year: 2026, month: 6, day: 30 }
    ).map((date) => ({ ...date, sections: [sectionForDate(tpl, date)] }))

    const output = serialize(days)
    const expected = readFileSync(fixture('Karama.expected.txt'), 'utf-8')

    expect(output).toBe(expected)
  })
})
