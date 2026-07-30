/**
 * Demo-world builders for the screenshot run. Everything here is FICTIONAL —
 * clients, programs, carts and songs — but shaped exactly like the real
 * station data so every screen looks like a live working day.
 *
 * The element-template sheets follow the layout `core/parsers/elementTemplate.ts`
 * documents (group row with month/year markers, code row with day numbers,
 * weekday letters, HH:MM:SS time rows holding track letters).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

const pad2 = (n: number): string => String(n).padStart(2, '0')

interface MonthSpec {
  year: number
  month: number // 1-12
}

/** Today's month and the next one — so "tomorrow" (the app default) is covered. */
export function demoMonths(): MonthSpec[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const next = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 }
  return [{ year: y, month: m }, next]
}

const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()
const weekdayOf = (y: number, m: number, d: number): number =>
  new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun

/** One booked element: which track letters play at (date, time slot). */
interface TemplateSpec {
  file: string
  group: string
  code: string
  times: string[]
  /** '' = does not play that day/slot; 'A', 'A B', '1' = plays. */
  cell: (day: number, weekday: number, slot: number) => string
}

export const DEMO_TEMPLATES: TemplateSpec[] = [
  {
    file: 'Nile Cola.xlsx',
    group: 'Nile Cola',
    code: 'ADV-2704',
    times: ['07:20:02', '09:20:02', '12:20:02', '15:20:02', '18:20:02', '21:20:02'],
    cell: (day, weekday, slot) => (weekday === 5 && slot < 2 ? 'A B' : day % 2 === 0 ? 'A' : 'B')
  },
  {
    file: 'Cairo Motors.xlsx',
    group: 'Cairo Motors',
    code: 'ADV-3110',
    times: ['08:40:02', '13:40:02', '19:40:02'],
    cell: (_day, weekday) => (weekday === 5 ? '' : 'A')
  },
  {
    file: 'Delta Bank.xlsx',
    group: 'Delta Bank',
    code: 'FEA-0930',
    times: ['10:20:02', '16:20:02'],
    cell: () => '1' // plays as the bare code, no track suffix
  },
  {
    file: 'Green Pharmacy.xlsx',
    group: 'Green Pharmacy',
    code: 'SER-1205',
    times: ['11:05:02', '14:05:02', '17:05:02', '20:05:02'],
    cell: (day, _weekday, slot) => 'ABC'[(day + slot) % 3]
  }
]

/** Write one element-template workbook in the station's sheet layout. */
async function writeTemplate(dir: string, spec: TemplateSpec): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  const months = demoMonths()

  const groupRow: (string | number)[] = [spec.group]
  const codeRow: (string | number)[] = [spec.code]
  const weekdayRow: string[] = ['']
  const dayCols: { day: number; weekday: number }[] = []

  for (const { year, month } of months) {
    // Month marker: month number immediately followed by the year, placed at
    // the first day column of the month's block.
    groupRow.push(month, year)
    const n = daysIn(year, month)
    for (let day = 1; day <= n; day++) {
      if (day > 2) groupRow.push('') // keep marker cells only at the block start
      codeRow.push(day)
      const wd = weekdayOf(year, month, day)
      weekdayRow.push('SMTWTFS'[wd])
      dayCols.push({ day, weekday: wd })
    }
  }

  ws.addRow(groupRow)
  ws.addRow(codeRow)
  ws.addRow(weekdayRow)
  spec.times.forEach((time, slot) => {
    const row: string[] = [time]
    for (const { day, weekday } of dayCols) row.push(spec.cell(day, weekday, slot))
    ws.addRow(row)
  })

  const path = join(dir, spec.file)
  await wb.xlsx.writeFile(path)
  return path
}

/** All demo element templates → their file paths (for the stubbed open dialog). */
export async function writeDemoTemplates(dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true })
  const paths: string[] = []
  for (const spec of DEMO_TEMPLATES) paths.push(await writeTemplate(dir, spec))
  return paths
}

// ---------------------------------------------------------------------------
// Persisted stores seeded into the temporary userData directory
// ---------------------------------------------------------------------------

interface Row {
  hours?: number[]
  minute: number
  second: number
  cue: '+' | '@' | '#'
  name: string
  category?: string
  description?: string
  nextDay?: boolean
  logRow?: boolean
}

const clock = (
  id: string,
  name: string,
  color: string,
  rows: Row[]
): { id: string; name: string; color: string; rows: Row[] } => ({ id, name, color, rows })

/** The GRID tab's format set: 4 clocks painted over the week + a day default. */
export function demoFormatSet(): unknown {
  const formats = [
    clock('clk-morning', 'Morning', '#e0a23c', [
      { minute: 0, second: 0, cue: '@', name: '' },
      {
        minute: 0,
        second: 2,
        cue: '+',
        name: 'JIN-SUNRISE',
        category: 'AUDIO',
        description: 'Morning jingle'
      },
      { minute: 20, second: 0, cue: '@', name: '' },
      {
        minute: 20,
        second: 2,
        cue: '+',
        name: 'TRF-[yymmdd]',
        category: 'FEA',
        description: 'Traffic check'
      },
      { minute: 40, second: 0, cue: '@', name: '' },
      { minute: 40, second: 2, cue: '+', name: 'HID-04', category: 'LI', description: 'Station ID' }
    ]),
    clock('clk-daytime', 'Daytime', '#4f8cff', [
      { minute: 0, second: 0, cue: '@', name: '' },
      {
        minute: 0,
        second: 2,
        cue: '+',
        name: 'JIN-DAY',
        category: 'AUDIO',
        description: 'Daytime jingle'
      },
      { minute: 30, second: 0, cue: '@', name: '' },
      { minute: 30, second: 2, cue: '+', name: 'HID-07', category: 'LI', description: 'Station ID' }
    ]),
    clock('clk-evening', 'Evening', '#c264e0', [
      { minute: 0, second: 0, cue: '@', name: '' },
      {
        minute: 0,
        second: 2,
        cue: '+',
        name: 'JIN-NIGHT',
        category: 'AUDIO',
        description: 'Evening jingle'
      },
      {
        minute: 15,
        second: 0,
        cue: '+',
        name: 'ENT-[yymmdd]',
        category: 'FEA',
        description: 'Entertainment news'
      },
      { minute: 45, second: 0, cue: '@', name: '' },
      { minute: 45, second: 2, cue: '+', name: 'HID-11', category: 'LI', description: 'Station ID' }
    ]),
    clock('clk-friday', 'Friday', '#49c281', [
      { minute: 0, second: 0, cue: '@', name: '' },
      {
        minute: 0,
        second: 2,
        cue: '+',
        name: 'GOMAA-INTRO',
        category: 'AUDIO',
        description: 'Friday opener'
      },
      {
        minute: 30,
        second: 0,
        cue: '+',
        name: 'DUA-[yymmdd]',
        category: 'FEA',
        description: 'Friday dua'
      }
    ])
  ]

  const cells: (string | null)[][] = Array.from({ length: 7 }, () => new Array(24).fill(null))
  const paint = (wd: number, from: number, to: number, id: string): void => {
    for (let h = from; h <= to; h++) cells[wd][h] = id
  }
  for (const wd of [0, 1, 2, 3, 4, 6]) {
    paint(wd, 6, 9, 'clk-morning')
    paint(wd, 10, 15, 'clk-daytime')
    paint(wd, 16, 22, 'clk-evening')
  }
  paint(5, 6, 9, 'clk-morning')
  paint(5, 11, 13, 'clk-friday')
  paint(5, 16, 22, 'clk-evening')

  const defaultClocks = [
    clock('clk-base', 'Base Hour', '#7d8aa0', [
      { minute: 0, second: 0, cue: '@', name: '' },
      {
        minute: 0,
        second: 2,
        cue: '+',
        name: 'JIN-BASE',
        category: 'AUDIO',
        description: 'Hourly jingle'
      },
      {
        hours: [23],
        minute: 59,
        second: 59,
        cue: '@',
        name: 'H[yymmdd]',
        category: 'LOG',
        description: 'Load next day log',
        nextDay: true,
        logRow: true
      }
    ])
  ]

  return {
    formats,
    grid: { cells },
    categories: [
      'AUDIO',
      'COMMENT',
      'ADV',
      'FEA',
      'LI',
      'LI_C',
      'PROMO',
      'MACRO',
      'SER',
      'INTRO',
      'OUTRO',
      'SW',
      'LOG'
    ],
    defaultClocks,
    dayDefaults: Array.from({ length: 7 }, () => 'clk-base')
  }
}

/** Station rules only — the promo sheet itself is imported through the UI. */
export function demoPromosSeed(): unknown {
  return {
    fileName: null,
    set: { entries: [] },
    overrides: {},
    exclusions: {},
    rules: {
      // Fagr window blocked every day; Friday additionally blocks the Gomaa hours.
      blockedHours: [
        [2, 3, 4],
        [2, 3, 4],
        [2, 3, 4],
        [2, 3, 4],
        [2, 3, 4],
        [2, 3, 4, 11, 12],
        [2, 3, 4]
      ],
      breaks: [20, 40]
    }
  }
}

/** Category row colors so the LOG grid tints like a configured install. */
export function demoUiSettings(): unknown {
  return {
    categoryColors: {
      AUDIO: '#4f8cff',
      ADV: '#e0645f',
      FEA: '#49c281',
      LI: '#e0a23c',
      PROMO: '#c264e0',
      MACRO: '#7d8aa0'
    },
    categoryTextColors: {},
    tintOpacity: 35,
    textOpacity: 100
  }
}

// ---------------------------------------------------------------------------
// The Editor demo log (for the playout-simulation screenshot)
// ---------------------------------------------------------------------------

/**
 * A two-hour night log in Simian's six-column shape with real Lengths, engineered
 * so the Expected simulation shows every state: the 00:20 timed promo CUTS the
 * song playing then (red) and SKIPS the one queued behind it (yellow); the 00:40
 * `#` promo waits for its song then skips the queue; the 01:00 hour marker cuts
 * again. Durations come from the Length column, exactly as a Simian-saved log
 * carries them.
 */
export function demoEditorLog(): string {
  const now = new Date()
  const head = [
    '|||COMMENT|------------------------------------------------------------------------------------',
    `|||COMMENT|--------------------=§§    ${pad2(now.getDate())}   -   ${pad2(now.getMonth() + 1)}   -   ${now.getFullYear()}   §§=--------------------`,
    '|||COMMENT|------------------------------------------------------------------------------------'
  ]
  const songs: [string, string, string][] = [
    ['SNG-1204', '04:05', 'روتيشن ليلي A-12'],
    ['SNG-0871', '03:58', 'روتيشن ليلي A-13'],
    ['SNG-1440', '04:12', 'Night rotation B-04'],
    ['SNG-0233', '03:47', 'روتيشن ليلي A-14'],
    ['SNG-1092', '04:30', 'Night rotation B-05'],
    ['SNG-0655', '03:40', 'روتيشن ليلي A-15'],
    ['SNG-1310', '04:15', 'Night rotation B-06'],
    ['SNG-0518', '03:52', 'روتيشن ليلي A-16'],
    ['SNG-1177', '04:21', 'Night rotation B-07'],
    ['SNG-0740', '03:45', 'روتيشن ليلي A-17'],
    ['SNG-1503', '04:02', 'Night rotation B-08'],
    ['SNG-0964', '03:36', 'روتيشن ليلي A-18'],
    ['SNG-1621', '04:10', 'Night rotation B-09'],
    ['SNG-0387', '03:55', 'روتيشن ليلي A-19'],
    ['SNG-1755', '04:25', 'Night rotation B-10'],
    ['SNG-0812', '03:59', 'روتيشن ليلي A-20'],
    ['SNG-1888', '04:30', 'Night rotation B-11'],
    ['SNG-0449', '03:41', 'روتيشن ليلي A-21'],
    ['SNG-1930', '04:08', 'Night rotation B-12'],
    ['SNG-0576', '03:50', 'روتيشن ليلي A-22']
  ]
  const song = (i: number, time: string): string => {
    const [name, len, desc] = songs[i]
    return `${time}|+|${name}|${len}|AUDIO|${desc}`
  }
  const lines = [
    ...head,
    '00:00:00|@|',
    '00:00:02|+|JIN-NIGHT|00:12|AUDIO|Evening jingle',
    song(0, '00:00:14'),
    song(1, '00:04:19'),
    song(2, '00:08:17'),
    song(3, '00:12:29'),
    song(4, '00:16:16'), // playing at 00:20:00 → cut (red)
    song(5, '00:20:46'), // queued behind the cut → skipped (yellow)
    '00:20:00|@|HP25-MIDMIX|00:30|PROMO|Playlist كريم حسن',
    song(6, '00:20:30'),
    song(7, '00:24:45'),
    song(8, '00:28:37'),
    song(9, '00:32:58'),
    song(10, '00:36:43'), // still playing at 00:40 → # lets it finish
    song(11, '00:40:45'), // queued behind the # → skipped (yellow)
    '00:40:00|#|HP25-ADARK|00:30|PROMO|كريم حسن',
    song(12, '00:41:15'),
    song(13, '00:45:25'),
    song(14, '00:49:20'),
    song(15, '00:53:45'),
    song(16, '00:57:44'), // playing at 01:00:00 → cut by the hour marker (red)
    '01:00:00|@|',
    '01:00:02|+|JIN-NIGHT|00:12|AUDIO|Evening jingle',
    song(17, '01:00:14'),
    song(18, '01:03:55'),
    song(19, '01:08:03')
  ]
  return lines.join('\r\n') + '\r\n'
}

/** Seed the isolated userData directory with the persisted demo stores. */
export async function seedUserData(userData: string, station: string): Promise<void> {
  const stationDir = join(userData, 'stations', station)
  await mkdir(stationDir, { recursive: true })
  await writeFile(join(stationDir, 'formats.json'), JSON.stringify(demoFormatSet(), null, 2))
  await writeFile(join(stationDir, 'promos.json'), JSON.stringify(demoPromosSeed(), null, 2))
  await writeFile(join(userData, 'ui-settings.json'), JSON.stringify(demoUiSettings(), null, 2))
}
