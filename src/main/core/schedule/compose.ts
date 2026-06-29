import type { CalendarDate, ScheduleDay, Section } from '../types'
import { dateRange } from '../dates'
import { serialize } from '../export/simian'
import { sectionForDate, type ElementTemplate } from '../parsers/elementTemplate'
import { withRowCategory } from '../export/simian'
import { hourlyMarkerLines, DEFAULT_HOURLY, type HourlyOptions } from './hourly'

/**
 * Assembles the section-grouped day(s) the station exports to Simian: per-day
 * date header, then the verbatim athan block (from the AZAN file, if loaded),
 * then one section per element template. Times are sorted within each section,
 * matching the sample files.
 *
 * NOTE: hourly-comment rows are not emitted yet — that row format is still
 * pending the user's example. They will slot in here without disturbing this.
 */

export interface ComposeOptions {
  /** Element templates, emitted as sections in this order. */
  templates?: ElementTemplate[]
  /** Verbatim athan rows for a given date (from the AZAN file), if loaded. */
  athanLinesForDate?: (date: CalendarDate) => string[] | null
  /** When set, the Category column of every athan row is rewritten to this. */
  athanCategory?: string
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

function composeOneDay(
  date: CalendarDate,
  opts: ComposeOptions,
  warnings: Set<string>
): ScheduleDay {
  const sections: Section[] = []

  for (const tpl of opts.templates ?? []) {
    sections.push(sectionForDate(tpl, date))
  }

  const rawAthan = opts.athanLinesForDate?.(date) ?? undefined
  const athanLines =
    rawAthan && opts.athanCategory
      ? rawAthan.map((l) => withRowCategory(l, opts.athanCategory!))
      : rawAthan
  if (opts.athanLinesForDate && !athanLines) {
    warnings.add(
      `No athan times for ${date.year}-${String(date.month).padStart(2, '0')}-${String(
        date.day
      ).padStart(2, '0')} (load the matching AZAN month file)`
    )
  }

  const hourly = opts.hourly ?? DEFAULT_HOURLY
  const hourlyLines = hourlyMarkerLines(hourly)

  const formatLines = opts.formatLinesForDate?.(date)
  const promoLines = opts.promoLinesForDate?.(date)

  return { ...date, formatLines, hourlyLines, athanLines, promoLines, sections }
}

export function composeDay(date: CalendarDate, opts: ComposeOptions): ComposedSchedule {
  const warnings = new Set<string>()
  return { days: [composeOneDay(date, opts, warnings)], warnings: [...warnings] }
}

export function composeRange(
  start: CalendarDate,
  end: CalendarDate,
  opts: ComposeOptions
): ComposedSchedule {
  const warnings = new Set<string>()
  const days = dateRange(start, end).map((date) => composeOneDay(date, opts, warnings))
  return { days, warnings: [...warnings] }
}

/** Compose a range and serialize it to a Simian-importable string. */
export function exportRange(start: CalendarDate, end: CalendarDate, opts: ComposeOptions): {
  text: string
  warnings: string[]
} {
  const { days, warnings } = composeRange(start, end, opts)
  return { text: serialize(days), warnings }
}
