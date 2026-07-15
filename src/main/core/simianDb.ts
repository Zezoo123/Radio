import MDBReader from 'mdb-reader'

/**
 * Reads a BSI Simian audio database (an Access .mdb file) and builds a
 * filename → duration-in-seconds map, used by the log Editor to fill each
 * row's Duration column.
 *
 * Simian installs differ (table and column names vary), so instead of
 * hard-coding a schema the loader scores every table for a filename-like and a
 * length-like column and picks the best match.
 */

export interface SimianDb {
  /** UPPERCASED file name (no extension) → duration in seconds. */
  tracks: Map<string, number>
  /** Table the durations came from (for the UI/debugging). */
  table: string
}

const AUDIO_EXT = /\.(wav|mp3|mp2|ogg|flac|m4a|aif+f?)$/i

/** Normalize a cart/file name for lookup: trim, uppercase, drop the extension. */
export function normalizeName(name: string): string {
  return name.trim().replace(AUDIO_EXT, '').toUpperCase()
}

/**
 * Parse a duration cell into seconds. Simian stores lengths in several shapes
 * across versions: a number of seconds, `MM:SS`, `H:MM:SS`, with optional
 * fractions (`00:29.7`), or a Date/Time whose time-of-day is the length.
 */
export function parseDurationValue(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (value instanceof Date) {
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds()
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text)
  const m = text.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (!m) return null
  const hours = m[1] ? parseInt(m[1], 10) : 0
  return hours * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
}

/**
 * Duration for a cart name, tolerating the dash/underscore mismatch between
 * scheduling sheets (`ADS_1710_A`) and the audio library (`ADS-1710-A.wav`).
 */
export function lookupDuration(tracks: Map<string, number>, name: string): number | null {
  const key = normalizeName(name)
  return (
    tracks.get(key) ??
    tracks.get(key.replace(/_/g, '-')) ??
    tracks.get(key.replace(/-/g, '_')) ??
    null
  )
}

const NAME_COLS = /^(file_?name|name|cart|cart_?name|audio_?file)$/i
const DUR_COLS = /^(length|duration|run_?time|len|total_?length|play_?length)$/i

/** Score a table's columns: which look like the file name and the duration? */
export function pickColumns(columns: string[]): { name: string; duration: string } | null {
  const name = columns.find((c) => NAME_COLS.test(c)) ?? columns.find((c) => /file/i.test(c))
  const duration =
    columns.find((c) => DUR_COLS.test(c)) ?? columns.find((c) => /length|duration/i.test(c))
  return name && duration ? { name, duration } : null
}

/** Load the audio database from an .mdb file's contents. */
export function loadSimianDb(buffer: Buffer): SimianDb {
  const reader = new MDBReader(buffer)

  // Prefer tables whose name mentions audio, then whichever matches at all.
  const tableNames = reader
    .getTableNames()
    .sort((a, b) => Number(/audio/i.test(b)) - Number(/audio/i.test(a)))

  for (const tableName of tableNames) {
    let table
    try {
      table = reader.getTable(tableName)
    } catch {
      continue // system/corrupt table — skip
    }
    const cols = pickColumns(table.getColumnNames())
    if (!cols) continue

    const tracks = new Map<string, number>()
    for (const row of table.getData()) {
      const rawName = row[cols.name]
      if (typeof rawName !== 'string' || !rawName.trim()) continue
      const duration = parseDurationValue(row[cols.duration])
      if (duration == null) continue
      tracks.set(normalizeName(rawName), duration)
    }
    if (tracks.size > 0) return { tracks, table: tableName }
  }

  throw new Error('No audio table with file names and durations found in this database')
}
