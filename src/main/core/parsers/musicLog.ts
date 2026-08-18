import { commentLine, eventLine } from '../export/simian'
import type { Cue } from '../types'

/**
 * Parses Simian "Music" log files — the fixed-width text a music scheduler
 * hands to Simian's Tools → Program Options → Log Import (Music format,
 * Position Dependent). Every field is located by a START (1-based column) and
 * LENGTH pair, exactly like the boxes in Simian's Log Import dialog, so the
 * app can mirror whatever settings the station's Simian uses.
 */

/** One field's position: 1-based start column + length. `start: 0` = unused. */
export interface FieldPos {
  start: number
  length: number
}

/** The six fields of Simian's position-dependent Log Import dialog. */
export interface MusicImportSettings {
  cue: FieldPos
  time: FieldPos
  name: FieldPos
  length: FieldPos
  category: FieldPos
  desc: FieldPos
}

/** The station's Simian Music import settings (from its Program Options). */
export const DEFAULT_MUSIC_IMPORT: MusicImportSettings = {
  cue: { start: 0, length: 0 },
  time: { start: 54, length: 8 },
  name: { start: 1, length: 8 },
  length: { start: 49, length: 5 },
  category: { start: 62, length: 7 },
  desc: { start: 9, length: 40 }
}

const FIELD_KEYS = ['cue', 'time', 'name', 'length', 'category', 'desc'] as const

function normalizePos(raw: unknown, fallback: FieldPos): FieldPos {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Partial<FieldPos>
  const int = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null
  return { start: int(o.start) ?? fallback.start, length: int(o.length) ?? fallback.length }
}

/** Coerce persisted/incoming data to well-formed settings. */
export function normalizeMusicImportSettings(raw: unknown): MusicImportSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<MusicImportSettings>
  const out = {} as MusicImportSettings
  for (const key of FIELD_KEYS) out[key] = normalizePos(o[key], DEFAULT_MUSIC_IMPORT[key])
  return out
}

/** One parsed music-log line: a timed audio event or a comment/marker row. */
export interface MusicRow {
  kind: 'event' | 'comment'
  /** `HH:MM:SS` for events; empty for comments. */
  time: string
  cue: Cue
  name: string
  category: string
  description: string
  /** The Length column (`MM:SS`) in seconds; null when blank/unparseable. */
  lengthSec: number | null
  /** Comment rows: the line's non-empty fields joined for display. */
  text: string
}

export interface ParsedMusicLog {
  rows: MusicRow[]
  eventCount: number
  commentCount: number
}

/** Extract one field from a fixed-width line (1-based start, like Simian). */
function field(line: string, pos: FieldPos): string {
  if (pos.start < 1 || pos.length < 1) return ''
  return line.slice(pos.start - 1, pos.start - 1 + pos.length).trim()
}

/** `H:MM:SS` / `HH:MM:SS` → zero-padded `HH:MM:SS`, or null when not a time. */
function parseTime(raw: string): string | null {
  const m = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}`
}

/** Length column `MM:SS` (minutes may exceed 59) → seconds, or null. */
function parseLength(raw: string): number | null {
  const m = raw.match(/^(\d{1,3}):(\d{2})$/)
  if (!m) return null
  return +m[1] * 60 + +m[2]
}

/**
 * Parse a decoded music log. Lines whose Time field isn't a valid `HH:MM:SS`
 * (the `:)` hour markers, headers, …) become comment rows; everything else is
 * an event. Simian's "Put AutoStep '+' marks on all events" is always on, so
 * events default to cue `+` unless a configured Cue field holds `@` or `#`.
 */
export function parseMusicLog(text: string, settings: MusicImportSettings): ParsedMusicLog {
  const rows: MusicRow[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const name = field(line, settings.name)
    const category = field(line, settings.category)
    const description = field(line, settings.desc)
    const lengthSec = parseLength(field(line, settings.length))
    const time = parseTime(field(line, settings.time))
    if (time === null) {
      const label = [name, description, category].filter(Boolean).join(' ')
      rows.push({
        kind: 'comment',
        time: '',
        cue: '+',
        name,
        category,
        description,
        lengthSec,
        text: label
      })
      continue
    }
    const rawCue = field(line, settings.cue)
    const cue: Cue = rawCue === '@' || rawCue === '#' ? rawCue : '+'
    rows.push({ kind: 'event', time, cue, name, category, description, lengthSec, text: '' })
  }
  const eventCount = rows.filter((r) => r.kind === 'event').length
  return { rows, eventCount, commentCount: rows.length - eventCount }
}

/**
 * The parsed log as Simian pipe lines, in file order (the scheduler already
 * ordered it; keeping the `:)` markers in place preserves the hour grouping).
 */
export function musicLogLines(parsed: ParsedMusicLog): string[] {
  return parsed.rows.map((r) =>
    r.kind === 'comment'
      ? commentLine(r.text)
      : eventLine({
          time: r.time,
          cue: r.cue,
          name: r.name,
          category: r.category,
          description: r.description
        })
  )
}
