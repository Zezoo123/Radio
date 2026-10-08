import type { CalendarDate, Cue } from '../types'
import { azanTimes, CAIRO_EGYPTIAN, PRAYER_ORDER, type AzanOptions, type PrayerName } from './azan'

/**
 * Builds the azan rows for each prayer from a configurable AZAN format: the azan
 * audio plays at the prayer time, and any number of extra lines (a deckfade
 * MACRO, station IDs, …) are emitted at a second offset around it. The default
 * format is a single deckfade line 10 seconds before the azan.
 */

const DEFAULT_MACRO = 'DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN'

/** The station's historical azan cart names — the filename defaults. */
export const DEFAULT_PRAYER_NAMES: Record<PrayerName, string> = {
  fajr: 'AZ22-01RB',
  dhuhr: 'AZ22-02RB',
  asr: 'AZ22-03RB',
  maghrib: 'AZ22-04RB',
  isha: 'AZ22-05RB'
}

export const ARABIC_LABEL: Record<PrayerName, string> = {
  fajr: 'فجر',
  dhuhr: 'ظهر',
  asr: 'عصر',
  maghrib: 'مغرب',
  isha: 'عشاء'
}

/** Default comment text per prayer (comment mode). */
export const DEFAULT_PRAYER_COMMENTS: Record<PrayerName, string> = {
  fajr: 'AZAN فجر',
  dhuhr: 'AZAN ظهر',
  asr: 'AZAN عصر',
  maghrib: 'AZAN مغرب',
  isha: 'AZAN عشاء'
}

/** One extra line emitted around each prayer's azan, at a second offset. */
export interface AzanLine {
  /** Seconds relative to the azan audio time (negative = before, positive = after). */
  offset: number
  cue: Cue
  /** Cart/file name — empty for a macro or comment. */
  name: string
  category: string
  description: string
}

/** The reusable prayer-rows format: what plays at each prayer time (an audio
    cart per prayer, or just a comment) + the surrounding lines. */
export interface AzanFormat {
  /** Category emitted on the azan audio row itself. */
  azanCategory: string
  /** `audio` emits the per-prayer cart; `comment` emits a comment row instead. */
  output: 'audio' | 'comment'
  /** Cart/file name per prayer (audio mode). */
  names: Record<PrayerName, string>
  /** Comment text per prayer (comment mode). */
  comments: Record<PrayerName, string>
  lines: AzanLine[]
}

export const DEFAULT_AZAN_FORMAT: AzanFormat = {
  azanCategory: 'FEA',
  output: 'audio',
  names: { ...DEFAULT_PRAYER_NAMES },
  comments: { ...DEFAULT_PRAYER_COMMENTS },
  lines: [{ offset: -10, cue: '@', name: '', category: 'MACRO', description: DEFAULT_MACRO }]
}

function toSeconds(hms: string): number {
  const [h, m, s] = hms.split(':').map((n) => parseInt(n, 10) || 0)
  return h * 3600 + m * 60 + s
}

function toHMS(total: number): string {
  const t = Math.max(0, Math.min(86399, total))
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`
}

/** A Simian row: `time|cue|name|category|description`. */
function row(
  time: string,
  cue: string,
  name: string,
  category: string,
  description: string
): string {
  return `${time}|${cue}|${name}|${category}|${description}`
}

/** Build the azan rows for the given per-prayer times using `format`, time-sorted. */
export function buildAzanRows(
  times: Record<PrayerName, string>,
  format: AzanFormat = DEFAULT_AZAN_FORMAT
): string[] {
  const rows: { t: number; line: string }[] = []
  for (const prayer of PRAYER_ORDER) {
    const base = toSeconds(times[prayer])
    rows.push({
      t: base,
      line:
        format.output === 'comment'
          ? row(toHMS(base), '', '', 'COMMENT', format.comments[prayer] ?? '')
          : row(
              toHMS(base),
              '+',
              format.names[prayer] ?? DEFAULT_PRAYER_NAMES[prayer],
              format.azanCategory,
              `AZAN ${ARABIC_LABEL[prayer]}`
            )
    })
    for (const ln of format.lines) {
      const t = base + ln.offset
      rows.push({ t, line: row(toHMS(t), ln.cue, ln.name, ln.category, ln.description) })
    }
  }
  return rows.sort((a, b) => a.t - b.t).map((r) => r.line)
}

/** Computed azan rows for a date (Cairo / Egyptian GAS), using `format`. */
export function computeAzanLines(
  date: CalendarDate,
  format: AzanFormat = DEFAULT_AZAN_FORMAT,
  options: AzanOptions = CAIRO_EGYPTIAN
): string[] {
  return buildAzanRows(azanTimes(date, options), format)
}
