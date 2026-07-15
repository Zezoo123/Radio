import type { CalendarDate, ScheduleDay, Section } from '../types'
import { dateRange } from '../dates'
import { serialize } from '../export/simian'
import { sectionForDate, type ElementTemplate } from '../parsers/elementTemplate'
import { hourlyMarkerLines, DEFAULT_HOURLY, type HourlyOptions } from './hourly'

/**
 * Assembles the section-grouped day(s) the station exports to Simian: per-day
 * date header, then clock rows, hourly comment markers, the computed azan block
 * (per the AZAN format), and one section per element template. Times are sorted
 * within each section, matching the sample files.
 */

export interface ComposeOptions {
  /** Element templates, emitted as sections in this order. */
  templates?: ElementTemplate[]
  /** Fully-formatted azan rows for a given date (computed per the AZAN format). */
  azanLinesForDate?: (date: CalendarDate) => string[] | null
  /** Resolved week-grid clock rows for a given date (from the Formats set). */
  formatLinesForDate?: (date: CalendarDate) => string[]
  /** Promo rows (program trailers) for a given date. */
  promoLinesForDate?: (date: CalendarDate) => string[]
  /** Top-of-hour comment markers. */
  hourly?: HourlyOptions
}

export interface ComposedSchedule {
  days: ScheduleDay[]
  /** e.g. program titles with no file-name mapping. */
  warnings: string[]
}

function composeOneDay(date: CalendarDate, opts: ComposeOptions): ScheduleDay {
  const sections: Section[] = []

  for (const tpl of opts.templates ?? []) {
    sections.push(sectionForDate(tpl, date))
  }

  const provided = opts.azanLinesForDate?.(date)
  const azanLines = provided?.length ? provided : undefined

  const hourly = opts.hourly ?? DEFAULT_HOURLY
  const hourlyLines = hourlyMarkerLines(hourly)

  const formatLines = opts.formatLinesForDate?.(date)
  const promoLines = opts.promoLinesForDate?.(date)

  return { ...date, formatLines, hourlyLines, azanLines, promoLines, sections }
}

export function composeDay(date: CalendarDate, opts: ComposeOptions): ComposedSchedule {
  return { days: [composeOneDay(date, opts)], warnings: [] }
}

export function composeRange(
  start: CalendarDate,
  end: CalendarDate,
  opts: ComposeOptions
): ComposedSchedule {
  const days = dateRange(start, end).map((date) => composeOneDay(date, opts))
  return { days, warnings: [] }
}

/** Compose a range and serialize it to a Simian-importable string. */
export function exportRange(start: CalendarDate, end: CalendarDate, opts: ComposeOptions): {
  text: string
  warnings: string[]
} {
  const { days, warnings } = composeRange(start, end, opts)
  return { text: serialize(days), warnings }
}
