import type { CalendarDate, ScheduleDay, Section } from '../types'
import { dateRange } from '../dates'
import { serialize } from '../export/simian'
import { sectionForDate, type ElementTemplate } from '../parsers/elementTemplate'
import { programsForDate, type StationGrid } from '../parsers/stationGrid'
import type { ProgramMap } from '../programMap'

/**
 * Assembles the section-grouped day(s) the station exports to Simian. Each
 * source becomes its own section block (programs, then one per element
 * template), under the per-day date header. Times are sorted within each
 * section, matching the sample files.
 *
 * NOTE: athan and hourly-comment blocks are intentionally not emitted yet — the
 * exact row formats are pending the user's example lines. They will slot in here
 * as additional sections / comment blocks without disturbing this structure.
 */

export interface ComposeOptions {
  grid?: StationGrid
  programMap?: ProgramMap
  /** Section header for the program block. Defaults to the grid title. */
  programSection?: { code: string; label: string }
  /** Element templates, emitted as sections in this order. */
  templates?: ElementTemplate[]
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

  if (opts.grid) {
    const { events, unmapped } = programsForDate(opts.grid, date, opts.programMap ?? {})
    for (const title of unmapped) warnings.add(`No file name mapped for program: "${title}"`)
    const code = opts.programSection?.code ?? 'PRG'
    const label = opts.programSection?.label ?? opts.grid.title ?? 'PROGRAMS'
    sections.push({ code, group: label, events })
  }

  for (const tpl of opts.templates ?? []) {
    sections.push(sectionForDate(tpl, date))
  }

  return { ...date, sections }
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
