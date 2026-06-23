import { describe, expect, it } from 'vitest'
import { sequentialValues } from '@core/sequential/values'
import { makeResolver, refillQueue } from '@core/sequential/resolve'
import { mulberry32 } from '@core/sequential/rng'
import type { Sequential } from '@core/sequential/types'
import { resolveForDate } from '@core/format/resolveDay'
import { emptyFormatSet, type HourFormat } from '@core/format/types'

function seq(over: Partial<Sequential> = {}): Sequential {
  return {
    id: 's1',
    name: 'JNG',
    mode: 'numerical',
    start: '0',
    end: '2',
    randomize: false,
    queue: [],
    ...over
  }
}

describe('sequential values', () => {
  it('numerical values are zero-padded with the - separator', () => {
    expect(sequentialValues(seq({ start: '0', end: '2' }))).toEqual(['JNG-00', 'JNG-01', 'JNG-02'])
    expect(sequentialValues(seq({ start: '8', end: '10' }))).toEqual([
      'JNG-08',
      'JNG-09',
      'JNG-10'
    ])
  })

  it('alphabetical values are single letters', () => {
    expect(sequentialValues(seq({ mode: 'alphabetical', start: 'A', end: 'C' }))).toEqual([
      'JNG-A',
      'JNG-B',
      'JNG-C'
    ])
  })
})

describe('queue rotation', () => {
  it('gives all distinct values within a cycle, then refills', () => {
    const r = makeResolver([seq()], mulberry32(1))
    const popped = Array.from({ length: 7 }, () => r.pop('JNG'))
    // First 3 distinct, next 3 distinct (a full second cycle), etc.
    expect(new Set(popped.slice(0, 3)).size).toBe(3)
    expect(new Set(popped.slice(3, 6)).size).toBe(3)
  })

  it('non-random cycles in order', () => {
    const r = makeResolver([seq({ randomize: false })], mulberry32(1))
    expect([r.pop('JNG'), r.pop('JNG'), r.pop('JNG')]).toEqual(['JNG-00', 'JNG-01', 'JNG-02'])
  })

  it('randomize still yields a permutation of all values', () => {
    const filled = refillQueue(seq({ randomize: true }), mulberry32(42))
    expect([...filled].sort()).toEqual(['JNG-00', 'JNG-01', 'JNG-02'])
  })

  it('advances the persisted queue (continues across calls)', () => {
    const r = makeResolver([seq({ randomize: false })], mulberry32(1))
    r.pop('JNG') // JNG-00
    const updated = r.updated()[0]
    expect(updated.queue).toEqual(['JNG-01', 'JNG-02'])
  })

  it('returns the token unchanged for unknown names', () => {
    const r = makeResolver([seq()], mulberry32(1))
    expect(r.pop('OTHER')).toBeNull()
  })
})

describe('rotation continues across exports (persisted queue)', () => {
  it('carries the remaining queue into the next export', () => {
    let s = seq({ randomize: false }) // 0-2, queue starts []
    const fmt: HourFormat = {
      id: 'f1',
      name: 'F',
      color: '#fff',
      rows: [{ minute: 0, second: 0, cue: '+', name: '{JNG}' }]
    }
    const set = emptyFormatSet()
    set.formats.push(fmt)
    set.grid.cells[4][8] = 'f1'
    set.grid.cells[4][9] = 'f1' // two uses per "export"

    const exportOnce = (): string[] => {
      const res = resolveForDate(set, { year: 2026, month: 6, day: 18 }, [s], mulberry32(1))
      s = res.sequentials[0] // persist advanced queue for next time
      return res.text.trim().split('\r\n').map((l) => l.split('|')[2])
    }

    expect(exportOnce()).toEqual(['JNG-00', 'JNG-01']) // queue now [JNG-02]
    expect(exportOnce()).toEqual(['JNG-02', 'JNG-00']) // drained then refilled, continues
    expect(exportOnce()).toEqual(['JNG-01', 'JNG-02'])
  })
})

describe('resolveForDate — distinct files across a day', () => {
  it('three uses in a day produce three distinct files in time order', () => {
    const fmt: HourFormat = {
      id: 'f1',
      name: 'F',
      color: '#fff',
      rows: [{ minute: 0, second: 0, cue: '+', name: '{JNG}' }]
    }
    const set = emptyFormatSet()
    set.formats.push(fmt)
    // Thursday (weekday 4): assign the format to hours 8, 9, 10.
    set.grid.cells[4][8] = 'f1'
    set.grid.cells[4][9] = 'f1'
    set.grid.cells[4][10] = 'f1'

    const { text, sequentials } = resolveForDate(
      set,
      { year: 2026, month: 6, day: 18 }, // Thursday
      [seq({ randomize: false })],
      mulberry32(1)
    )
    expect(text).toBe('08:00:00|+|JNG-00\r\n09:00:00|+|JNG-01\r\n10:00:00|+|JNG-02\r\n')
    // queue drained this cycle
    expect(sequentials[0].queue).toEqual([])
  })
})
