import { describe, expect, it } from 'vitest'
import { hoursSummary } from '../src/renderer/src/views/HourPickerDialog'

describe('hoursSummary (clock Hours cell)', () => {
  it('reads as "every" when unrestricted', () => {
    expect(hoursSummary(undefined)).toBe('every')
    expect(hoursSummary([])).toBe('every')
    expect(hoursSummary(Array.from({ length: 24 }, (_, h) => h))).toBe('every')
  })

  it('collapses consecutive hours into ranges', () => {
    expect(hoursSummary([7])).toBe('07')
    expect(hoursSummary([7, 8, 9])).toBe('07–09')
    expect(hoursSummary([9, 7, 8, 17, 16, 18])).toBe('07–09, 16–18')
    expect(hoursSummary([0, 5, 23])).toBe('00, 05, 23')
  })
})
