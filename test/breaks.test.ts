import { describe, expect, it } from 'vitest'
import { sequenceBreaks } from '@core/schedule/breaks'
import { composeDay } from '@core/schedule/compose'
import type { ElementTemplate } from '@core/parsers/elementTemplate'
import type { Section } from '@core/types'

const SUNDAY = { year: 2026, month: 6, day: 7 }

function section(code: string, category: string, times: string[]): Section {
  return {
    code,
    group: code,
    events: times.map((time) => ({ time, cue: '+' as const, name: `${code}-A`, category }))
  }
}

/** A one-day template playing `code` once at each time, with the given category. */
function template(code: string, category: string, times: string[]): ElementTemplate {
  return {
    group: code,
    code,
    category,
    dayColumns: [{ col: 2, day: SUNDAY.day, month: SUNDAY.month, year: SUNDAY.year }],
    timeRows: times.map((time) => ({ time, tracks: new Map([[2, '1']]) }))
  }
}

describe('sequenceBreaks — priority order within a break', () => {
  it('orders one break LI_C → ADV → FEA → PROMO via the seconds field', () => {
    const sections = [
      section('FEAT', 'FEA', ['10:30:00']),
      section('ADS', 'ADV', ['10:30:00']),
      section('LINER', 'LI_C', ['10:30:00'])
    ]
    const promoLines = ['10:30:00|+|PR_X|PROMO|Presenter']

    const out = sequenceBreaks(sections, promoLines)

    expect(out.sections.find((s) => s.code === 'LINER')!.events[0].time).toBe('10:30:00')
    expect(out.sections.find((s) => s.code === 'ADS')!.events[0].time).toBe('10:30:01')
    expect(out.sections.find((s) => s.code === 'FEAT')!.events[0].time).toBe('10:30:02')
    expect(out.promoLines![0]).toBe('10:30:03|+|PR_X|PROMO|Presenter')
  })

  it('treats each break minute of the hour independently (:10 :30 :50)', () => {
    const sections = [
      section('ADS', 'ADV', ['09:10:00', '09:30:00', '09:50:00']),
      section('LINER', 'LI_C', ['09:10:00', '09:30:00', '09:50:00'])
    ]
    const out = sequenceBreaks(sections)
    expect(out.sections[0].events.map((e) => e.time)).toEqual(['09:10:01', '09:30:01', '09:50:01'])
    expect(out.sections[1].events.map((e) => e.time)).toEqual(['09:10:00', '09:30:00', '09:50:00'])
  })

  it('leaves a single-item minute untouched (keeps its original seconds)', () => {
    const out = sequenceBreaks([section('ADS', 'ADV', ['08:45:30'])])
    expect(out.sections[0].events[0].time).toBe('08:45:30')
  })

  it('keeps emit order between items of the same priority', () => {
    const out = sequenceBreaks([
      section('ADS_1', 'ADV', ['12:10:00']),
      section('ADS_2', 'ADV', ['12:10:00'])
    ])
    expect(out.sections[0].events[0].time).toBe('12:10:00')
    expect(out.sections[1].events[0].time).toBe('12:10:01')
  })

  it('puts unlisted categories after PROMO', () => {
    const out = sequenceBreaks(
      [section('MISC', 'AUDIO', ['14:50:00'])],
      ['14:50:00|+|PR_X|PROMO|P']
    )
    expect(out.promoLines![0].startsWith('14:50:00|')).toBe(true)
    expect(out.sections[0].events[0].time).toBe('14:50:01')
  })

  it('never moves a timed row', () => {
    const sections = [section('ADS', 'ADV', ['16:10:00']), section('LINER', 'LI_C', ['16:10:00'])]
    sections[0].events.push({ time: '16:10:00', cue: '@', name: 'HARD', category: 'MACRO' })
    const out = sequenceBreaks(sections)
    const timed = out.sections[0].events.find((e) => e.cue === '@')!
    expect(timed.time).toBe('16:10:00')
    // The sequential rows still sequence among themselves.
    expect(out.sections[1].events[0].time).toBe('16:10:00')
    expect(out.sections[0].events.find((e) => e.cue === '+')!.time).toBe('16:10:01')
  })

  it('does not mutate its inputs', () => {
    const sections = [section('ADS', 'ADV', ['10:30:00']), section('LINER', 'LI_C', ['10:30:00'])]
    const promoLines = ['10:30:00|+|PR_X|PROMO|P']
    sequenceBreaks(sections, promoLines)
    expect(sections[0].events[0].time).toBe('10:30:00')
    expect(promoLines[0]).toBe('10:30:00|+|PR_X|PROMO|P')
  })
})

describe('compose — breaks are sequenced across templates and promos', () => {
  it('applies the priority seconds in the composed day', () => {
    const { days } = composeDay(SUNDAY, {
      templates: [
        template('FEAT', 'FEA', ['07:10:00']),
        template('ADS', 'ADV', ['07:10:00']),
        template('LINER', 'LI_C', ['07:10:00'])
      ],
      promoLinesForDate: () => ['07:10:00|+|PR_X|PROMO|Presenter']
    })
    const day = days[0]
    const timeOf = (code: string): string =>
      day.sections.find((s) => s.code === code)!.events[0].time
    expect(timeOf('LINER')).toBe('07:10:00')
    expect(timeOf('ADS')).toBe('07:10:01')
    expect(timeOf('FEAT')).toBe('07:10:02')
    expect(day.promoLines).toEqual(['07:10:03|+|PR_X|PROMO|Presenter'])
  })
})
