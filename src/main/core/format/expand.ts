import type { ScheduleEvent } from '../types'
import { eventLine, ruleLine } from '../export/simian'
import type { FormatRow, FormatSet, HourFormat, WeekGrid } from './types'
import { WEEKDAY_LABELS } from './types'

const pad2 = (n: number): string => String(n).padStart(2, '0')
const LINE_SEP = '\r\n'

/** Expand one format's rows into events at a given hour (0-23). */
export function expandFormatAtHour(format: HourFormat, hour: number): ScheduleEvent[] {
  return format.rows
    .map((row) => rowToEvent(row, hour))
    .sort((a, b) => a.time.localeCompare(b.time))
}

function rowToEvent(row: FormatRow, hour: number): ScheduleEvent {
  return {
    time: `${pad2(hour)}:${pad2(row.minute)}:${pad2(row.second)}`,
    cue: row.cue,
    name: row.name,
    category: row.category,
    description: row.description
  }
}

function formatById(set: FormatSet, id: string | null): HourFormat | undefined {
  return id ? set.formats.find((f) => f.id === id) : undefined
}

/** All events for one weekday (0=Sun…6=Sat), every assigned hour, time-sorted. */
export function dayRows(set: FormatSet, weekday: number): ScheduleEvent[] {
  const events: ScheduleEvent[] = []
  const row = set.grid.cells[weekday] ?? []
  row.forEach((formatId, hour) => {
    const format = formatById(set, formatId)
    if (format) events.push(...expandFormatAtHour(format, hour))
  })
  return events.sort((a, b) => a.time.localeCompare(b.time))
}

/** Serialize one weekday's skeleton to Simian rows (no date header). */
export function serializeDay(set: FormatSet, weekday: number): string {
  const lines = dayRows(set, weekday).map(eventLine)
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
