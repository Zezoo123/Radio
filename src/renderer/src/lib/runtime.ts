import type { LogRow } from './logRows'

/**
 * Computes each row's expected (real) air time from the log order, the cue
 * rules and the file durations:
 *
 *   `@`  time-immediate — fires exactly at its stated time, regardless of what
 *        is playing; the clock jumps there.
 *   `+`  sequential — starts when whatever is playing finishes.
 *   `#`  time-next — waits for the current item to finish, but never starts
 *        before its stated time.
 *
 * Comments, section headers and other zero-duration rows show the running
 * clock but do not advance it.
 */

export function parseTimeToSeconds(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

export function formatSeconds(total: number): string {
  const t = Math.floor(((total % 86400) + 86400) % 86400)
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t / 60) % 60))}:${p2(t % 60)}`
}

/** Duration in seconds → `MM:SS` (minutes grow past 59 for long items). */
export function formatDuration(seconds: number): string {
  const t = Math.max(0, Math.round(seconds))
  const m = Math.floor(t / 60)
  return `${String(m).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Parse a duration the user typed: `MM:SS`, `H:MM:SS`, or plain seconds. */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  const m = t.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/)
  if (!m) return null
  const hours = m[1] ? parseInt(m[1], 10) : 0
  return hours * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
}

export type RowStatus = 'ok' | 'interrupted' | 'skipped' | 'note'

export interface SimRow {
  /** Seconds the row starts at (the running clock for comments; null when skipped). */
  expected: number | null
  status: RowStatus
  /** For interrupted rows: the second the `@` cut it off. */
  cutAt: number | null
}

/**
 * Simulates Simian's playout of the log, the way the deck actually behaves:
 *
 *  - `+` starts when the previous item finishes.
 *  - `@` (timed-immediate): the moment its time arrives it CUTS whatever is
 *    playing (that row is `interrupted`) and playback jumps to the `@` —
 *    queued rows in between never play (`skipped`).
 *  - `#` (timed-next): when its time arrives the current item FINISHES, then
 *    playback jumps straight to the `#`, skipping the rows in between.
 *  - A timed row REACHED before its scheduled time plays immediately, exactly
 *    like a `+` — the station never sits silent waiting for the clock. The
 *    scheduled time only ever pulls the playhead FORWARD.
 *
 * Only the next timed row below the playhead is armed, matching the log order.
 * Comments never play; they show the running clock (`note`).
 */
export function simulateLog(rows: LogRow[], durationOf: (row: LogRow) => number): SimRow[] {
  const out: SimRow[] = rows.map(() => ({ expected: null, status: 'skipped', cutAt: null }))

  // In real Simian logs the @/# rows are usually bare TIME MARKERS — a
  // scheduled time in the first column and no audio name at all. They still
  // fire (that scheduled time is what redirects the playhead); their duration
  // is just 0 unless they carry audio.
  const isTimedMarker = (r: LogRow): boolean =>
    (r.fields[1] === '@' || r.fields[1] === '#') && parseTimeToSeconds(r.fields[0]) != null
  const isPlayable = (r: LogRow): boolean =>
    isTimedMarker(r) ||
    ((r.fields[1] === '+' || r.fields[1] === '@' || r.fields[1] === '#') &&
      r.fields[2].trim() !== '')
  /** The armed timed event: first @/# row with a valid scheduled time after `from`. */
  const nextTimed = (from: number): { index: number; time: number; cue: string } | null => {
    for (let j = from + 1; j < rows.length; j++) {
      if (isTimedMarker(rows[j])) {
        return { index: j, time: parseTimeToSeconds(rows[j].fields[0])!, cue: rows[j].fields[1] }
      }
    }
    return null
  }

  let clock = 0
  let pos = 0
  while (pos < rows.length) {
    const row = rows[pos]

    if (!isPlayable(row)) {
      out[pos] = { expected: clock, status: 'note', cutAt: null }
      pos++
      continue
    }

    // Every row begins the moment the previous one finishes — even a timed row
    // reached ahead of its schedule (no dead air on a radio station). Scheduled
    // times act only through the armed lookahead below, pulling the playhead
    // forward when they fire.
    const start = clock

    const timed = nextTimed(pos)

    // A timed event further down already fired — everything from here to it
    // (this row included) never plays.
    if (timed && timed.time <= start) {
      for (let j = pos; j < timed.index; j++) {
        out[j] = isPlayable(rows[j])
          ? { expected: null, status: 'skipped', cutAt: null }
          : { expected: clock, status: 'note', cutAt: null }
      }
      pos = timed.index
      continue
    }

    const duration = Math.max(0, durationOf(row))

    if (timed && timed.cue === '@' && timed.time < start + duration) {
      // The @ fires mid-play: this row is cut short, the queue up to the @ is
      // dropped, and the clock lands exactly on the @ time.
      out[pos] = { expected: start, status: 'interrupted', cutAt: timed.time }
      for (let j = pos + 1; j < timed.index; j++) {
        out[j] = isPlayable(rows[j])
          ? { expected: null, status: 'skipped', cutAt: null }
          : { expected: timed.time, status: 'note', cutAt: null }
      }
      clock = timed.time
      pos = timed.index
      continue
    }

    if (timed && timed.cue === '#' && timed.time < start + duration) {
      // The # fires mid-play: this row FINISHES, then playback jumps to the #.
      out[pos] = { expected: start, status: 'ok', cutAt: null }
      for (let j = pos + 1; j < timed.index; j++) {
        out[j] = isPlayable(rows[j])
          ? { expected: null, status: 'skipped', cutAt: null }
          : { expected: start + duration, status: 'note', cutAt: null }
      }
      clock = start + duration
      pos = timed.index
      continue
    }

    out[pos] = { expected: start, status: 'ok', cutAt: null }
    clock = start + duration
    pos++
  }

  return out
}
