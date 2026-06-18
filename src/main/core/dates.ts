import type { CalendarDate } from './types'

/** Inclusive range of calendar dates from start to end. */
export function dateRange(start: CalendarDate, end: CalendarDate): CalendarDate[] {
  const out: CalendarDate[] = []
  let t = Date.UTC(start.year, start.month - 1, start.day)
  const endT = Date.UTC(end.year, end.month - 1, end.day)
  while (t <= endT) {
    const d = new Date(t)
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() })
    t += 24 * 60 * 60 * 1000
  }
  return out
}

/** 0 = Sunday … 6 = Saturday, for the given calendar date. */
export function weekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}
