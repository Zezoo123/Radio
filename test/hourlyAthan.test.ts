import { describe, expect, it } from 'vitest'
import { hourlyMarkerLines } from '@core/schedule/hourly'
import { buildAthanRows, computeAthanLines } from '@core/prayer/athanRows'
import { composeDay } from '@core/schedule/compose'

describe('hourly markers', () => {
  it('emits a comment row per hour with the hour in the time column', () => {
    const lines = hourlyMarkerLines({ enabled: true, startHour: 8, endHour: 10 })
    expect(lines).toEqual([
      '08:00:00|||COMMENT|8',
      '09:00:00|||COMMENT|9',
      '10:00:00|||COMMENT|10'
    ])
  })

  it('emits nothing when disabled', () => {
    expect(hourlyMarkerLines({ enabled: false, startHour: 0, endHour: 23 })).toEqual([])
  })
})

describe('athan rows (calculate mode)', () => {
  it('builds the two-row macro + audio format per prayer', () => {
    const rows = buildAthanRows({
      fajr: '04:10',
      dhuhr: '12:53:00',
      asr: '16:29',
      maghrib: '19:52',
      isha: '21:23'
    })
    expect(rows[0]).toBe('04:10:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN')
    expect(rows[1]).toBe('04:10:02|+|AZ22-01RB|FEA|AZAN فجر')
    expect(rows).toHaveLength(10)
  })

  it('computes Cairo/Egyptian rows for a date', () => {
    const rows = computeAthanLines({ year: 2026, month: 6, day: 18 })
    expect(rows[0]).toBe('04:08:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN')
    expect(rows[1]).toBe('04:08:02|+|AZ22-01RB|FEA|AZAN فجر')
  })
})

describe('compose ordering with hourly + athan', () => {
  it('places hourly markers and athan after the date header, before sections', () => {
    const { days } = composeDay(
      { year: 2026, month: 6, day: 1 },
      {
        hourly: { enabled: true, startHour: 0, endHour: 1 },
        athanLinesForDate: () => ['04:10:00|@||MACRO|X', '04:10:02|+|AZ22-01RB|FEA|AZAN فجر']
      }
    )
    expect(days[0].hourlyLines).toEqual(['00:00:00|||COMMENT|0', '01:00:00|||COMMENT|1'])
    expect(days[0].athanLines?.[0]).toBe('04:10:00|@||MACRO|X')
  })
})
