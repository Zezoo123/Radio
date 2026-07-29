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

  it('reads the Length column between Name and Category (Simian-saved logs)', () => {
    const line = '00:00:10|+|L024-073|00:07|LI|Liner ID Arabic'
    const [row] = parseLogText(line + CRLF)
    expect(row.srcDuration).toBe(7)
    expect(row.fields).toEqual(['00:00:10', '+', 'L024-073', 'LI', 'Liner ID Arabic'])
    // Saving with the duration reproduces the six-column line byte-for-byte.
    expect(rowToLine(row, row.srcDuration)).toBe(line)
    // Without a duration the canonical five columns come out.
    expect(rowToLine(row)).toBe('00:00:10|+|L024-073|LI|Liner ID Arabic')
  })

  it('also accepts a trailing Length field, and writes it back between Name and Category', () => {
    const [row] = parseLogText('00:04:07|+|8041-08|A|Hob ElHob|03:32' + CRLF)
    expect(row.srcDuration).toBe(212)
    expect(row.fields[4]).toBe('Hob ElHob')
    expect(rowToLine(row, 212)).toBe('00:04:07|+|8041-08|03:32|A|Hob ElHob')
  })

  it('serializeRows keeps the Length column on EVERY row — empty when unknown', () => {
    const text =
      '|||COMMENT|hour 9' +
      CRLF +
      '09:00:10|+|SONG-1|A|Nice' +
      CRLF +
      '09:03:00|+|JIN-01' +
      CRLF +
      '05:05:00|@|DECKFADE CURRENT|ATHAN' +
      CRLF
    const rows = parseLogText(text)
    const durs = new Map([[rows[1].id, 190]])
    const out = serializeRows(rows, (r) => durs.get(r.id) ?? 0)
    expect(out).toBe(
      '||||COMMENT|hour 9' + // comment: empty Time/Cue/Name/Length
        CRLF +
        '09:00:10|+|SONG-1|03:10|A|Nice' +
        CRLF +
        '09:03:00|+|JIN-01|||' + // no duration known → column present, empty
        CRLF +
        '05:05:00|@|DECKFADE CURRENT||ATHAN|' + // macro: empty Length
        CRLF
    )
  })

  it('reads the six-column comment/macro form back into the right fields', () => {
    const rows = parseLogText(
      '||||COMMENT|hour 9' + CRLF + '05:05:00|@|DECKFADE CURRENT||ATHAN|' + CRLF
    )
    expect(rows[0].fields[3]).toBe('COMMENT')
    expect(rowKind(rows[0])).toBe('comment')
    expect(rows[1].fields).toEqual(['05:05:00', '@', 'DECKFADE CURRENT', 'ATHAN', ''])
    expect(rows[1].srcDuration).toBeUndefined()
  })

  it('leaves section headers verbatim even when saving with durations', () => {
    const line = '||||| ' + '-'.repeat(34) + ' '.repeat(23) + 'ADS_1710  Baheya'
    const rows = parseLogText(line + CRLF)
    expect(serializeRows(rows, () => 0)).toBe(line + CRLF)
    expect(rowKind(rows[0])).toBe('section')
  })

  it('still folds a non-duration 6th field into the description', () => {
    const line = '10:00:00|+|X|CAT|left|right'
    const [row] = parseLogText(line + CRLF)
    expect(row.srcDuration).toBeUndefined()
    expect(row.fields[4]).toBe('left|right')
    expect(rowToLine(row)).toBe(line) // byte-exact round trip as before
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
