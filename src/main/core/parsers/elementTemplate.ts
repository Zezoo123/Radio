import ExcelJS from 'exceljs'
import { weekday } from '../dates'
import { WEEKDAY_LABELS } from '../format/types'
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
 * hard-coded. A filled track cell on day d yields `<CODE>-<TRACK>` (the code
 * keeps its own underscores; the track is joined with a dash). The special
 * cell value `1`
 * means "play the code itself once" and yields the bare `<CODE>` with no track
 * suffix.
 */

interface DayColumn {
  col: number
  day: number
  month: number
  year: number
}

export interface PlayedDayColumn {
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

/**
 * A day cell's individual track values. Cells usually hold one letter, but can
 * carry several — `A B` means both tracks play at that time, so each token
 * becomes its own event. The `1` sentinel stays a single token.
 */
export function trackTokens(raw: string): string[] {
  return raw.split(/[^A-Za-z0-9]+/).filter(Boolean)
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
    for (const token of trackTokens(track)) {
      // A `1` means "play the code itself once" — emit the bare code with no
      // track suffix. Any other value is a track letter → `<CODE>-<TRACK>`.
      const name = token === '1' ? tpl.code : `${tpl.code}-${token}`
      events.push({ time: row.time, cue: '+', name, category: tpl.category })
    }
  }
  events.sort((a, b) => a.time.localeCompare(b.time))
  return events
}

/** The section (header + events) this template contributes for one date. */
export function sectionForDate(tpl: ElementTemplate, date: CalendarDate): Section {
  return { code: tpl.code, group: tpl.group, events: eventsForDate(tpl, date) }
}

/** One template's plan as a dates × hours matrix (the Import grid preview). */
export interface TemplateGrid {
  code: string
  group: string
  /** Every date the template covers, chronological. */
  days: { iso: string; day: number; month: number; weekday: string }[]
  /**
   * One row per broadcast HOUR (`HH:00`): each cell aggregates every play of
   * that hour on that day as sorted track letters — `AAB` = A twice, B once,
   * regardless of the exact minutes. `count` totals the row's plays.
   */
  rows: { time: string; cells: (string | null)[]; count: number }[]
  /** Plays per day (aligned with `days`). */
  totals: number[]
  /**
   * Every distinct track token used anywhere in the plan, sorted — real token
   * strings (`A`, `F01`, …), with the `1` sentinel included when the bare code
   * plays. Tracks can be multi-character, so consumers must never derive this
   * from the display cells.
   */
  tracks: string[]
}

/** `['1','1']` → `2` · `['A','A','A','B','B']` → `3A 2B` · `['1','A']` → `1 A`. */
export function formatHourCell(tokens: string[]): string {
  const counts = new Map<string, number>()
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
  const parts: string[] = []
  const bare = counts.get('1')
  if (bare != null) {
    parts.push(String(bare)) // sentinel plays: just how many times the code airs
    counts.delete('1')
  }
  for (const [track, n] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(n > 1 ? `${n}${track}` : track)
  }
  return parts.join(' ')
}

/**
 * The day columns the element actually PLAYS on, date-sorted. Templates often
 * carry months of empty day columns around a short campaign, so "covers" and
 * the Booking plan view use this range rather than the sheet's full span.
 */
export function playedDayColumns(tpl: ElementTemplate): PlayedDayColumn[] {
  const played = new Set<number>()
  for (const row of tpl.timeRows) for (const [col, track] of row.tracks) if (track) played.add(col)
  return [...tpl.dayColumns]
    .filter((c) => played.has(c.col))
    .sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)
}

export function templateGrid(tpl: ElementTemplate): TemplateGrid {
  const cols = [...tpl.dayColumns].sort(
    (a, b) => a.year - b.year || a.month - b.month || a.day - b.day
  )
  const days = cols.map((c) => ({
    iso: `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`,
    day: c.day,
    month: c.month,
    weekday: WEEKDAY_LABELS[weekday({ year: c.year, month: c.month, day: c.day })]
  }))

  // Condense the minute-level rows into hours: hour → dayIndex → track tokens.
  // Multi-value cells (`A B`) contribute every token, so nothing is lost.
  //
  // Cell display: the `1` sentinel (bare code, no tracks) shows as the PLAY
  // COUNT — two plays render `2`, never `11`. Track letters compress to
  // `3A 2B` (count + letter, single plays as the bare letter).
  const byHour = new Map<string, string[][]>()
  for (const row of tpl.timeRows) {
    const hour = row.time.slice(0, 2)
    let slots = byHour.get(hour)
    if (!slots) {
      slots = cols.map(() => [])
      byHour.set(hour, slots)
    }
    cols.forEach((c, i) => {
      const raw = row.tracks.get(c.col)
      if (raw) slots![i].push(...trackTokens(raw))
    })
  }

  const totals = cols.map(() => 0)
  const rows = [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, slots]) => {
      slots.forEach((tokens, i) => (totals[i] += tokens.length))
      const cells = slots.map((tokens) => (tokens.length ? formatHourCell(tokens) : null))
      const count = slots.reduce((sum, tokens) => sum + tokens.length, 0)
      return { time: `${hour}:00`, cells, count }
    })
  const trackSet = new Set<string>()
  for (const row of tpl.timeRows) {
    for (const raw of row.tracks.values()) for (const t of trackTokens(raw)) trackSet.add(t)
  }
  const tracks = [...trackSet].sort((a, b) => a.localeCompare(b))

  return { code: tpl.code, group: tpl.group, days, rows, totals, tracks }
}
