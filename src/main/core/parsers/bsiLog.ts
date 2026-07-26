import MDBReader from 'mdb-reader'
import { parseDurationValue } from '../simianDb'

/**
 * Parses a Simian program log saved in its native `.bsi` format — which is a
 * Microsoft Access (Jet) database with a single `List` table:
 *
 *   Cue ('+'|'@'|'#'), Time (HH:MM:SS), Name, Length (MM:SS), Category,
 *   Description, Flag1, Flag2, RefNum, AbsPosition (the row order)
 *
 * Rows come back as the app's standard pipe lines (Time|Cue|Name|Category|
 * Description) plus a per-row duration seeded from the Length column.
 *
 * The station's Simian stores text in the Arabic codepage (Windows-1256), which
 * the Jet reader mis-decodes as Windows-1252 mojibake — fixArabicText() maps the
 * characters back to bytes and re-decodes them properly.
 */

export interface BsiLog {
  /** Pipe-delimited log lines, in AbsPosition order. */
  lines: string[]
  /** Duration in seconds per line (0 when the Length cell is empty/invalid). */
  durations: number[]
}

/** Access/Jet databases open with `\0\x01\0\0Standard Jet DB` (or ACE). */
export function isBsiBuffer(buffer: Buffer): boolean {
  return buffer.length > 20 && buffer.subarray(4, 16).toString('latin1') === 'Standard Jet'
}

// The mojibake fix lives in core/encoding (shared with the audio-DB loader);
// re-exported here because this parser is where it historically lived.
import { fixArabicText } from '../encoding'
export { fixArabicText }

const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

export function parseBsiLog(buffer: Buffer): BsiLog {
  const reader = new MDBReader(buffer)
  const tableName = reader.getTableNames().find((n) => /^list$/i.test(n))
  if (!tableName) throw new Error('Not a Simian .bsi log (no List table found)')

  const rows = [...reader.getTable(tableName).getData()].sort(
    (a, b) => Number(a.AbsPosition ?? 0) - Number(b.AbsPosition ?? 0)
  )

  const lines: string[] = []
  const durations: number[] = []
  for (const row of rows) {
    const fields = [
      text(row.Time).trim(),
      text(row.Cue).trim(),
      fixArabicText(text(row.Name).trim()),
      fixArabicText(text(row.Category).trim()),
      fixArabicText(text(row.Description))
    ]
    lines.push(fields.join('|'))
    durations.push(parseDurationValue(text(row.Length).trim()) ?? 0)
  }
  return { lines, durations }
}
