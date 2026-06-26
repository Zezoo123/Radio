/** Simian program-log cue codes (the only three this station uses). */
export type Cue = '+' | '@' | '#'

/** A single scheduled audio event → one `HH:MM:SS|cue|NAME` row. */
export interface ScheduleEvent {
  /** Broadcast time, `HH:MM:SS` (seconds carry the per-group collision offset). */
  time: string
  cue: Cue
  /** Audio file name Simian resolves against its database, e.g. `ADS_1710_A`. */
  name: string
  /** Optional Simian Category column (e.g. `FEA`, `AUDIO`). */
  category?: string
  /** Optional Simian Description column. */
  description?: string
  /** When true, this row's date tokens resolve to the next calendar day. */
  nextDay?: boolean
}

/**
 * A group of events under one section header, e.g. all of one sponsor's spots
 * for a day. The header prints even when `events` is empty.
 */
export interface Section {
  /** Element/group code, e.g. `ADS_1710`. */
  code: string
  /** Human label, e.g. `Baheya`. */
  group: string
  events: ScheduleEvent[]
}

/** One day's worth of output: a date header followed by ordered sections. */
export interface ScheduleDay {
  year: number
  /** 1-12. */
  month: number
  /** 1-31. */
  day: number
  /** Resolved week-grid clock rows (from the Formats set), emitted first. */
  formatLines?: string[]
  /** Top-of-hour comment marker rows. */
  hourlyLines?: string[]
  /** Verbatim athan rows (from the AZAN file) emitted right after the header. */
  athanLines?: string[]
  sections: Section[]
}

/** A plain calendar date (no timezone games). */
export interface CalendarDate {
  year: number
  month: number
  day: number
}
