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

/** Windows-1252's 0x80–0x9F block, mapped back from Unicode to the raw byte. */
const CP1252_INVERSE = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f]
])

/** Re-decode Windows-1252-mojibake text as Windows-1256 (Arabic). ASCII is untouched. */
export function fixArabicText(text: string): string {
  if (!/[\u0080-\uffff]/.test(text)) return text // pure ASCII — nothing to fix
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[i] = code < 256 ? code : (CP1252_INVERSE.get(code) ?? 0x3f) /* '?' */
  }
  try {
    return new TextDecoder('windows-1256').decode(bytes)
  } catch {
    return text // ICU without cp1256 — keep the original rather than corrupt it
  }
}

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
