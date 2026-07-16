import type { Cue } from '../types'

/**
 * An "hour format" (Natural Grid calls it a clock): the reusable skeleton of a
 * single broadcast hour, as an ordered list of timed rows. Each row is placed at
 * a minute:second offset within whatever hour the format is assigned to.
 */
export interface FormatRow {
  /**
   * Optional absolute hour (0-23). When set, the row fires only at that hour
   * (once per day). When unset, it fires at every hour the clock is used —
   * e.g. a top-of-hour ID in a default clock.
   */
  hour?: number
  /** Minute within the hour, 0-59. */
  minute: number
  /** Second within the minute, 0-59. */
  second: number
  cue: Cue
  /** Audio file name / cart, or empty for a marker. */
  name: string
  category?: string
  description?: string
  /** When true, this row's date tokens resolve to the next day (the LOG row). */
  nextDay?: boolean
  /** UI marker: this row was set up by the "NEXT DAY LOG" category and is locked. */
  logRow?: boolean
}

export interface HourFormat {
  id: string
  name: string
  /** Display color for the week grid. */
  color: string
  rows: FormatRow[]
}

/**
 * Which format fills each hour of the week. `cells[weekday][hour]` is a format
 * id or null (weekday 0=Sun…6=Sat, hour 0-23).
 */
export interface WeekGrid {
  cells: (string | null)[][]
}

export interface FormatSet {
  formats: HourFormat[]
  grid: WeekGrid
  /** Categories offered in the row Category dropdown. User-extendable. */
  categories?: string[]
  /**
   * Default clocks: each is a single clock that applies to EVERY hour of a day
   * (a base clock). Edited separately and never painted on the grid; instead a
   * day picks which one to use via `dayDefaults`.
   */
  defaultClocks?: HourFormat[]
  /**
   * Per-weekday default clock id (length 7, weekday 0=Sun…6=Sat, or null = no
   * default that day). References an id in `defaultClocks`.
   */
  dayDefaults?: (string | null)[]
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Built-in category options for a format row (the dropdown's defaults). */
export const DEFAULT_CATEGORIES = [
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
]

export const FORMAT_COLORS = [
  '#4f8cff',
  '#49c281',
  '#e0a23c',
  '#c264e0',
  '#e0645f',
  '#3fc4c4',
  '#c4b13f',
  '#7d8aa0'
]

/** An empty 7×24 grid. */
export function emptyGrid(): WeekGrid {
  return { cells: Array.from({ length: 7 }, () => new Array<string | null>(24).fill(null)) }
}

export function emptyDayDefaults(): (string | null)[] {
  return new Array<string | null>(7).fill(null)
}

export function emptyFormatSet(): FormatSet {
  return {
    formats: [],
    grid: emptyGrid(),
    categories: [...DEFAULT_CATEGORIES],
    defaultClocks: [],
    dayDefaults: emptyDayDefaults()
  }
}
