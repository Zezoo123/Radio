import { describe, expect, it } from 'vitest'
import { normalizeFormatSet } from '@core/format/normalize'

describe('normalizeFormatSet (format file import)', () => {
  it('rejects things that are not a format set', () => {
    expect(normalizeFormatSet(null)).toBeNull()
    expect(normalizeFormatSet({})).toBeNull()
    expect(normalizeFormatSet({ formats: [] })).toBeNull() // missing grid
  })

  it('migrates a minimal set: 7×24 grid, seeded categories/defaults', () => {
    const set = normalizeFormatSet({ formats: [], grid: { cells: [] } })!
    expect(set.grid.cells).toHaveLength(7)
    expect(set.grid.cells.every((r) => r.length === 24)).toBe(true)
    expect(set.categories!.length).toBeGreaterThan(0)
    expect(set.defaultClocks).toEqual([])
    expect(set.dayDefaults).toHaveLength(7)
  })

  it('preserves a full valid set', () => {
    const full = {
      formats: [{ id: 'a', name: 'A', color: '#fff', rows: [] }],
      grid: { cells: Array.from({ length: 7 }, () => new Array(24).fill(null)) },
      categories: ['X'],
      defaultClocks: [{ id: 'd', name: 'D', color: '#fff', rows: [] }],
      dayDefaults: [null, 'd', null, null, null, null, null]
    }
    const set = normalizeFormatSet(full)!
    expect(set.formats[0].id).toBe('a')
    expect(set.categories).toEqual(['X'])
    expect(set.defaultClocks![0].id).toBe('d')
    expect(set.dayDefaults![1]).toBe('d')
  })
})
