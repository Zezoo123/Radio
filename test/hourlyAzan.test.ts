import { describe, expect, it } from 'vitest'
import { hourlyMarkerLines } from '@core/schedule/hourly'
import { buildAzanRows, computeAzanLines } from '@core/prayer/azanRows'
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

describe('azan rows (default format: deckfade 10s before, azan = FEA)', () => {
  it('emits the deckfade 10s before the azan, per prayer', () => {
    const rows = buildAzanRows({
      fajr: '04:10:00',
      dhuhr: '12:53:00',
      asr: '16:29:00',
      maghrib: '19:52:00',
      isha: '21:23:00'
    })
    expect(rows[0]).toBe('04:09:50|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN')
    expect(rows[1]).toBe('04:10:00|+|AZ22-01RB|FEA|AZAN فجر')
    expect(rows).toHaveLength(10)
  })

  it('computes Cairo/Egyptian rows for a date', () => {
    const rows = computeAzanLines({ year: 2026, month: 6, day: 18 })
    expect(rows[0]).toBe('04:07:50|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN')
    expect(rows[1]).toBe('04:08:00|+|AZ22-01RB|FEA|AZAN فجر')
  })

  it('honors a custom format: extra line after, custom azan category', () => {
    const rows = buildAzanRows(
      { fajr: '05:00:00', dhuhr: '12:00:00', asr: '15:00:00', maghrib: '19:00:00', isha: '21:00:00' },
      { azanCategory: 'SER', lines: [{ offset: 5, cue: '+', name: 'BED', category: 'AUDIO', description: 'after' }] }
    )
    // Fajr: azan (SER) at 05:00:00, then the +5s line at 05:00:05.
    expect(rows[0]).toBe('05:00:00|+|AZ22-01RB|SER|AZAN فجر')
    expect(rows[1]).toBe('05:00:05|+|BED|AUDIO|after')
  })
})

describe('compose ordering with hourly + azan', () => {
  it('places hourly markers and azan after the date header, before sections', () => {
    const { days } = composeDay(
      { year: 2026, month: 6, day: 1 },
      {
        hourly: { enabled: true, startHour: 0, endHour: 1 },
        azanLinesForDate: () => ['04:10:00|@||MACRO|X', '04:10:02|+|AZ22-01RB|FEA|AZAN فجر']
      }
    )
    expect(days[0].hourlyLines).toEqual(['00:00:00|||COMMENT|0', '01:00:00|||COMMENT|1'])
    expect(days[0].azanLines?.[0]).toBe('04:10:00|@||MACRO|X')
  })
})
