import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeDay, composeRange, exportRange } from '@core/schedule/compose'
import { parseElementTemplate } from '@core/parsers/elementTemplate'
import { parseStationGrid } from '@core/parsers/stationGrid'
import { dateHeaderLine, sectionHeaderLine } from '@core/export/simian'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)
const SUNDAY = { year: 2026, month: 6, day: 7 }

describe('compose — section-grouped day', () => {
  it('builds a program section followed by element sections', async () => {
    const grid = await parseStationGrid(fixture('HitsGrid.xlsx'))
    const baheya = await parseElementTemplate(fixture('Baheya.xlsx'))

    const { days, warnings } = composeDay(SUNDAY, {
      grid,
      programSection: { code: 'PRG', label: 'HITS' },
      templates: [baheya]
    })

    const day = days[0]
    expect(day.sections).toHaveLength(2)
    expect(day.sections[0].code).toBe('PRG')
    expect(day.sections[0].events.length).toBeGreaterThan(0)
    expect(day.sections[1].code).toBe('ADS_1710')
    // unmapped programs surface as warnings
    expect(warnings.some((w) => w.includes('No file name mapped'))).toBe(true)
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
