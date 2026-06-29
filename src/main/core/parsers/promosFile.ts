import ExcelJS from 'exceljs'
import { extractText } from '../xlsx'

/**
 * Parses the station's "promos" workbook — one row per program promo. The sheet
 * has a 3-row banded header (data starts at the first row that carries both a
 * program name and a promo file name):
 *
 *   col 1   Program Name
 *   col 2   Presenter
 *   col 3   Contract start date          col 4   Contract end ("TFN")
 *   col 5–11  Weekly airdays  S M T W T F S (Y/N) — when the PROGRAM airs
 *   col 12–13 Daily airtime From / To (Excel datetime serials)
 *   col 14  Promo FileName               col 15  Duration (sec)
 *   col 16–22 Per-weekday promo COUNT  S M T W T F S
 *   col 23  Recorded? (Yes/No)
 *
 * The weekday letters `S M T W T F S` map to Sun..Sat (index 0..6), matching
 * `weekday()` in dates.ts. The promo-count columns are independent of the airday
 * columns: a promo may run on days the program does NOT air (to drive tune-in);
 * the airtime only defines the program's blackout window.
 */

/** One promo program parsed from the workbook. `fileName` doubles as its id. */
export interface PromoEntry {
  program: string
  presenter: string
  /** Promo audio file name, e.g. `HP25-LazizWeSay2`. Unique → used as the id. */
  fileName: string
  durationSec: number
  recorded: boolean
  /** length 7, Sun..Sat — when the PROGRAM airs (drives the blackout window). */
  airDays: boolean[]
  /** Hour (0-23) the program starts, or null when no airtime is given. */
  airStartHour: number | null
  /** Hour (0-23) the program ends, or null. */
  airEndHour: number | null
  /** True when the airtime wraps past midnight (end earlier than start). */
  airWraps: boolean
  /** Display strings, `HH:MM` (empty when absent). */
  airStart: string
  airEnd: string
  /** length 7, Sun..Sat — how many promos to air that weekday. */
  promoCounts: number[]
}

export interface PromoSet {
  entries: PromoEntry[]
}

const AIRDAY_COLS = [5, 6, 7, 8, 9, 10, 11] // Sun..Sat
const COUNT_COLS = [16, 17, 18, 19, 20, 21, 22] // Sun..Sat
const COL_PROGRAM = 1
const COL_PRESENTER = 2
const COL_FROM = 12
const COL_TO = 13
const COL_FILE = 14
const COL_DURATION = 15
const COL_RECORDED = 23

const pad2 = (n: number): string => String(n).padStart(2, '0')

function asInt(text: string): number {
  const n = parseInt(text.trim(), 10)
  return Number.isFinite(n) ? n : 0
}

/** Read an airtime cell → {hour, minute}, or null when empty/unparseable. */
function readTime(cell: ExcelJS.Cell): { hour: number; minute: number } | null {
  const v = cell.value as unknown
  // exceljs maps an Excel time serial (a fraction of a day) onto a UTC instant
  // on 1899-12-30 — e.g. 0.3333 → 08:00:00Z — identically on every machine. So
  // getUTCHours()/getUTCMinutes() recover the wall-clock the user typed, with no
  // timezone drift. (getHours() would shift by the local offset and be wrong off
  // the authoring machine.)
  if (v instanceof Date) return { hour: v.getUTCHours(), minute: v.getUTCMinutes() }
  const m = extractText(cell).match(/(\d{1,2}):(\d{2})/)
  if (m) return { hour: +m[1], minute: +m[2] }
  return null
}

export function parsePromosWorkbook(wb: ExcelJS.Workbook): PromoSet {
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Promos workbook has no worksheets')

  const entries: PromoEntry[] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const program = extractText(row.getCell(COL_PROGRAM)).trim()
    const fileName = extractText(row.getCell(COL_FILE)).trim()
    // A data row has both a program name and a promo file name. This skips the
    // banded header (where col 14 reads "FileName") and any stray rows.
    if (!program || !fileName || fileName.toLowerCase() === 'filename') return

    const from = readTime(row.getCell(COL_FROM))
    const to = readTime(row.getCell(COL_TO))
    const airStartHour = from ? from.hour : null
    const airEndHour = to ? to.hour : null
    const airWraps =
      from != null && to != null && (to.hour < from.hour || (to.hour === from.hour && to.minute < from.minute))

    entries.push({
      program,
      presenter: extractText(row.getCell(COL_PRESENTER)).trim(),
      fileName,
      durationSec: asInt(extractText(row.getCell(COL_DURATION))),
      recorded: /^y/i.test(extractText(row.getCell(COL_RECORDED)).trim()),
      airDays: AIRDAY_COLS.map((c) => /^y/i.test(extractText(row.getCell(c)).trim())),
      airStartHour,
      airEndHour,
      airWraps,
      airStart: from ? `${pad2(from.hour)}:${pad2(from.minute)}` : '',
      airEnd: to ? `${pad2(to.hour)}:${pad2(to.minute)}` : '',
      promoCounts: COUNT_COLS.map((c) => asInt(extractText(row.getCell(c))))
    })
  })

  return { entries }
}

export async function parsePromosFile(filePath: string): Promise<PromoSet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return parsePromosWorkbook(wb)
}
