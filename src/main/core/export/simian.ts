import type { ScheduleDay, ScheduleEvent, Section } from '../types'

/**
 * Serializes schedule data to the `|`-delimited text format that BSI Simian
 * imports via Tools → Program Options → Log Import.
 *
 * All constants below are pinned to the byte structure of the station's existing
 * export files (see test/fixtures/*.sample.txt). Lines are joined with CRLF and
 * the file ends with a trailing CRLF, matching Simian on Windows.
 */

const COMMENT_PREFIX = '|||COMMENT|'
const LINE_SEP = '\r\n'

/** Full-width dashed separator line (84 dashes after the comment prefix). */
const RULE_DASHES = 84
/** Date-header dashes on each side of the `=§§ … §§=` block. */
const DATE_SIDE_DASHES = 20
/** Section header: marker + this many dashes + this many spaces puts text at col 63. */
const SECTION_DASHES = 34
const SECTION_SPACES = 23
const SECTION_MARKER = '||||| '
/** Two spaces between code and group label (matches the Baheya samples). */
const SECTION_CODE_GAP = '  '

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** `|||COMMENT|----…` full-width rule. */
export function ruleLine(): string {
  return COMMENT_PREFIX + '-'.repeat(RULE_DASHES)
}

/** `|||COMMENT|--------------------=§§    18   -   06   -   2026   §§=--------------------` */
export function dateHeaderLine(year: number, month: number, day: number): string {
  const side = '-'.repeat(DATE_SIDE_DASHES)
  const mid =
    '=§§' +
    '    ' + // 4 spaces
    pad2(day) +
    '   -   ' + // 3 spaces, dash, 3 spaces
    pad2(month) +
    '   -   ' +
    String(year) +
    '   ' + // 3 spaces
    '§§='
  return COMMENT_PREFIX + side + mid + side
}

/** The 3-line date header block that opens each day. */
export function dateHeaderBlock(year: number, month: number, day: number): string[] {
  return [ruleLine(), dateHeaderLine(year, month, day), ruleLine()]
}

/** `||||| ----…<spaces>CODE  Group` */
export function sectionHeaderLine(code: string, group: string): string {
  return (
    SECTION_MARKER +
    '-'.repeat(SECTION_DASHES) +
    ' '.repeat(SECTION_SPACES) +
    code +
    SECTION_CODE_GAP +
    group
  )
}

/** `HH:MM:SS|cue|NAME`, plus `|Category|Description` when either is set. */
export function eventLine(event: ScheduleEvent): string {
  const base = `${event.time}|${event.cue}|${event.name}`
  if (event.category !== undefined || event.description !== undefined) {
    return `${base}|${event.category ?? ''}|${event.description ?? ''}`
  }
  return base
}

/** Lines for one section: header (always) followed by its events. */
export function sectionLines(section: Section): string[] {
  return [sectionHeaderLine(section.code, section.group), ...section.events.map(eventLine)]
}

/** Lines for one day: date header, hourly markers, athan rows, then sections. */
export function dayLines(day: ScheduleDay): string[] {
  const lines = dateHeaderBlock(day.year, day.month, day.day)
  if (day.hourlyLines?.length) lines.push(...day.hourlyLines)
  if (day.athanLines?.length) lines.push(...day.athanLines)
  for (const section of day.sections) lines.push(...sectionLines(section))
  return lines
}

/** Serialize one or more days to a CRLF-terminated Simian import file. */
export function serialize(days: ScheduleDay[]): string {
  const lines: string[] = []
  for (const day of days) lines.push(...dayLines(day))
  return lines.length ? lines.join(LINE_SEP) + LINE_SEP : ''
}
