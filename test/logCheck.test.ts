import { describe, expect, it } from 'vitest'
import { checkLog } from '../src/renderer/src/lib/logCheck'
import { parseLogText, type LogRow } from '../src/renderer/src/lib/logRows'

const CRLF = '\r\n'

function rowsOf(lines: string[]): LogRow[] {
  return parseLogText(lines.join(CRLF) + CRLF)
}

describe('log check', () => {
  it('passes a clean log', () => {
    expect(
      checkLog(
        rowsOf([
          '||||| ' + '-'.repeat(34) + ' '.repeat(23) + 'ADS_1710  Karama',
          '08:20:01|+|ADS_1710-A',
          '09:00:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
          '09:00:02|+|AZ22-01RB|FEA|AZAN فجر',
          '|||COMMENT|--------',
          '10:14:00|#|HP25-AhwaSobh2|PROMO|نورا صبري'
        ])
      )
    ).toEqual([])
  })

  it('flags event rows with an empty cue, but not comments or sections', () => {
    const issues = checkLog(
      rowsOf([
        '||||| section header',
        '|||COMMENT|a comment',
        '09:00:00|||COMMENT|9', // hourly marker: comment kind, no cue — fine
        '08:20:01||ADS_1710-A', // event, cue missing
        '08:30:00' // bare time, still an event row with no cue
      ])
    )
    expect(issues).toEqual(['Row 4 — empty Cue', 'Row 5 — empty Cue'])
  })

  it('flags a MACRO row directly under a comment', () => {
    // The azan shape: comment banner, blank line (dropped by the parser),
    // then the deckfade macro — after parsing the comment is directly above.
    const issues = checkLog(
      rowsOf([
        '08:00:00|+|JIN-01',
        '|||COMMENT|--------------------=§§    01   -   06   -   2026   §§=--------------------',
        '04:10:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN'
      ])
    )
    expect(issues).toEqual(['Row 3 — MACRO directly under a comment (row 2)'])
  })

  it('does not flag a MACRO under an event row or at the top of the log', () => {
    expect(
      checkLog(
        rowsOf([
          '04:10:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
          '04:10:02|+|AZ22-01RB|FEA|AZAN',
          '12:53:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN'
        ])
      )
    ).toEqual([])
  })

  it('flags a log whose first line is a comment', () => {
    expect(checkLog(rowsOf(['|||COMMENT|--------', '08:00:00|+|JIN-01']))).toEqual([
      'Row 1 — the log starts with a comment'
    ])
  })

  it('flags timed rows sharing a second, across @ and #', () => {
    const issues = checkLog(
      rowsOf([
        '08:20:00|@|A-1',
        '08:20:00|+|B-1', // sequential: same second is fine
        '08:20:00|#|C-1',
        '09:00:00|@|D-1' // alone on its second: fine
      ])
    )
    expect(issues).toEqual(['Rows 1, 3 — 2 timed rows share 08:20:00'])
  })

  it('does not flag the same second across day blocks, only within one', () => {
    const dateHeader = (d: string): string =>
      `|||COMMENT|--------------------=§§    ${d}   -   06   -   2026   §§=--------------------`
    const issues = checkLog(
      rowsOf([
        '08:00:00|+|OPENER', // keep the first line a non-comment
        dateHeader('01'),
        '04:10:00|@|AZ-1',
        dateHeader('02'),
        '04:10:00|@|AZ-1', // same azan second next day: fine
        '04:10:00|#|CLASH' // but a clash inside day 2 still flags
      ])
    )
    expect(issues).toEqual(['Rows 5, 6 — 2 timed rows share 04:10:00'])
  })

  it('reports every finding, in row order per kind', () => {
    const issues = checkLog(
      rowsOf([
        '|||COMMENT|banner',
        '04:10:00|@||MACRO|DECKFADE',
        '04:10:00|@|AZ22-01RB|FEA|AZAN',
        '08:20:01||ADS_1710-A'
      ])
    )
    expect(issues).toEqual([
      'Row 1 — the log starts with a comment',
      'Row 2 — MACRO directly under a comment (row 1)',
      'Row 4 — empty Cue',
      'Rows 2, 3 — 2 timed rows share 04:10:00'
    ])
  })
})
