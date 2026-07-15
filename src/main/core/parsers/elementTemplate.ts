import ExcelJS from 'exceljs'
import type { CalendarDate, ScheduleEvent, Section } from '../types'

/**
 * Parses a per-group element template (ads / features / commercial liners — they
 * all share this layout):
 *
 *   row 1: GROUP | month | year   (month/year markers may repeat across columns
 *                                   for multi-month templates)
 *   row 2: CODE  | 1 | 2 | … | 31 (day-of-month numbers)
 *   row 3:       | M | T | W | …  (weekday letters — informational)
 *   row 4+: HH:MM:SS | A | | A | … (broadcast time; each day cell holds a track
 *                                   letter when the element plays that day)
 *
 * Header rows may be preceded by blank rows, so positions are detected, not
 * hard-coded. A filled track cell on day d yields `<CODE>_<TRACK>` (underscores
 * throughout; the code keeps its own underscores). The special cell value `1`
 * means "play the code itself once" and yields the bare `<CODE>` with no track
 * suffix.
 */

interface DayColumn {
  col: number
  day: number
  month: number
  year: number
}

interface MonthMarker {
  col: number
  month: number
  year: number
}

interface TimeRow {
  time: string
  /** column → track letter for that day. */
  tracks: Map<number, string>
}

export interface ElementTemplate {
  group: string
  code: string
  dayColumns: DayColumn[]
  timeRows: TimeRow[]
  /** Simian Category emitted for every event of this template (e.g. `AUDIO`). */
  category?: string
}

const TIME_RE = /^(\d{1,2}):(\d{2}):(\d{2})$/

/**
 * `H:MM:SS` → `HH:MM:SS` (Excel time cells often render without a leading
 * zero); null if the cell isn't a time. Emitted times must be exactly
 * HH:MM:SS — Simian's import and the chronological sort both rely on it.
 */
function normalizeTime(text: string): string | null {
  const m = TIME_RE.exec(text)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}`
}

function asInt(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return parseInt(value.trim(), 10)
  return null
}

function cellText(row: ExcelJS.Row, col: number): string {
  return (row.getCell(col).text ?? '').trim()
}

/** Collect rows that have at least one non-empty cell, in sheet order. */
function nonEmptyRows(ws: ExcelJS.Worksheet): ExcelJS.Row[] {
  const rows: ExcelJS.Row[] = []
  ws.eachRow({ includeEmpty: false }, (row) => rows.push(row))
  return rows
}

/** Month/year blocks: a marker is `month(1-12)` immediately followed by a year. */
function findMarkers(groupRow: ExcelJS.Row, maxCol: number): MonthMarker[] {
  const markers: MonthMarker[] = []
  for (let col = 1; col <= maxCol; col++) {
    const month = asInt(groupRow.getCell(col).value)
    const year = asInt(groupRow.getCell(col + 1).value)
    if (month !== null && month >= 1 && month <= 12 && year !== null && year >= 1900) {
      markers.push({ col, month, year })
    }
  }
  return markers
}

function markerFor(markers: MonthMarker[], col: number): MonthMarker | null {
  let chosen: MonthMarker | null = null
  for (const m of markers) {
    if (m.col <= col && (!chosen || m.col > chosen.col)) chosen = m
  }
  return chosen
}

export function parseElementWorkbook(wb: ExcelJS.Workbook): ElementTemplate {
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Element template has no worksheets')

  const rows = nonEmptyRows(ws)
  if (rows.length < 4) throw new Error('Element template is missing header or time rows')

  const [groupRow, codeRow, , ...rest] = rows
  const maxCol = ws.columnCount

  const group = cellText(groupRow, 1)
  const code = cellText(codeRow, 1)
  if (!group) throw new Error('Element template is missing a group name in row 1')
  if (!code) throw new Error('Element template is missing a code in row 2')

  const markers = findMarkers(groupRow, maxCol)

  const dayColumns: DayColumn[] = []
  for (let col = 2; col <= maxCol; col++) {
    const day = asInt(codeRow.getCell(col).value)
    if (day === null || day < 1 || day > 31) continue
    const marker = markerFor(markers, col)
    if (!marker) continue
    dayColumns.push({ col, day, month: marker.month, year: marker.year })
  }

  const timeRows: TimeRow[] = []
  for (const row of rest) {
    const time = normalizeTime(cellText(row, 1))
    if (!time) continue
    const tracks = new Map<number, string>()
    for (const dc of dayColumns) {
      const track = cellText(row, dc.col)
      if (track) tracks.set(dc.col, track)
    }
    timeRows.push({ time, tracks })
  }

  return { group, code, dayColumns, timeRows }
}

export async function parseElementTemplate(filePath: string): Promise<ElementTemplate> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return parseElementWorkbook(wb)
}

/** Events for one date, sorted by time. Empty if the date isn't in the template. */
export function eventsForDate(tpl: ElementTemplate, date: CalendarDate): ScheduleEvent[] {
  const column = tpl.dayColumns.find(
    (dc) => dc.day === date.day && dc.month === date.month && dc.year === date.year
  )
  if (!column) return []

  const events: ScheduleEvent[] = []
  for (const row of tpl.timeRows) {
    const track = row.tracks.get(column.col)
    if (!track) continue
    // A cell of `1` means "play the code itself once" — emit the bare code with
    // no track suffix. Any other value is a track letter → `<CODE>_<TRACK>`.
    const name = track === '1' ? tpl.code : `${tpl.code}_${track}`
    events.push({ time: row.time, cue: '+', name, category: tpl.category })
  }
  events.sort((a, b) => a.time.localeCompare(b.time))
  return events
}

/** The section (header + events) this template contributes for one date. */
export function sectionForDate(tpl: ElementTemplate, date: CalendarDate): Section {
  return { code: tpl.code, group: tpl.group, events: eventsForDate(tpl, date) }
}
