import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseStationGrid,
  programsForDate,
  programTitles
} from '@core/parsers/stationGrid'
import { normalizeTitle } from '@core/programMap'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)

// June 2026: 1st = Monday, so 7th = Sunday, 5th = Friday.
const SUNDAY = { year: 2026, month: 6, day: 7 }
const MONDAY = { year: 2026, month: 6, day: 1 }
const FRIDAY = { year: 2026, month: 6, day: 5 }

describe('station grid parser — Hits grid', () => {
  it('detects the weekday header and time segments', async () => {
    const grid = await parseStationGrid(fixture('HitsGrid.xlsx'))
    expect(grid.dayColumns).toEqual([3, 4, 5, 6, 7, 8, 9]) // Sun…Sat
    expect(grid.segments[0].start).toBe('07:00:00')
    expect(grid.segments.length).toBeGreaterThan(10)
  })

  it('emits a horizontally-merged program on each covered weekday', async () => {
    const grid = await parseStationGrid(fixture('HitsGrid.xlsx'))
    const sun = programsForDate(grid, SUNDAY).events
    const mon = programsForDate(grid, MONDAY).events
    const fri = programsForDate(grid, FRIDAY).events

    // "يا لذيذ يا سايق" 08:00-09:00 is merged Sun–Thu.
    const at8Sun = sun.find((e) => e.time === '08:00:00')
    const at8Mon = mon.find((e) => e.time === '08:00:00')
    expect(at8Sun?.name).toContain('يا لذيذ')
    expect(at8Mon?.name).toContain('يا لذيذ')
    // Friday is outside the merge → no 08:00 program.
    expect(fri.find((e) => e.time === '08:00:00')).toBeUndefined()
  })
})

describe('station grid parser — Mega grid (rich text + vertical merge)', () => {
  it('extracts rich-text program names (not "[object Object]")', async () => {
    const grid = await parseStationGrid(fixture('MegaGrid.xlsx'))
    const sun = programsForDate(grid, SUNDAY).events
    const morning = sun.find((e) => e.time === '08:00:00')
    expect(morning?.name).toContain('عليش الصبح')
    expect(morning?.name).not.toContain('[object Object]')
  })

  it('fires a multi-hour program once at its start, not every hour', async () => {
    const grid = await parseStationGrid(fixture('MegaGrid.xlsx'))
    const times = programsForDate(grid, SUNDAY).events.map((e) => e.time)
    // C3:G5 merge spans 08:00–11:00; only the 08:00 start should be emitted.
    expect(times).toContain('08:00:00')
    expect(times).not.toContain('09:00:00')
    expect(times).not.toContain('10:00:00')
  })

  it('resolves program file names through the map and reports unmapped titles', async () => {
    const grid = await parseStationGrid(fixture('MegaGrid.xlsx'))
    const titles = programTitles(grid)
    const morningTitle = titles.find((t) => t.startsWith('عليش'))!
    expect(morningTitle).toBeTruthy()

    const map = { [normalizeTitle(morningTitle)]: 'MEGA_MORNING' }
    const sched = programsForDate(grid, SUNDAY, map)
    expect(sched.events.find((e) => e.time === '08:00:00')?.name).toBe('MEGA_MORNING')
    expect(sched.unmapped).not.toContain(morningTitle)
    // other titles remain unmapped
    expect(sched.unmapped.length).toBeGreaterThan(0)
  })
})
