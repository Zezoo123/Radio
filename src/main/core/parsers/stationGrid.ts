import ExcelJS from 'exceljs'
import { buildMergeMap, extractText, masterOf, type MergeMap } from '../xlsx'
import { weekday } from '../dates'
import { resolveProgramName, normalizeTitle, type ProgramMap } from '../programMap'
import type { CalendarDate, ScheduleEvent } from '../types'

/**
 * Parses a station grid: a weekly program schedule with a weekday header
 * (Sunday…Saturday), a time-segment column, and a program name in each
 * day/segment cell. Programs that span multiple days and/or multiple hours use
 * merged cells; a program is emitted once at the TOP of its merge block (so a
 * 3-hour show fires once at its start, not every hour).
 */

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
]

const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

interface GridCell {
  program: string
  isStart: boolean
}

interface GridSegment {
  start: string
  end: string
}

export interface StationGrid {
  sheet: string
  title: string
  /** weekday (0=Sun … 6=Sat) → column number, or -1 if that day isn't present. */
  dayColumns: number[]
  segments: GridSegment[]
  /** cells[segmentIndex][weekday]. */
  cells: GridCell[][]
}

export interface ProgramSchedule {
  events: ScheduleEvent[]
  /** Distinct program titles that had no file-name mapping. */
  unmapped: string[]
}

function pad2(n: string): string {
  return n.padStart(2, '0')
}

function cellTextAt(ws: ExcelJS.Worksheet, merges: MergeMap, row: number, col: number): string {
  const [mr, mc] = masterOf(merges, row, col)
  return extractText(ws.getRow(mr).getCell(mc)).trim()
}

function findHeaderRow(
  ws: ExcelJS.Worksheet,
  merges: MergeMap
): { row: number; dayColumns: number[]; labelCol: number } | null {
  for (let r = 1; r <= ws.rowCount; r++) {
    const dayColumns = new Array(7).fill(-1)
    let labelCol = -1
    let found = 0
    for (let c = 1; c <= ws.columnCount; c++) {
      const text = cellTextAt(ws, merges, r, c).toLowerCase()
      if (!text) continue
      if (/time/.test(text)) labelCol = c
      const wd = WEEKDAY_NAMES.findIndex((name) => text.startsWith(name))
      if (wd >= 0 && dayColumns[wd] === -1) {
        dayColumns[wd] = c
        found++
      }
    }
    if (dayColumns[0] !== -1 && dayColumns[6] !== -1 && found >= 5) {
      if (labelCol === -1) labelCol = dayColumns[0] - 1
      return { row: r, dayColumns, labelCol }
    }
  }
  return null
}

function findTitle(ws: ExcelJS.Worksheet, merges: MergeMap, beforeRow: number): string {
  for (let r = 1; r < beforeRow; r++) {
    let best = ''
    for (let c = 1; c <= ws.columnCount; c++) {
      const t = cellTextAt(ws, merges, r, c)
      if (t.length > best.length) best = t
    }
    if (best) return best
  }
  return ''
}

export function parseStationGridWorkbook(wb: ExcelJS.Workbook, sheet?: string): StationGrid {
  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0]
  if (!ws) throw new Error(`Station grid sheet not found: ${sheet ?? '(first)'}`)

  const merges = buildMergeMap(ws)
  const header = findHeaderRow(ws, merges)
  if (!header) throw new Error('Could not find a weekday header row (Sunday…Saturday)')

  const title = findTitle(ws, merges, header.row)
  const segments: GridSegment[] = []
  const cells: GridCell[][] = []

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const label = cellTextAt(ws, merges, r, header.labelCol)
    const m = label.match(TIME_RANGE_RE)
    if (!m) continue
    segments.push({ start: `${pad2(m[1])}:${m[2]}:00`, end: `${pad2(m[3])}:${m[4]}:00` })

    const rowCells: GridCell[] = []
    for (let wd = 0; wd < 7; wd++) {
      const col = header.dayColumns[wd]
      if (col === -1) {
        rowCells.push({ program: '', isStart: false })
        continue
      }
      const [mr] = masterOf(merges, r, col)
      rowCells.push({ program: cellTextAt(ws, merges, r, col), isStart: mr === r })
    }
    cells.push(rowCells)
  }

  return { sheet: ws.name, title, dayColumns: header.dayColumns, segments, cells }
}

export async function parseStationGrid(filePath: string, sheet?: string): Promise<StationGrid> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return parseStationGridWorkbook(wb, sheet)
}

export async function listGridSheets(filePath: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return wb.worksheets.map((w) => w.name)
}

/** Program events for one date: one event per program at its segment start. */
export function programsForDate(
  grid: StationGrid,
  date: CalendarDate,
  map: ProgramMap = {}
): ProgramSchedule {
  const wd = weekday(date)
  const events: ScheduleEvent[] = []
  const unmapped = new Set<string>()

  grid.segments.forEach((segment, i) => {
    const cell = grid.cells[i]?.[wd]
    if (!cell || !cell.program || !cell.isStart) return
    const { name, mapped } = resolveProgramName(map, cell.program)
    if (!mapped) unmapped.add(normalizeTitle(cell.program))
    events.push({ time: segment.start, cue: '+', name })
  })

  events.sort((a, b) => a.time.localeCompare(b.time))
  return { events, unmapped: [...unmapped] }
}

/** Distinct normalized program titles in the grid (for building the map UI). */
export function programTitles(grid: StationGrid): string[] {
  const titles = new Set<string>()
  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell.program && cell.isStart) titles.add(normalizeTitle(cell.program))
    }
  }
  return [...titles].sort()
}
