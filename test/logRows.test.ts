import { describe, expect, it } from 'vitest'
import { parseLogText, rowKind, rowToLine, serializeRows } from '../src/renderer/src/lib/logRows'

const CRLF = '\r\n'

// Representative Simian lines: date rule, date header, section header (extra
// pipes!), bare 3-field event, full 5-field event, comment, verbatim 4-field row.
const LINES = [
  '|||COMMENT|' + '-'.repeat(84),
  '|||COMMENT|--------------------=§§    07   -   06   -   2026   §§=--------------------',
  '||||| ' + '-'.repeat(34) + ' '.repeat(23) + 'ADS_1710  Baheya',
  '08:20:01|+|ADS_1710_A',
  '10:14:00|+|HP25-LazizWeSay2|PROMO|ميرا العمرى',
  '09:00:00|||COMMENT|9',
  '05:05:00|@|DECKFADE CURRENT|ATHAN'
]
const TEXT = LINES.join(CRLF) + CRLF

describe('export log rows', () => {
  it('round-trips a full log byte-for-byte', () => {
    expect(serializeRows(parseLogText(TEXT))).toBe(TEXT)
  })

  it('folds extra pipes into the description and restores them', () => {
    const section = parseLogText(TEXT)[2]
    expect(section.fields[4].startsWith('|')).toBe(true)
    expect(rowToLine(section)).toBe(LINES[2])
  })

  it('classifies rows for styling', () => {
    const rows = parseLogText(TEXT)
    expect(rowKind(rows[0])).toBe('comment')
    expect(rowKind(rows[2])).toBe('section')
    expect(rowKind(rows[3])).toBe('event')
    expect(rowKind(rows[5])).toBe('comment') // hourly marker
    expect(rowKind(rows[6])).toBe('event')
  })

  it('keeps a bare event bare, and extends it when a category is added', () => {
    const [row] = parseLogText('08:00:00|+|JIN-01' + CRLF)
    expect(rowToLine(row)).toBe('08:00:00|+|JIN-01')
    row.fields[3] = 'AUDIO'
    // Category brings the (empty) description along, matching eventLine().
    expect(rowToLine(row)).toBe('08:00:00|+|JIN-01|AUDIO|')
  })

  it('preserves a verbatim 4-field row exactly', () => {
    const line = '05:05:00|@|DECKFADE CURRENT|ATHAN'
    const [row] = parseLogText(line + CRLF)
    expect(rowToLine(row)).toBe(line)
  })

  it('keeps edited times and reordering intact', () => {
    const rows = parseLogText(TEXT)
    rows[3].fields[0] = '08:45:00'
    const moved = [...rows]
    const [m] = moved.splice(3, 1)
    moved.splice(5, 0, m)
    const out = serializeRows(moved)
    expect(out).toContain('08:45:00|+|ADS_1710_A')
    expect(out.indexOf('09:00:00|||COMMENT|9')).toBeLessThan(out.indexOf('08:45:00|+|ADS_1710_A'))
  })
})
