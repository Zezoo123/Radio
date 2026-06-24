import type { CalendarDate, ScheduleEvent } from '../types'
import { eventLine, ruleLine } from '../export/simian'
import { weekday } from '../dates'
import { substituteDateTokens } from './tokens'
import type { FormatRow, FormatSet, HourFormat, WeekGrid } from './types'
import { WEEKDAY_LABELS } from './types'

const pad2 = (n: number): string => String(n).padStart(2, '0')
const LINE_SEP = '\r\n'

/**
 * Expand one format's rows into events at a given hour (0-23). When `date` is
 * given, date-sensitive tokens in name/description are substituted for it.
 */
export function expandFormatAtHour(
  format: HourFormat,
  hour: number,
  date?: CalendarDate
): ScheduleEvent[] {
  return format.rows
    .map((row) => rowToEvent(row, hour, date))
    .sort((a, b) => a.time.localeCompare(b.time))
}

function rowToEvent(row: FormatRow, hour: number, date?: CalendarDate): ScheduleEvent {
  const sub = (text: string | undefined): string | undefined =>
    text !== undefined && date ? substituteDateTokens(text, date) : text
  return {
    time: `${pad2(hour)}:${pad2(row.minute)}:${pad2(row.second)}`,
    cue: row.cue,
    name: sub(row.name) ?? row.name,
    category: sub(row.category),
    description: sub(row.description)
  }
}

function formatById(set: FormatSet, id: string | null): HourFormat | undefined {
  return id ? set.formats.find((f) => f.id === id) : undefined
}

function defaultClockById(set: FormatSet, id: string | null): HourFormat | undefined {
  return id ? set.defaultClocks?.find((c) => c.id === id) : undefined
}

/**
 * All events for one weekday (0=Sun…6=Sat), time-sorted. The day's chosen
 * default clock (if any) is applied to EVERY hour, layered under the per-hour
 * grid format. Pass `date` to substitute date-sensitive tokens.
 */
export function dayRows(set: FormatSet, wd: number, date?: CalendarDate): ScheduleEvent[] {
  const events: ScheduleEvent[] = []
  const row = set.grid.cells[wd] ?? []
  const defaultClock = defaultClockById(set, set.dayDefaults?.[wd] ?? null)
  for (let hour = 0; hour < 24; hour++) {
    if (defaultClock) events.push(...expandFormatAtHour(defaultClock, hour, date))
    const format = formatById(set, row[hour] ?? null)
    if (format) events.push(...expandFormatAtHour(format, hour, date))
  }
  return events.sort((a, b) => a.time.localeCompare(b.time))
}

/** Serialize one weekday's skeleton to Simian rows (no date header). */
export function serializeDay(set: FormatSet, wd: number): string {
  const lines = dayRows(set, wd).map(eventLine)
  return lines.length ? lines.join(LINE_SEP) + LINE_SEP : ''
}

/**
 * Serialize the schedule for a specific calendar date: the program derives the
 * weekday and substitutes date tokens for that date.
 */
export function serializeForDate(set: FormatSet, date: CalendarDate): string {
  const lines = dayRows(set, weekday(date), date).map(eventLine)
  return lines.length ? lines.join(LINE_SEP) + LINE_SEP : ''
}

/** Serialize the whole week, each weekday under a labeled comment block. */
export function serializeWeek(set: FormatSet): string {
  const lines: string[] = []
  for (let wd = 0; wd < 7; wd++) {
    lines.push(ruleLine())
    lines.push(`|||COMMENT|${WEEKDAY_LABELS[wd]}`)
    lines.push(ruleLine())
    for (const event of dayRows(set, wd)) lines.push(eventLine(event))
  }
  return lines.length ? lines.join(LINE_SEP) + LINE_SEP : ''
}

/** True if any cell in the grid references a format. */
export function gridHasAssignments(grid: WeekGrid): boolean {
  return grid.cells.some((row) => row.some((cell) => cell !== null))
}
