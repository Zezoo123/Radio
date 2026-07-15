/**
 * Parse a Simian log text into editable rows and serialize them back.
 *
 * Each line is up to five `|`-fields: Time | Cue | Name | Category | Description.
 * Anything past the 4th pipe is folded into the Description field (section
 * headers contain extra pipes), and the original field count is remembered so an
 * untouched row serializes back byte-for-byte — including verbatim AZAN rows and
 * 3-field event rows with no category/description.
 */

const LINE_SEP = '\r\n'

export interface LogRow {
  /** Stable identity for React keys across drag re-orders. */
  id: number
  /** Time, Cue, Name, Category, Description (Description may contain pipes). */
  fields: [string, string, string, string, string]
  /** `|`-field count of the original line (capped at 5), for exact round-trips. */
  nFields: number
}

let nextId = 1

export function parseLogText(text: string): LogRow[] {
  return text
    .split(LINE_SEP)
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('|')
      return {
        id: nextId++,
        fields: [
          parts[0] ?? '',
          parts[1] ?? '',
          parts[2] ?? '',
          parts[3] ?? '',
          parts.length > 4 ? parts.slice(4).join('|') : ''
        ] as LogRow['fields'],
        nFields: Math.min(parts.length, 5)
      }
    })
}

/** A fresh editable row (used when inserting). */
export function blankRow(): LogRow {
  return { id: nextId++, fields: ['', '+', '', '', ''], nFields: 3 }
}

/** An identical copy of a row under a new identity (used when duplicating). */
export function cloneRow(row: LogRow): LogRow {
  return { id: nextId++, fields: [...row.fields] as LogRow['fields'], nFields: row.nFields }
}

export function rowToLine(row: LogRow): string {
  // Emit at least the original field count, extended if a later field now has
  // content. A category added to a bare 3-field event also brings the (empty)
  // description along, matching how eventLine() always emits the pair.
  let count = row.nFields
  for (let i = 4; i >= 0; i--) {
    if (row.fields[i] !== '') {
      count = Math.max(count, i + 1)
      break
    }
  }
  if (count === 4 && row.nFields < 4) count = 5
  return row.fields.slice(0, count).join('|')
}

export function serializeRows(rows: LogRow[]): string {
  return rows.length ? rows.map(rowToLine).join(LINE_SEP) + LINE_SEP : ''
}

/** Style class for a row: date rules/comments, section headers, or events. */
export function rowKind(row: LogRow): 'comment' | 'section' | 'event' {
  if (row.fields[3] === 'COMMENT') return 'comment'
  // Section headers serialize as `||||| ----…`: empty first four fields and a
  // description whose fold retains the leading extra pipe.
  if (!row.fields[0] && !row.fields[1] && !row.fields[2] && row.fields[4].startsWith('|')) {
    return 'section'
  }
  return 'event'
}
