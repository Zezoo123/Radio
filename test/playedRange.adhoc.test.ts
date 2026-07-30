import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseElementTemplate,
  playedDayColumns,
  templateGrid
} from '../src/main/core/parsers/elementTemplate'

// Local integration check against a real campaign template: a short campaign
// padded with a long stretch of empty day columns. Skipped where the Dropbox
// file isn't present (CI).
const TPL_PATH =
  '/Users/zezo/Library/CloudStorage/Dropbox/Zeyad/Radio Scheduler/Element templates/InDrive.xlsx'

describe.skipIf(!existsSync(TPL_PATH))('played range (local integration)', () => {
  it('covers only the span the element actually plays', async () => {
    const tpl = await parseElementTemplate(TPL_PATH)
    const played = playedDayColumns(tpl)

    expect(played.length).toBeGreaterThan(0)
    // The sheet pads the campaign with empty day columns.
    expect(played.length).toBeLessThan(tpl.dayColumns.length)

    // The played range sits inside the sheet's full range.
    const iso = (c: { year: number; month: number; day: number }): string =>
      `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`
    const all = [...tpl.dayColumns].sort(
      (a, b) => a.year - b.year || a.month - b.month || a.day - b.day
    )
    expect(iso(played[0]) >= iso(all[0])).toBe(true)
    expect(iso(played[played.length - 1]) <= iso(all[all.length - 1])).toBe(true)

    // The grid's totals agree: first/last played column == the trimmed bounds
    // the Booking plan view derives from totals.
    const grid = templateGrid(tpl)
    const firstIdx = grid.totals.findIndex((n) => n > 0)
    let lastIdx = grid.totals.length - 1
    while (lastIdx > firstIdx && grid.totals[lastIdx] === 0) lastIdx--
    expect(grid.days[firstIdx].iso).toBe(iso(played[0]))
    expect(grid.days[lastIdx].iso).toBe(iso(played[played.length - 1]))

    console.log(
      `sheet ${iso(all[0])} → ${iso(all[all.length - 1])} (${tpl.dayColumns.length} days), ` +
        `plays ${iso(played[0])} → ${iso(played[played.length - 1])} (${played.length} played days)`
    )
  })
})
