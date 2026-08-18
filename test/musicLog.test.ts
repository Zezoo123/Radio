import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MUSIC_IMPORT,
  musicLogLines,
  normalizeMusicImportSettings,
  parseMusicLog
} from '@core/parsers/musicLog'
import { exportRange } from '@core/schedule/compose'

/**
 * Builds a fixed-width music-log line per the default import settings:
 * Name @1×8, Desc @9×40, Length @49×5, Time @54×8, Category @62×7.
 */
function line(name: string, desc: string, length: string, time: string, category: string): string {
  return name.padEnd(8) + desc.padEnd(40) + length.padEnd(5) + time.padEnd(8) + category
}

const SAMPLE = [
  ':) صباح الخير'.padEnd(61) + 'ملاحظة',
  line('L900-001', 'Liner                    Morning Mix 1  ', '00:07', '00:00:10', 'Li'),
  line('9001-001', 'فنان تجريبي              أغنية تجريبية  ', '03:11', '00:00:17', 'A '),
  '',
  line('J900-01', 'Jingle                   Test Jingle    ', '00:34', '9:08:57', 'Jingle')
].join('\r\n')

describe('parseMusicLog — Simian position-dependent Music import', () => {
  it('extracts every field at its configured position', () => {
    const { rows, eventCount, commentCount } = parseMusicLog(SAMPLE, DEFAULT_MUSIC_IMPORT)
    expect(eventCount).toBe(3)
    expect(commentCount).toBe(1)

    const first = rows[1]
    expect(first).toMatchObject({
      kind: 'event',
      time: '00:00:10',
      cue: '+',
      name: 'L900-001',
      category: 'Li',
      description: 'Liner                    Morning Mix 1',
      lengthSec: 7
    })

    // Arabic text survives untouched.
    expect(rows[2].description).toContain('فنان تجريبي')
  })

  it('turns rows without a valid Time into comment rows', () => {
    const { rows } = parseMusicLog(SAMPLE, DEFAULT_MUSIC_IMPORT)
    expect(rows[0].kind).toBe('comment')
    expect(rows[0].text).toBe(':) صباح الخير ملاحظة')
  })

  it('zero-pads single-digit hours and skips blank lines', () => {
    const { rows } = parseMusicLog(SAMPLE, DEFAULT_MUSIC_IMPORT)
    expect(rows).toHaveLength(4) // the empty line is dropped
    expect(rows[3].time).toBe('09:08:57')
  })

  it('serializes to pipe lines in file order', () => {
    const lines = musicLogLines(parseMusicLog(SAMPLE, DEFAULT_MUSIC_IMPORT))
    expect(lines[0]).toBe('|||COMMENT|:) صباح الخير ملاحظة')
    expect(lines[1]).toBe('00:00:10|+|L900-001|Li|Liner                    Morning Mix 1')
    expect(lines[3]).toBe('09:08:57|+|J900-01|Jingle|Jingle                   Test Jingle')
  })

  it('reads a configured Cue field, defaulting to AutoStep +', () => {
    const settings = normalizeMusicImportSettings({
      ...DEFAULT_MUSIC_IMPORT,
      cue: { start: 70, length: 1 }
    })
    const timed = line('X900-001', 'Desc', '00:10', '06:00:00', 'Cat    ') + ' @'
    const { rows } = parseMusicLog(timed, settings)
    expect(rows[0].cue).toBe('@')
  })

  it('normalize falls back field-by-field to the station defaults', () => {
    const s = normalizeMusicImportSettings({ time: { start: 10, length: 8 }, name: 'garbage' })
    expect(s.time).toEqual({ start: 10, length: 8 })
    expect(s.name).toEqual(DEFAULT_MUSIC_IMPORT.name)
    expect(s.desc).toEqual(DEFAULT_MUSIC_IMPORT.desc)
  })
})

describe('compose — music layer', () => {
  it('emits musicLinesForDate as its own layer on every day, before sections', () => {
    const music = musicLogLines(parseMusicLog(SAMPLE, DEFAULT_MUSIC_IMPORT))
    const { text } = exportRange(
      { year: 2026, month: 8, day: 20 },
      { year: 2026, month: 8, day: 21 },
      { musicLinesForDate: () => music }
    )
    const occurrences = text.split('00:00:10|+|L900-001|Li|').length - 1
    expect(occurrences).toBe(2) // one per day of the range
  })
})
