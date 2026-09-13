import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { parseAiredList, timeToSeconds } from '@core/parsers/airedList'
import { canonicalName, checkBookingElements } from '@core/schedule/bookingCheck'
import { checkAiredDay } from '@core/schedule/airedCheck'

// A real aired line: X|air|?|row#|?|scheduled|Name|Category|Description|deck|path
const line = (
  status: string,
  air: string,
  scheduled: string,
  name: string,
  category = 'ADV'
): string =>
  `${status}|${air}||1||${scheduled}|${name}|${category}|desc|1|\\\\SRV\\lib\\${name}.WAV`

describe('aired list parser', () => {
  it('parses X/E rows, skips short load markers, computes actual lengths', () => {
    const text = [
      line('X', '08:00:00', '08:00:02', 'SNG-0001', 'AUDIO'),
      'E|08:00:10|', // 3-field load marker — skipped
      line('X', '08:03:00', '08:03:00', 'AD22-01'),
      'E|08:03:20||-1||||MACRO|STARTNEXT|4|', // full E row — kept, not played
      line('X', '08:04:00', '08:04:00', 'SNG-0002', 'AUDIO')
    ].join('\r\n')
    const rows = parseAiredList(text)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.played)).toEqual([true, true, false, true])
    // Gaps: 08:00→08:03 = 180s; the STARTNEXT at 08:03:20 caps the ad at 20s.
    expect(rows[0].actual).toBe(180)
    expect(rows[1].actual).toBe(20)
    expect(rows[3].actual).toBeNull() // last row has no successor
  })

  it('wraps actual length across midnight', () => {
    const rows = parseAiredList(
      [line('X', '23:59:50', '23:59:50', 'A'), line('X', '00:00:20', '00:00:20', 'B')].join('\r\n')
    )
    expect(rows[0].actual).toBe(30)
  })

  it('timeToSeconds parses HH:MM:SS only', () => {
    expect(timeToSeconds('01:02:03')).toBe(3723)
    expect(timeToSeconds('nope')).toBeNull()
  })
})

describe('pre-air booking check', () => {
  const codes = ['AD22-01', 'FEA-9']

  it('canonical name tolerates case, extension and dash/underscore', () => {
    expect(canonicalName('ad22-01_a.wav')).toBe('AD22_01_A')
    expect(canonicalName('AD22_01-A')).toBe('AD22_01_A')
  })

  it('reports nothing when every booked spot is in the log', () => {
    const planned = ['AD22-01', 'AD22-01-A']
    const log = ['SNG-100', 'AD22-01', 'comment', 'AD22-01-A']
    expect(checkBookingElements(planned, log, codes)).toEqual([])
  })

  it('flags deleted spots as not-inserted with counts', () => {
    const issues = checkBookingElements(['AD22-01', 'AD22-01'], ['AD22-01'], codes)
    expect(issues).toEqual([{ name: 'AD22-01', status: 'not-inserted', booked: 2, inLog: 1 }])
  })

  it('flags element-named rows beyond (or without) a booking as extra', () => {
    const issues = checkBookingElements(['AD22-01'], ['AD22-01', 'AD22-01', 'FEA-9-B'], codes)
    expect(issues).toEqual([
      { name: 'AD22-01', status: 'extra', booked: 1, inLog: 2 },
      { name: 'FEA-9-B', status: 'extra', booked: 0, inLog: 1 }
    ])
  })

  it('ignores non-element rows entirely', () => {
    expect(checkBookingElements([], ['SNG-100', 'JIN-NIGHT'], codes)).toEqual([])
  })
})

describe('after-air check', () => {
  const codes = ['AD22-01']
  const dur = (name: string): number | null => (name.startsWith('AD22') ? 30 : null)

  it('full day: played, partial, missed and extra together', () => {
    const planned = [
      { name: 'AD22-01', time: '08:10:00' }, // plays fully
      { name: 'AD22-01-A', time: '09:10:00' }, // cut at 12s
      { name: 'AD22-01-B', time: '10:10:00' } // never aired
    ]
    const aired = parseAiredList(
      [
        line('X', '08:10:02', '08:10:00', 'AD22-01'),
        line('X', '08:10:32', '08:10:30', 'SNG-1', 'AUDIO'),
        line('X', '09:10:00', '09:10:00', 'AD22-01-A'),
        line('X', '09:10:12', '09:10:30', 'SNG-2', 'AUDIO'),
        line('X', '11:00:00', '11:00:00', 'AD22-01-C'), // aired, never booked
        line('X', '11:01:00', '11:01:00', 'SNG-3', 'AUDIO')
      ].join('\r\n')
    )
    const res = checkAiredDay('2026-08-01', planned, aired, codes, dur)
    expect(res.planned).toBe(3)
    expect(res.played).toBe(1)
    expect(res.issues).toEqual([
      {
        name: 'AD22-01-A',
        status: 'partial',
        time: '09:10:00',
        detail: 'played 00:12 of 00:30'
      },
      { name: 'AD22-01-B', status: 'missed', time: '10:10:00', detail: 'not in the aired list' },
      {
        name: 'AD22-01-C',
        status: 'extra',
        time: '11:00:00',
        detail: 'aired but not booked this day'
      }
    ])
  })

  it('a listed row without the X is missed', () => {
    const aired = parseAiredList(
      [
        line('E', '08:10:00', '08:10:00', 'AD22-01'),
        line('X', '08:11:00', '', 'SNG', 'AUDIO')
      ].join('\r\n')
    )
    const res = checkAiredDay(
      '2026-08-01',
      [{ name: 'AD22-01', time: '08:10:00' }],
      aired,
      codes,
      dur
    )
    expect(res.issues).toEqual([
      {
        name: 'AD22-01',
        status: 'missed',
        time: '08:10:00',
        detail: 'listed but never played (no X)'
      }
    ])
  })

  it('crossfade tolerance: a few seconds short still counts as played', () => {
    const aired = parseAiredList(
      [
        line('X', '08:10:00', '08:10:00', 'AD22-01'),
        line('X', '08:10:26', '08:10:30', 'SNG', 'AUDIO') // 26s of 30 — within 5s
      ].join('\r\n')
    )
    const res = checkAiredDay(
      '2026-08-01',
      [{ name: 'AD22-01', time: '08:10:00' }],
      aired,
      codes,
      dur
    )
    expect(res.played).toBe(1)
    expect(res.issues).toEqual([])
  })

  it('no audio DB (unknown duration) never reports partial', () => {
    const aired = parseAiredList(
      [
        line('X', '08:10:00', '08:10:00', 'AD22-01'),
        line('X', '08:10:03', '', 'SNG', 'AUDIO')
      ].join('\r\n')
    )
    const res = checkAiredDay(
      '2026-08-01',
      [{ name: 'AD22-01', time: '08:10:00' }],
      aired,
      codes,
      () => null
    )
    expect(res.played).toBe(1)
  })
})

// Real aired lists from the station (Dropbox, not committed) — self-skips.
const LST_PATH =
  '/Users/zezo/Library/CloudStorage/Dropbox/Zeyad/Radio Scheduler/LOG/08 List/260801.lst'

describe.skipIf(!existsSync(LST_PATH))('aired list (local integration)', () => {
  it('parses the real 2026-08-01 list', () => {
    const rows = parseAiredList(iconv.decode(readFileSync(LST_PATH), 'windows-1256'))
    expect(rows.length).toBeGreaterThan(1400)
    const played = rows.filter((r) => r.played)
    expect(played.length).toBeGreaterThan(1400)
    // Every played row but the last carries a derived actual length.
    expect(rows.slice(0, -1).every((r) => r.actual != null && r.actual >= 0)).toBe(true)
    // The known ad spot airs (HP25-GMASR at 08:19:32).
    expect(played.some((r) => r.name === 'HP25-GMASR')).toBe(true)
  })
})
