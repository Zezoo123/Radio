import { describe, expect, it } from 'vitest'
import { parseLogText, type LogRow } from '../src/renderer/src/lib/logRows'
import {
  formatDuration,
  formatSeconds,
  parseDuration,
  parseTimeToSeconds,
  simulateLog,
  type SimRow
} from '../src/renderer/src/lib/runtime'
import {
  lookupDuration,
  normalizeName,
  parseDurationValue,
  pickColumns
} from '../src/main/core/simianDb'

const CRLF = '\r\n'

function rowsOf(lines: string[]): LogRow[] {
  return parseLogText(lines.join(CRLF) + CRLF)
}

function simulate(lines: string[], durs: number[]): { rows: LogRow[]; sim: SimRow[] } {
  const rows = rowsOf(lines)
  const byId = new Map(rows.map((r, i) => [r.id, durs[i] ?? 0]))
  return { rows, sim: simulateLog(rows, (r) => byId.get(r.id) ?? 0) }
}

const at = (s: SimRow): string => (s.expected != null ? formatSeconds(s.expected) : '—')

describe('playout simulation', () => {
  it('a timed row reached before its time plays immediately — no dead air', () => {
    const { sim } = simulate(
      [
        '00:00:00|+|SONG-A', // 00:00:00 → 00:01:00
        '06:00:00|@|AZAN-FAJR|ATHAN|', // reached at 00:01 — plays NOW, like a +
        '06:10:00|+|SONG-B'
      ],
      [60, 120, 240]
    )
    expect(sim.map(at)).toEqual(['00:00:00', '00:01:00', '00:03:00'])
    expect(sim.every((s) => s.status === 'ok')).toBe(true)
  })

  it('# reached before its time also plays immediately', () => {
    const { sim } = simulate(
      ['00:00:00|+|OPEN|AUDIO|', '10:05:00|#|SPOT|AUDIO|', '10:06:00|+|SONG'],
      [60, 30, 180]
    )
    expect(sim.map(at)).toEqual(['00:00:00', '00:01:00', '00:01:30'])
    expect(sim.every((s) => s.status === 'ok')).toBe(true)
  })

  it('a firing @ CUTS the playing item and SKIPS the queue up to it', () => {
    const { sim } = simulate(
      [
        '03:00:00|+|LONG-SHOW|AUDIO|', // 00:00 → 04:26:40, still playing at 04:00
        '03:30:00|+|SONG-A',
        '03:40:00|+|SONG-B',
        '04:00:00|@|AZAN-FAJR|ATHAN|',
        '04:05:00|+|SONG-C'
      ],
      [16000, 180, 180, 120, 180]
    )
    expect(sim[0].status).toBe('interrupted') // cut mid-play…
    expect(sim[0].cutAt).toBe(4 * 3600) // …exactly at 04:00
    expect(sim[1].status).toBe('skipped')
    expect(sim[2].status).toBe('skipped')
    expect(at(sim[3])).toBe('04:00:00') // the @ fires on time
    expect(sim[3].status).toBe('ok')
    expect(at(sim[4])).toBe('04:02:00') // and playback continues after it
  })

  it('a firing # lets the current item FINISH, then jumps straight to it', () => {
    const { sim } = simulate(
      [
        '00:00:00|+|LONG|AUDIO|', // 00:00 → 10:10:00 — the # at 10:05 fires meanwhile
        '10:02:00|+|SONG-A',
        '10:05:00|#|NEWS|AUDIO|',
        '10:08:00|+|SONG-B'
      ],
      [36600, 180, 300, 180]
    )
    expect(sim[0].status).toBe('ok') // finished in full, not cut
    expect(sim[1].status).toBe('skipped') // never got its turn
    expect(at(sim[2])).toBe('10:10:00') // # starts right after LONG ends
    expect(sim[2].status).toBe('ok')
    expect(at(sim[3])).toBe('10:15:00')
  })

  it('rows overtaken before they start are skipped (timed event already fired)', () => {
    const { sim } = simulate(
      [
        '05:00:00|+|SHOW|AUDIO|', // 00:00 → 06:30 — the 06:00 @ fires during it
        '06:10:00|+|SONG-A',
        '06:00:00|@|AZAN|ATHAN|'
      ],
      [23400, 180, 120]
    )
    expect(sim[0].status).toBe('interrupted')
    expect(sim[0].cutAt).toBe(6 * 3600)
    expect(sim[1].status).toBe('skipped')
    expect(at(sim[2])).toBe('06:00:00')
  })

  it('bare @/# markers (scheduled time, no audio) still fire — the real log shape', () => {
    // Straight out of H260713.bsi: the azan is a bare @ marker followed by + audio.
    const { sim } = simulate(
      [
        '04:12:43|+|SONG-A', // 00:00 → 04:26:40, playing when the 04:19 marker fires
        '04:16:04|+|SONG-B',
        '04:19:00|@||', // marker: scheduled time only, empty name
        '04:19:02|+|AZ22-01RB'
      ],
      [16000, 219, 0, 230]
    )
    expect(sim[0].status).toBe('interrupted')
    expect(sim[0].cutAt).toBe(4 * 3600 + 19 * 60)
    expect(sim[1].status).toBe('skipped')
    expect(at(sim[2])).toBe('04:19:00') // the marker fires on its scheduled time
    expect(at(sim[3])).toBe('04:19:00') // and the azan audio chains right after
  })

  it('a bare # marker reached early plays straight through — no waiting', () => {
    const { sim } = simulate(
      ['06:56:11|+|SONG', '06:58:00|+|LEFTOVER', '07:00:00|#||', '07:00:10|+|SWEEP'],
      [400, 200, 0, 10]
    )
    // Clock starts at 00:00: SONG 0→400s, LEFTOVER 400→600s, then the # marker
    // is reached hours ahead of 07:00 — it passes through immediately.
    expect(sim.every((s) => s.status === 'ok')).toBe(true)
    expect(at(sim[2])).toBe('00:10:00')
    expect(at(sim[3])).toBe('00:10:00')
  })

  it('comments show the running clock and never advance it', () => {
    const { sim } = simulate(
      ['09:00:00|+|SONG|AUDIO|', '10:00:00|||COMMENT|10', '|||COMMENT|note'],
      [180, 999, 999]
    )
    expect(at(sim[1])).toBe('00:03:00')
    expect(at(sim[2])).toBe('00:03:00')
    expect(sim[1].status).toBe('note')
  })

  it('parses and formats times', () => {
    expect(parseTimeToSeconds('06:05:09')).toBe(6 * 3600 + 5 * 60 + 9)
    expect(parseTimeToSeconds('nope')).toBeNull()
    expect(formatSeconds(25 * 3600)).toBe('01:00:00') // wraps past midnight
  })

  it('formats and parses MM:SS durations', () => {
    expect(formatDuration(30.752)).toBe('00:31')
    expect(formatDuration(230.6)).toBe('03:51')
    expect(formatDuration(3915)).toBe('65:15') // minutes keep counting past 59
    expect(formatDuration(0)).toBe('00:00')
    expect(parseDuration('03:51')).toBe(231)
    expect(parseDuration('0:30.5')).toBeCloseTo(30.5)
    expect(parseDuration('1:02:03')).toBe(3723)
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('junk')).toBeNull()
  })
})

describe('Simian DB helpers', () => {
  it('normalizes cart names for lookup', () => {
    expect(normalizeName(' hp25-Laziz.wav ')).toBe('HP25-LAZIZ')
    expect(normalizeName('ADS_1710_A')).toBe('ADS_1710_A')
  })

  it('parses the duration shapes Simian uses', () => {
    expect(parseDurationValue(30)).toBe(30)
    expect(parseDurationValue('30')).toBe(30)
    expect(parseDurationValue('00:30')).toBe(30)
    expect(parseDurationValue('1:02:03')).toBe(3723)
    expect(parseDurationValue('00:29.7')).toBeCloseTo(29.7)
    expect(parseDurationValue(new Date(Date.UTC(1899, 11, 30, 0, 3, 20)))).toBe(200)
    expect(parseDurationValue('')).toBeNull()
    expect(parseDurationValue('n/a')).toBeNull()
  })

  it('falls back across dash/underscore separators on lookup', () => {
    const tracks = new Map([
      ['ADS-1705-B', 20.4], // library style (dashes)
      ['AD7A_INTRO', 5]
    ])
    expect(lookupDuration(tracks, 'ADS_1705_B')).toBe(20.4) // sheet style (underscores)
    expect(lookupDuration(tracks, 'ADS-1705-B.wav')).toBe(20.4)
    expect(lookupDuration(tracks, 'Ad7a-Intro')).toBe(5)
    expect(lookupDuration(tracks, 'MISSING')).toBeNull()
  })

  it('finds filename + duration columns in varied schemas', () => {
    expect(pickColumns(['ID', 'Filename', 'Length', 'Artist'])).toEqual({
      name: 'Filename',
      duration: 'Length'
    })
    expect(pickColumns(['cart', 'duration'])).toEqual({ name: 'cart', duration: 'duration' })
    expect(pickColumns(['AudioFile', 'TotalLength'])).toEqual({
      name: 'AudioFile',
      duration: 'TotalLength'
    })
    expect(pickColumns(['ID', 'Artist'])).toBeNull()
  })
})
