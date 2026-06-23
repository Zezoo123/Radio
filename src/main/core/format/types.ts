import type { Cue } from '../types'

/**
 * An "hour format" (Natural Grid calls it a clock): the reusable skeleton of a
 * single broadcast hour, as an ordered list of timed rows. Each row is placed at
 * a minute:second offset within whatever hour the format is assigned to.
 */
export interface FormatRow {
  /** Minute within the hour, 0-59. */
  minute: number
  /** Second within the minute, 0-59. */
  second: number
  cue: Cue
  /** Audio file name / cart, or empty for a marker. */
  name: string
  category?: string
  description?: string
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
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

export function emptyFormatSet(): FormatSet {
  return { formats: [], grid: emptyGrid() }
}
