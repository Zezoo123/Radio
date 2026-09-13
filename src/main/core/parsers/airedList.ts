/**
 * Parses a Simian aired-list file (`<YYMMDD>.lst`) — the pipe-delimited text
 * Simian writes while the log airs, one line per event as it happens:
 *
 *   X|air time|?|row #|?|scheduled time|Name|Category|Description|deck|file path
 *
 * `X` in the first field means the row actually played. Short `E|HH:MM:SS|`
 * lines are log-load markers and carry no event — they are skipped.
 *
 * The list has no duration column, so each row's ACTUAL played length is
 * derived from the gap to the next line's air time (crossfades overlap the
 * next start slightly, which the checker's tolerance absorbs). The last row
 * has no successor, so its actual length is unknown (null).
 */

export interface AiredRow {
  /** First field was `X` — the row actually went to air. */
  played: boolean
  /** Actual air time as seconds-of-day. */
  air: number
  /** The log's scheduled `HH:MM:SS` for the row (as written by Simian). */
  scheduled: string
  name: string
  category: string
  /**
   * Deck automation event (row number `-1`, e.g. the STARTNEXT macro Simian
   * logs as each row starts) — not a log row, ignored for length measurement.
   */
  deckEvent: boolean
  /** Seconds until the next line went to air (null for the last row). */
  actual: number | null
}

/** `HH:MM:SS` → seconds-of-day, or null when malformed. */
export function timeToSeconds(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  return +m[1] * 3600 + +m[2] * 60 + +m[3]
}

export function parseAiredList(text: string): AiredRow[] {
  const rows: AiredRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = line.split('|')
    if (f.length < 8) continue // E|…| load markers, blank lines
    const air = timeToSeconds(f[1])
    if (air == null) continue
    rows.push({
      played: f[0].trim() === 'X',
      air,
      scheduled: f[5]?.trim() ?? '',
      name: f[6]?.trim() ?? '',
      category: (f[7] ?? '').trim().toUpperCase(),
      deckEvent: f[3]?.trim() === '-1',
      actual: null
    })
  }
  // Actual length = gap to the next real log line with a LATER air time (+24h
  // when it wraps midnight). Deck events (STARTNEXT, row `-1`) are skipped —
  // Simian logs one as each row starts, sometimes a second late, which would
  // make every row look like it played for 00:00 or 00:01.
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].deckEvent) continue
      const gap = (rows[j].air - rows[i].air + 86400) % 86400
      if (gap > 0) {
        rows[i].actual = gap
        break
      }
    }
  }
  return rows
}
