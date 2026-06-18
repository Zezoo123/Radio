import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { athanLinesForDate, parseAzanFile } from '@core/parsers/azanFile'
import { composeDay } from '@core/schedule/compose'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)

describe('AZAN file parser', () => {
  it('extracts every day with its 10 athan rows', async () => {
    const azan = await parseAzanFile(fixture('AZAN-2026-06.txt'))
    expect(azan.byDay.size).toBe(30)
    expect(azan.months).toEqual([{ month: 6, year: 2026 }])

    const june1 = athanLinesForDate(azan, { year: 2026, month: 6, day: 1 })!
    expect(june1).toEqual([
      '04:10:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '04:10:02|+|AZ22-01RB|FEA|AZAN فجر',
      '12:53:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '12:53:02|+|AZ22-02RB|FEA|AZAN ظهر',
      '16:29:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '16:29:02|+|AZ22-03RB|FEA|AZAN عصر',
      '19:52:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '19:52:02|+|AZ22-04RB|FEA|AZAN مغرب',
      '21:23:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN',
      '21:23:02|+|AZ22-05RB|FEA|AZAN عشاء'
    ])
  })

  it('returns null for a date the file does not cover', async () => {
    const azan = await parseAzanFile(fixture('AZAN-2026-06.txt'))
    expect(athanLinesForDate(azan, { year: 2026, month: 7, day: 1 })).toBeNull()
  })
})

describe('compose with athan block', () => {
  it('places athan rows right after the date header', async () => {
    const azan = await parseAzanFile(fixture('AZAN-2026-06.txt'))
    const { days } = composeDay(
      { year: 2026, month: 6, day: 1 },
      { athanLinesForDate: (d) => athanLinesForDate(azan, d) }
    )
    expect(days[0].athanLines?.[1]).toBe('04:10:02|+|AZ22-01RB|FEA|AZAN فجر')
  })

  it('warns when the loaded athan source lacks the date', async () => {
    const azan = await parseAzanFile(fixture('AZAN-2026-06.txt'))
    const { warnings } = composeDay(
      { year: 2026, month: 7, day: 1 },
      { athanLinesForDate: (d) => athanLinesForDate(azan, d) }
    )
    expect(warnings.some((w) => w.includes('No athan times'))).toBe(true)
  })
})
