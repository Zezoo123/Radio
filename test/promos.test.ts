import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePromosFile, type PromoEntry } from '@core/parsers/promosFile'
import {
  allowedHoursForDate,
  autoHoursForDate,
  autoTimesForDate,
  blockedHoursForDate,
  placementsForWeek,
  preferredHour,
  promoEventsForDate,
  weekStartFor,
  type PromoExclusions
} from '@core/promos/schedule'
import { weekday } from '@core/dates'
import { eventLine, serialize } from '@core/export/simian'
import type { CalendarDate } from '@core/types'

const fixture = (name: string): string => resolve(__dirname, 'fixtures', name)

// June 2026: the 1st is a Monday, so the 7th is a Sunday and the 12th a Friday.
const SUN: CalendarDate = { year: 2026, month: 6, day: 7 }
const MON: CalendarDate = { year: 2026, month: 6, day: 8 }
const SUN_NEXT: CalendarDate = { year: 2026, month: 6, day: 14 }

async function load(): Promise<PromoEntry[]> {
  return (await parsePromosFile(fixture('Promos.xlsx'))).entries
}

const byFile = (entries: PromoEntry[], name: string): PromoEntry =>
  entries.find((e) => e.fileName === name)!

/** A 7-day exclusion array (Sun..Sat) with `hours` set on weekday `wd`. */
const wkExcl = (wd: number, hours: number[]): number[][] => {
  const week = Array.from({ length: 7 }, () => [] as number[])
  week[wd] = hours
  return week
}

describe('promos parser', () => {
  it('reads all program rows and skips the header band', async () => {
    const entries = await load()
    expect(entries).toHaveLength(20)
    expect(entries.map((e) => e.fileName)).not.toContain('FileName')
  })

  it('parses the first program (يا لذيذ يا سايق) correctly', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2')
    expect(e.program).toBe('يا لذيذ يا سايق')
    expect(e.presenter).toBe('ميرا العمرى')
    // Stored serials are 0.3333 / 0.4167 ⇒ 08:00 / 10:00 (timezone-independent).
    expect(e.airStartHour).toBe(8)
    expect(e.airEndHour).toBe(10)
    expect(e.airStart).toBe('08:00')
    expect(e.airEnd).toBe('10:00')
    expect(e.airWraps).toBe(false)
    // Airs Sun..Thu (Sun-indexed), off Fri+Sat (the Egyptian weekend).
    expect(e.airDays).toEqual([true, true, true, true, true, false, false])
    expect(e.promoCounts).toEqual([5, 5, 5, 5, 5, 5, 5])
    expect(e.recorded).toBe(false)
  })

  it('reads airtimes by UTC hour, immune to the local timezone', async () => {
    // Artistic: serials 0.8333 / 0.9167 ⇒ 20:00 / 22:00 (not the 22:05 the Cairo
    // LMT offset would render via getHours).
    const e = byFile(await load(), 'HP25-Artistic')
    expect(e.airStart).toBe('20:00')
    expect(e.airEnd).toBe('22:00')
    expect(e.airWraps).toBe(false)
  })
})

describe('promos blackout window (airtime + 2h)', () => {
  it('blocks the airtime through two hours after the end on airdays', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2') // 08:00–10:00 airday
    expect(weekday(SUN)).toBe(0)
    const blocked = blockedHoursForDate(e, SUN)
    expect([...blocked].sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12])
    const allowed = allowedHoursForDate(e, SUN)
    for (const h of [8, 9, 10, 11, 12]) expect(allowed).not.toContain(h)
    expect(preferredHour(e, SUN)).toBe(7) // the hour before the program
  })

  it('does not block on a day the program is off air', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2')
    const FRI: CalendarDate = { year: 2026, month: 6, day: 12 }
    expect(e.airDays[weekday(FRI)]).toBe(false)
    expect(blockedHoursForDate(e, FRI).size).toBe(0)
  })

  it('bleeds a wrapped airtime into the next morning', () => {
    // A synthetic 23:00→00:00 show airing only on Saturdays. Its +2h tail reaches
    // 02:00 on Sunday morning.
    const e: PromoEntry = {
      program: 'Late',
      presenter: '',
      fileName: 'LATE',
      durationSec: 30,
      recorded: true,
      airDays: [false, false, false, false, false, false, true], // Sat only
      airStartHour: 23,
      airEndHour: 0,
      airWraps: true,
      airStart: '23:00',
      airEnd: '00:00',
      promoCounts: [0, 0, 0, 0, 0, 0, 0]
    }
    const SAT: CalendarDate = { year: 2026, month: 6, day: 13 }
    expect(weekday(SAT)).toBe(6)
    expect(blockedHoursForDate(e, SAT).has(23)).toBe(true)
    // Sunday (the 14th) inherits the post-midnight tail 00,01,02.
    for (const h of [0, 1, 2]) expect(blockedHoursForDate(e, SUN_NEXT).has(h)).toBe(true)
  })
})

describe('promos distribution rules', () => {
  it('places exactly the requested count, at most one per hour', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2')
    const hours = autoHoursForDate(e, SUN)
    expect(hours).toHaveLength(5) // count for Sunday
    expect(new Set(hours).size).toBe(hours.length) // distinct ⇒ ≤1/hour
    for (const h of hours) expect(allowedHoursForDate(e, SUN)).toContain(h)
  })

  it('is deterministic for a given program + date', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2')
    expect(autoTimesForDate(e, SUN)).toEqual(autoTimesForDate(e, SUN))
  })

  it('differs from the previous day, next day, and the same weekday next week', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2')
    const today = autoHoursForDate(e, SUN).join(',')
    expect(today).not.toBe(autoHoursForDate(e, MON).join(','))
    expect(today).not.toBe(autoHoursForDate(e, { year: 2026, month: 6, day: 6 }).join(','))
    expect(today).not.toBe(autoHoursForDate(e, SUN_NEXT).join(','))
  })

  it('emits PROMO rows with the presenter as description', async () => {
    const set = { entries: await load() }
    const { events } = promoEventsForDate(set, SUN)
    const laziz = events.find((ev) => ev.name === 'HP25-LazizWeSay2')!
    expect(laziz.cue).toBe('+')
    expect(laziz.category).toBe('PROMO')
    expect(laziz.description).toBe('ميرا العمرى')
  })
})

describe('recorded flag is ignored for promos', () => {
  it('includes a promo in the export even when its program is not recorded', async () => {
    const set = { entries: await load() }
    // Laziz (Sun count 5) has Recorded = No, but its promo must still air.
    expect(byFile(set.entries, 'HP25-LazizWeSay2').recorded).toBe(false)
    const { events, warnings } = promoEventsForDate(set, SUN)
    expect(events.filter((e) => e.name === 'HP25-LazizWeSay2')).toHaveLength(5)
    expect(warnings.some((w) => w.toLowerCase().includes('recorded'))).toBe(false)
  })
})

describe('serialized output', () => {
  it('emits a PROMO row as HH:MM:SS|+|file|PROMO|presenter and sits before sections', async () => {
    const set = { entries: await load() }
    const { events } = promoEventsForDate(set, SUN)
    const promoLines = events.map(eventLine)
    const text = serialize([
      {
        ...SUN,
        promoLines,
        sections: [{ code: 'ADS_1710', group: 'Baheya', events: [] }]
      }
    ])
    // Row shape (Arabic presenter preserved).
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}\|\+\|HP25-LazizWeSay2\|PROMO\|ميرا العمرى/)
    // Promo block precedes the element section header.
    expect(text.indexOf('HP25-LazizWeSay2')).toBeLessThan(text.indexOf('ADS_1710'))
  })
})

describe('manual hour exclusions', () => {
  it('drops excluded hours from the allowed range and never schedules them', async () => {
    const e = byFile(await load(), 'HP25-LazizWeSay2') // blackout 8–12 on Sunday
    const excluded = [0, 1, 2, 20, 21, 22, 23]
    const allowed = allowedHoursForDate(e, SUN, excluded)
    for (const h of excluded) expect(allowed).not.toContain(h)
    for (const h of [8, 9, 10, 11, 12]) expect(allowed).not.toContain(h) // blackout still applies
    const hours = autoHoursForDate(e, SUN, excluded)
    for (const h of hours) expect(excluded).not.toContain(h)
  })

  it('flows through promoEventsForDate via the per-weekday exclusions map', async () => {
    const set = { entries: await load() }
    const blockSun = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
    // Exclude those hours on Sunday (weekday 0) only.
    const exclusions: PromoExclusions = { 'HP25-LazizWeSay2': wkExcl(0, blockSun) }
    const sun = promoEventsForDate(set, SUN, { exclusions })
      .events.filter((ev) => ev.name === 'HP25-LazizWeSay2')
      .map((ev) => parseInt(ev.time.slice(0, 2), 10))
    for (const h of sun) expect(blockSun).not.toContain(h)

    // Monday (weekday 1) is untouched, so it may still use those hours.
    const monHours = promoEventsForDate(set, MON, { exclusions })
      .events.filter((ev) => ev.name === 'HP25-LazizWeSay2')
      .map((ev) => parseInt(ev.time.slice(0, 2), 10))
    expect(monHours.some((h) => blockSun.includes(h))).toBe(true)
  })
})

describe('weekly placement', () => {
  it('returns 7 days per program with per-weekday exclusions applied', async () => {
    const set = { entries: await load() }
    const weekStart = weekStartFor(SUN)
    const exclusions: PromoExclusions = { 'HP25-LazizWeSay2': wkExcl(0, [13, 14, 15]) }
    const rows = placementsForWeek(set, weekStart, undefined, exclusions)
    const laziz = rows.find((r) => r.fileName === 'HP25-LazizWeSay2')!
    expect(laziz.days).toHaveLength(7)
    expect(laziz.days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    // Sunday carries the exclusion; the placed times avoid 13–15.
    const sun = laziz.days[0]
    expect(sun.excludedHours).toEqual([13, 14, 15])
    for (const t of sun.times) expect([13, 14, 15]).not.toContain(parseInt(t.slice(0, 2), 10))
    // Monday has no exclusion.
    expect(laziz.days[1].excludedHours).toEqual([])
  })
})

describe('time overrides', () => {
  it('replace the auto schedule when present', async () => {
    const set = { entries: await load() }
    const overrides = { 'HP25-LazizWeSay2': { '2026-06-07': ['06:30:00', '20:15:00'] } }
    const events = promoEventsForDate(set, SUN, { overrides }).events.filter(
      (e) => e.name === 'HP25-LazizWeSay2'
    )
    expect(events.map((e) => e.time)).toEqual(['06:30:00', '20:15:00'])
  })
})
