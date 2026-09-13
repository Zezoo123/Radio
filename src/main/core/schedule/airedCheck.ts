import { timeToSeconds, type AiredRow } from '../parsers/airedList'
import { canonicalName } from './bookingCheck'

/**
 * After-air reconciliation: each booked element spot for a date is looked for
 * in that date's aired list (`<YYMMDD>.lst`).
 *
 *   played   — an `X` line exists and it ran its full length
 *   partial  — an `X` line exists but the gap to the next line is shorter
 *              than the library duration (something cut it)
 *   missed   — booked, but no line for it (or the line never got its `X`)
 *   extra    — an element-named `X` line that was never booked that day
 *
 * Per the client's spec only errors are itemized; `played` is a count. The
 * actual length comes from air-time gaps, so a crossfade overlaps the next
 * start by a moment — TOLERANCE_S absorbs that before calling a spot cut.
 */

export const TOLERANCE_S = 5

export type AiredStatus = 'partial' | 'missed' | 'extra'

export interface AiredIssue {
  name: string
  status: AiredStatus
  /** Booked `HH:MM:SS` (missed/partial) or actual air time (extra). */
  time: string
  /** Human detail, e.g. `played 00:18 of 00:30`. */
  detail: string
}

/** One booked spot's outcome — the full picture (the visual screen shows
    every spot; the text report itemizes only the issues). */
export interface AiredSpot {
  name: string
  /** Booked `HH:MM:SS`. */
  time: string
  status: 'played' | 'partial' | 'missed'
  /** Present for issues, e.g. `played 00:18 of 00:30`. */
  detail?: string
}

export interface AiredDayResult {
  /** `YYYY-MM-DD`. */
  date: string
  /** Booked spots that day. */
  planned: number
  /** Of those, how many fully played. */
  played: number
  /** Every booked spot in time order, with its outcome. */
  spots: AiredSpot[]
  issues: AiredIssue[]
  /** Set when the day could not be checked at all (no/unreadable list file). */
  error?: string
}

const mmss = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s) % 60).padStart(2, '0')}`

export function checkAiredDay(
  date: string,
  planned: { name: string; time: string }[],
  aired: AiredRow[],
  codes: string[],
  expectedDuration: (name: string) => number | null,
  toleranceS: number = TOLERANCE_S
): AiredDayResult {
  // Aired rows by canonical name, in air order, consumed as spots claim them.
  const pool = new Map<string, { row: AiredRow; used: boolean }[]>()
  for (const row of aired) {
    if (!row.name) continue
    const key = canonicalName(row.name)
    const list = pool.get(key)
    const entry = { row, used: false }
    if (list) list.push(entry)
    else pool.set(key, [entry])
  }

  const result: AiredDayResult = {
    date,
    planned: planned.length,
    played: 0,
    spots: [],
    issues: []
  }

  // Assign aired rows to booked spots per name by NEAREST air-vs-booked time,
  // so when a name is booked twice and airs once, the slot it actually served
  // is the one credited and the other one reports missed (first-come order
  // would credit the morning slot with an evening airing).
  const spotEntry = new Map<{ name: string; time: string }, { row: AiredRow; used: boolean }>()
  const byName = new Map<string, { name: string; time: string }[]>()
  for (const spot of planned) {
    const key = canonicalName(spot.name)
    const list = byName.get(key)
    if (list) list.push(spot)
    else byName.set(key, [spot])
  }
  const clockDist = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 86400
    return Math.min(d, 86400 - d)
  }
  for (const [key, spots] of byName) {
    const entries = pool.get(key) ?? []
    const pairs: { spot: (typeof spots)[number]; entry: (typeof entries)[number]; d: number }[] = []
    for (const spot of spots) {
      const t = timeToSeconds(spot.time)
      if (t == null) continue
      for (const entry of entries) pairs.push({ spot, entry, d: clockDist(t, entry.row.air) })
    }
    pairs.sort((a, b) => a.d - b.d)
    const spotDone = new Set<(typeof spots)[number]>()
    for (const p of pairs) {
      if (spotDone.has(p.spot) || p.entry.used) continue
      spotDone.add(p.spot)
      p.entry.used = true
      spotEntry.set(p.spot, p.entry)
    }
  }

  for (const spot of [...planned].sort((a, b) => a.time.localeCompare(b.time))) {
    const entry = spotEntry.get(spot)
    if (!entry) {
      result.spots.push({
        name: spot.name,
        time: spot.time,
        status: 'missed',
        detail: 'not in the aired list'
      })
      continue
    }
    if (!entry.row.played) {
      result.spots.push({
        name: spot.name,
        time: spot.time,
        status: 'missed',
        detail: 'listed but never played (no X)'
      })
      continue
    }
    const expected = expectedDuration(spot.name)
    const actual = entry.row.actual
    if (expected != null && actual != null && actual + toleranceS < expected) {
      result.spots.push({
        name: spot.name,
        time: spot.time,
        status: 'partial',
        detail: `played ${mmss(actual)} of ${mmss(expected)}`
      })
      continue
    }
    result.spots.push({ name: spot.name, time: spot.time, status: 'played' })
    result.played++
  }
  // Issues = the non-played spots (the text report itemizes errors only).
  for (const s of result.spots) {
    if (s.status !== 'played') {
      result.issues.push({ name: s.name, status: s.status, time: s.time, detail: s.detail ?? '' })
    }
  }

  // Element-named aired rows nothing claimed: extras (aired but not booked).
  const isElementName = (key: string): boolean =>
    codes.some((code) => {
      const c = canonicalName(code)
      return key === c || key.startsWith(c + '_')
    })
  const secondsToTime = (s: number): string =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  for (const [key, entries] of pool) {
    if (!isElementName(key)) continue
    for (const e of entries) {
      if (e.used || !e.row.played) continue
      result.issues.push({
        name: e.row.name,
        status: 'extra',
        time: secondsToTime(e.row.air),
        detail: 'aired but not booked this day'
      })
    }
  }

  result.issues.sort((a, b) => a.time.localeCompare(b.time))
  return result
}
