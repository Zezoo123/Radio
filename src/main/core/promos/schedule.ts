import type { CalendarDate, ScheduleEvent } from '../types'
import { addDays, weekday } from '../dates'
import { mulberry32 } from '../sequential/rng'
import type { PromoEntry, PromoSet } from '../parsers/promosFile'

/**
 * Distributes program promos across the broadcast day under the station's rules:
 *
 *  - Blackout: no promo from the program's start hour through (end hour + 2) on
 *    days the program airs (rules 1–3), accounting for past-midnight wrap.
 *  - At most one promo per hour (rule 4).
 *  - A per-weekday count of promos per program (rule 5), capped at the number of
 *    available hours.
 *  - The hour immediately before the program is preferred (rule 6).
 *  - The chosen hour-set differs from the previous day, the next day, and the
 *    same weekday a week earlier (rule 7).
 *
 * Placement is deterministic per (promo, date): the same inputs always produce
 * the same times, so the on-screen preview matches the export with no persisted
 * state. The user can override the times for a specific program+date; overrides
 * win over the computed schedule.
 */

export const PROMO_CATEGORY = 'PROMO'

/** Editable per-program, per-date time overrides: fileName → 'YYYY-MM-DD' → times. */
export type PromoOverrides = Record<string, Record<string, string[]>>

/**
 * Per-program, per-weekday hours (0-23) the user excludes from the random range:
 * fileName → [Sun, Mon, …, Sat] → hours. A missing program or short array means
 * "nothing excluded".
 */
export type PromoExclusions = Record<string, number[][]>

/** Excluded hours for one program on one weekday (0 = Sun … 6 = Sat). */
export function exclusionsForWeekday(
  exclusions: PromoExclusions | undefined,
  fileName: string,
  wd: number
): number[] {
  return exclusions?.[fileName]?.[wd] ?? []
}

export interface PromoPlacement {
  fileName: string
  program: string
  presenter: string
  recorded: boolean
  /** How many promos this weekday calls for. */
  count: number
  /** Resolved broadcast times, `HH:MM:SS` (override or auto). */
  times: string[]
  /** True when these times come from a manual override. */
  overridden: boolean
  /** Hours blocked by the program's blackout window on this date. */
  blockedHours: number[]
  /** Hours the user has excluded from the random range for this program. */
  excludedHours: number[]
  /** Hours a promo may use on this date (after blackout + exclusions). */
  allowedHours: number[]
  /** The preferred hour (just before the program), or null. */
  preferredHour: number | null
  /** True when the requested count exceeds the available hours. */
  capped: boolean
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export function dateKey(date: CalendarDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
}

function dateSeed(date: CalendarDate): number {
  return date.year * 10000 + date.month * 100 + date.day
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Hours (0-23) blocked on `date` by the program's airtime + 2h tail. Considers
 * both the airing on `date` and an airing on the previous day whose window wraps
 * past midnight into `date`.
 */
export function blockedHoursForDate(entry: PromoEntry, date: CalendarDate): Set<number> {
  const blocked = new Set<number>()
  if (entry.airStartHour == null || entry.airEndHour == null) return blocked

  // Absolute hour window from the airday's midnight: start .. (end + 2), inclusive.
  // A wrapped airtime (end before start) pushes the end into the next day.
  const start = entry.airStartHour
  const end = entry.airWraps ? entry.airEndHour + 24 : entry.airEndHour
  const last = end + 2

  // An airing on day A blocks absolute hours [start, last]; map each to a
  // calendar day (A + floor(h/24)) and hour (h % 24). Day A is `date` itself or
  // the day before (the only earlier day whose window can still reach `date`).
  for (const offset of [0, -1]) {
    const airDate = addDays(date, offset)
    if (!entry.airDays[weekday(airDate)]) continue
    for (let h = start; h <= last; h++) {
      if (offset + Math.floor(h / 24) === 0) blocked.add(h % 24)
    }
  }
  return blocked
}

/**
 * Hours a promo may use on `date`, ascending: every hour minus the blackout
 * window and minus any hours the user has excluded from the random range.
 */
export function allowedHoursForDate(
  entry: PromoEntry,
  date: CalendarDate,
  excluded?: Iterable<number>
): number[] {
  const blocked = blockedHoursForDate(entry, date)
  const ex = new Set(excluded ?? [])
  const allowed: number[] = []
  for (let h = 0; h < 24; h++) if (!blocked.has(h) && !ex.has(h)) allowed.push(h)
  return allowed
}

/** The preferred hour (just before the program) when the program airs that day. */
export function preferredHour(entry: PromoEntry, date: CalendarDate): number | null {
  if (entry.airStartHour == null || !entry.airDays[weekday(date)]) return null
  const h = (entry.airStartHour + 23) % 24
  return h
}

/** Pick `count` distinct, evenly-spread hours from the allowed set for one salt. */
function chooseHours(
  entry: PromoEntry,
  date: CalendarDate,
  count: number,
  salt: number,
  excluded?: Iterable<number>
): number[] {
  const allowed = allowedHoursForDate(entry, date, excluded)
  const n = Math.min(count, allowed.length)
  if (n <= 0) return []

  const rng = mulberry32((hashStr(entry.fileName) ^ dateSeed(date) ^ Math.imul(salt, 0x9e3779b1)) >>> 0)
  const picked = new Set<number>()

  // Seed the preferred hour first so it tends to win a slot when available.
  const pref = preferredHour(entry, date)
  if (pref != null && allowed.includes(pref)) picked.add(pref)

  // Even spread: one hour per equal-width segment of the allowed list, jittered.
  for (let i = 0; i < n && picked.size < n; i++) {
    const lo = Math.floor((i * allowed.length) / n)
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * allowed.length) / n))
    const idx = Math.min(allowed.length - 1, lo + Math.floor(rng() * (hi - lo)))
    picked.add(allowed[idx])
  }
  // Collisions can leave us short — fill from the remaining hours.
  if (picked.size < n) {
    for (const h of allowed) {
      if (picked.size >= n) break
      picked.add(h)
    }
  }
  return [...picked].sort((a, b) => a - b).slice(0, n)
}

const setKey = (hours: number[]): string => hours.join(',')

/**
 * The auto-chosen hours for `date`, re-rolled until they differ from the base
 * picks of the previous day, next day, and the same weekday a week earlier
 * (rule 7). Falls back to the base pick if the pool is too small to differ.
 */
export function autoHoursForDate(
  entry: PromoEntry,
  date: CalendarDate,
  excluded?: Iterable<number>
): number[] {
  const count = entry.promoCounts[weekday(date)] ?? 0
  if (count <= 0) return []

  const baseAt = (d: CalendarDate): string =>
    setKey(chooseHours(entry, d, entry.promoCounts[weekday(d)] ?? 0, 0, excluded))
  const neighbours = [baseAt(addDays(date, -1)), baseAt(addDays(date, 1)), baseAt(addDays(date, -7))]

  let fallback: number[] = []
  for (let salt = 0; salt < 8; salt++) {
    const hours = chooseHours(entry, date, count, salt, excluded)
    if (salt === 0) fallback = hours
    if (!neighbours.includes(setKey(hours))) return hours
  }
  return fallback
}

/** Deterministic minute (1-58) within an hour, avoiding the top-of-hour markers. */
function minuteFor(entry: PromoEntry, date: CalendarDate, hour: number): number {
  const rng = mulberry32((hashStr(entry.fileName) ^ dateSeed(date) ^ Math.imul(hour + 1, 2654435761)) >>> 0)
  return 1 + Math.floor(rng() * 58)
}

function timesFromHours(entry: PromoEntry, date: CalendarDate, hours: number[]): string[] {
  return hours.map((h) => `${pad2(h)}:${pad2(minuteFor(entry, date, h))}:00`)
}

/** The auto-generated broadcast times for a promo on a date, `HH:MM:SS`. */
export function autoTimesForDate(
  entry: PromoEntry,
  date: CalendarDate,
  excluded?: Iterable<number>
): string[] {
  return timesFromHours(entry, date, autoHoursForDate(entry, date, excluded))
}

/** Final times for a promo on a date: a manual override if present, else auto. */
export function finalTimesForDate(
  entry: PromoEntry,
  date: CalendarDate,
  overrides?: PromoOverrides,
  excluded?: Iterable<number>
): string[] {
  const override = overrides?.[entry.fileName]?.[dateKey(date)]
  if (override) return [...override].sort((a, b) => a.localeCompare(b))
  return autoTimesForDate(entry, date, excluded)
}

/** Per-program placement details for the Promos planning view (includes all programs). */
export function placementsForDate(
  set: PromoSet,
  date: CalendarDate,
  overrides?: PromoOverrides,
  exclusions?: PromoExclusions
): PromoPlacement[] {
  const wd = weekday(date)
  return set.entries
    .filter((e) => (e.promoCounts[wd] ?? 0) > 0)
    .map((e) => {
      const count = e.promoCounts[wd] ?? 0
      const excluded = exclusionsForWeekday(exclusions, e.fileName, wd)
      const allowed = allowedHoursForDate(e, date, excluded)
      const override = overrides?.[e.fileName]?.[dateKey(date)]
      return {
        fileName: e.fileName,
        program: e.program,
        presenter: e.presenter,
        recorded: e.recorded,
        count,
        times: finalTimesForDate(e, date, overrides, excluded),
        overridden: Boolean(override),
        blockedHours: [...blockedHoursForDate(e, date)].sort((a, b) => a - b),
        excludedHours: [...excluded].sort((a, b) => a - b),
        allowedHours: allowed,
        preferredHour: preferredHour(e, date),
        capped: count > allowed.length
      }
    })
}

export interface PromoEventsResult {
  events: ScheduleEvent[]
  warnings: string[]
}

/**
 * Promo events for one date. Every program with a promo file and a count for
 * this weekday is included — the spreadsheet's "Recorded" flag refers to the
 * program, not the promo, so it does not gate the log.
 */
export function promoEventsForDate(
  set: PromoSet,
  date: CalendarDate,
  opts: { overrides?: PromoOverrides; exclusions?: PromoExclusions } = {}
): PromoEventsResult {
  const wd = weekday(date)
  const events: ScheduleEvent[] = []
  const warnings: string[] = []

  for (const entry of set.entries) {
    const count = entry.promoCounts[wd] ?? 0
    if (count <= 0) continue

    const excluded = exclusionsForWeekday(opts.exclusions, entry.fileName, wd)
    const allowed = allowedHoursForDate(entry, date, excluded)
    if (count > allowed.length) {
      warnings.push(
        `Promo ${entry.fileName} (${entry.program}) wants ${count} on ${dateKey(date)} but only ${allowed.length} hour(s) are free`
      )
    }

    for (const time of finalTimesForDate(entry, date, opts.overrides, excluded)) {
      events.push({
        time,
        cue: '+',
        name: entry.fileName,
        category: PROMO_CATEGORY,
        description: entry.presenter
      })
    }
  }

  events.sort((a, b) => a.time.localeCompare(b.time))
  return { events, warnings }
}

/** The Sunday that begins the week containing `date`. */
export function weekStartFor(date: CalendarDate): CalendarDate {
  return addDays(date, -weekday(date))
}

/** One weekday's placement for a program, within the week view. */
export interface PromoDayPlacement {
  /** `YYYY-MM-DD` of this weekday in the shown week. */
  date: string
  /** 0 = Sun … 6 = Sat. */
  weekday: number
  /** Whether the program itself airs this weekday (drives the blackout). */
  airs: boolean
  count: number
  times: string[]
  overridden: boolean
  blockedHours: number[]
  excludedHours: number[]
  allowedHours: number[]
  preferredHour: number | null
  capped: boolean
}

/** A program's promo schedule across a whole week (Sun..Sat). */
export interface PromoWeekRow {
  fileName: string
  program: string
  presenter: string
  recorded: boolean
  airStart: string
  airEnd: string
  days: PromoDayPlacement[]
}

/**
 * Per-program promo placement for the seven days starting at `weekStart`
 * (a Sunday). Used by the Promos planning view so the user can set per-weekday
 * hour exclusions; the export resolves each calendar date to its weekday's rules.
 */
export function placementsForWeek(
  set: PromoSet,
  weekStart: CalendarDate,
  overrides?: PromoOverrides,
  exclusions?: PromoExclusions
): PromoWeekRow[] {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  return set.entries
    .filter((e) => e.promoCounts.some((c) => c > 0))
    .map((e) => ({
      fileName: e.fileName,
      program: e.program,
      presenter: e.presenter,
      recorded: e.recorded,
      airStart: e.airStart,
      airEnd: e.airEnd,
      days: dates.map((date) => {
        const wd = weekday(date)
        const count = e.promoCounts[wd] ?? 0
        const excluded = exclusionsForWeekday(exclusions, e.fileName, wd)
        const allowed = allowedHoursForDate(e, date, excluded)
        const override = overrides?.[e.fileName]?.[dateKey(date)]
        return {
          date: dateKey(date),
          weekday: wd,
          airs: e.airDays[wd],
          count,
          times: count > 0 ? finalTimesForDate(e, date, overrides, excluded) : [],
          overridden: Boolean(override),
          blockedHours: [...blockedHoursForDate(e, date)].sort((a, b) => a - b),
          excludedHours: [...excluded].sort((a, b) => a - b),
          allowedHours: allowed,
          preferredHour: preferredHour(e, date),
          capped: count > allowed.length
        }
      })
    }))
}
