import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeDay, composeRange, exportRange } from '@core/schedule/compose'
import { parseElementTemplate } from '@core/parsers/elementTemplate'
import { dateHeaderLine, sectionHeaderLine } from '@core/export/simian'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)
const SUNDAY = { year: 2026, month: 6, day: 7 }

describe('compose — section-grouped day', () => {
  it('builds one section per element template', async () => {
    const baheya = await parseElementTemplate(fixture('Baheya.xlsx'))

    const { days } = composeDay(SUNDAY, { templates: [baheya] })

    const day = days[0]
    expect(day.sections).toHaveLength(1)
    expect(day.sections[0].code).toBe('ADS_1710')
    expect(day.sections[0].events.length).toBeGreaterThan(0)
  })

  it('exports a date range with one date header per day', async () => {
    const baheya = await parseElementTemplate(fixture('Baheya.xlsx'))
    const { text } = exportRange(
      { year: 2026, month: 6, day: 1 },
      { year: 2026, month: 6, day: 3 },
      { templates: [baheya] }
    )
    // three date headers, three Baheya section headers
    const dateHeaders = [1, 2, 3].map((d) => dateHeaderLine(2026, 6, d))
    for (const h of dateHeaders) expect(text).toContain(h)
    const sectionCount = text.split(sectionHeaderLine('ADS_1710', 'Baheya')).length - 1
    expect(sectionCount).toBe(3)
    expect(text.endsWith('\r\n')).toBe(true)
  })

  it('rewrites every athan row Category to athanCategory', () => {
    const athan = [
      '04:10:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '04:10:02|+|AZ22-01RB|FEA|AZAN فجر'
    ]
    const { days } = composeDay(SUNDAY, {
      athanLinesForDate: () => athan,
      athanCategory: 'ATHAN'
    })
    expect(days[0].athanLines).toEqual([
      '04:10:00|@||ATHAN|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '04:10:02|+|AZ22-01RB|ATHAN|AZAN فجر'
    ])
  })

  it('leaves athan rows verbatim when athanCategory is unset', () => {
    const athan = ['04:10:02|+|AZ22-01RB|FEA|AZAN فجر']
    const { days } = composeDay(SUNDAY, { athanLinesForDate: () => athan })
    expect(days[0].athanLines).toEqual(athan)
  })

  it('emits formatLinesForDate clock rows right after the date header', async () => {
    const baheya = await parseElementTemplate(fixture('Baheya.xlsx'))
    const { text } = exportRange(SUNDAY, SUNDAY, {
      templates: [baheya],
      formatLinesForDate: () => ['06:00:00|+|STATION_ID', '06:00:05|@|TOH_ID']
    })
    const lines = text.split('\r\n')
    // 3-line date header block, then the two clock rows, before any section header.
    expect(lines[3]).toBe('06:00:00|+|STATION_ID')
    expect(lines[4]).toBe('06:00:05|@|TOH_ID')
    const clockIdx = lines.indexOf('06:00:00|+|STATION_ID')
    const sectionIdx = lines.findIndex((l) => l.startsWith('||||| '))
    expect(clockIdx).toBeLessThan(sectionIdx)
  })

  it('composeRange covers every day inclusive', async () => {
    const baheya = await parseElementTemplate(fixture('Baheya.xlsx'))
    const { days } = composeRange(
      { year: 2026, month: 6, day: 1 },
      { year: 2026, month: 6, day: 30 },
      { templates: [baheya] }
    )
    expect(days).toHaveLength(30)
  })
})
