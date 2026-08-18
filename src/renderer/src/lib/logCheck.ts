import { rowKind, type LogRow } from './logRows'
import { formatSeconds, parseTimeToSeconds } from './runtime'

/**
 * On-demand sanity checks over the whole log, run together with the Expected
 * simulation (the ↻ chip) — never per keystroke. Each finding is a display
 * line naming 1-based row numbers (the grid order):
 *
 *  - an event row with an empty Cue (Simian imports it as NULL and the
 *    chain stops there),
 *  - a MACRO row directly under a comment (the macro does not fire),
 *  - a log whose first line is a comment,
 *  - two or more timed rows (`@`/`#`) scheduled on the same second.
 *
 * Comments, hourly markers and section headers legitimately carry no cue, so
 * only event rows are held to the cue rule. The same-second check restarts at
 * every `=§§ dd - mm - yyyy §§=` date header, so a multi-day range doesn't
 * flag tomorrow's azan for landing on today's time.
 */
export function checkLog(rows: LogRow[]): string[] {
  const issues: string[] = []

  if (rows.length > 0 && rowKind(rows[0]) === 'comment') {
    issues.push('Row 1 — the log starts with a comment')
  }

  rows.forEach((row, i) => {
    if (rowKind(row) === 'event' && row.fields[1].trim() === '') {
      issues.push(`Row ${i + 1} — empty Cue`)
    }
    if (row.fields[3].trim() === 'MACRO' && i > 0 && rowKind(rows[i - 1]) === 'comment') {
      issues.push(`Row ${i + 1} — MACRO directly under a comment (row ${i})`)
    }
  })

  // Timed rows (@/#) that share the same scheduled second, per day block —
  // a `=§§ … §§=` date header comment starts a fresh day.
  const isDateHeader = (row: LogRow): boolean =>
    rowKind(row) === 'comment' && row.fields[4].includes('§§')
  let bySecond = new Map<number, number[]>()
  const flush = (): void => {
    for (const [t, nums] of [...bySecond].sort((a, b) => a[0] - b[0])) {
      if (nums.length > 1) {
        issues.push(`Rows ${nums.join(', ')} — ${nums.length} timed rows share ${formatSeconds(t)}`)
      }
    }
    bySecond = new Map()
  }
  rows.forEach((row, i) => {
    if (isDateHeader(row)) {
      flush()
      return
    }
    const cue = row.fields[1].trim()
    if (cue !== '@' && cue !== '#') return
    const t = parseTimeToSeconds(row.fields[0])
    if (t == null) return
    bySecond.set(t, [...(bySecond.get(t) ?? []), i + 1])
  })
  flush()

  return issues
}
