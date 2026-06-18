import type { CalendarDate } from '../types'
import { athanTimes, CAIRO_EGYPTIAN, PRAYER_ORDER, type AthanOptions, type PrayerName } from './athan'

/**
 * Builds the verbatim athan rows in the station's format — two rows per prayer:
 *   HH:MM:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN   (fade current audio)
 *   HH:MM:02|+|AZ22-0XRB|FEA|AZAN <prayer>                         (the athan audio)
 *
 * Used for the "calculate" athan mode. The "import" mode reuses these exact rows
 * straight from the AZAN file instead.
 */

const MACRO = 'DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN'
const CATEGORY = 'FEA'

const FILE_NAME: Record<PrayerName, string> = {
  fajr: 'AZ22-01RB',
  dhuhr: 'AZ22-02RB',
  asr: 'AZ22-03RB',
  maghrib: 'AZ22-04RB',
  isha: 'AZ22-05RB'
}

const ARABIC_LABEL: Record<PrayerName, string> = {
  fajr: 'فجر',
  dhuhr: 'ظهر',
  asr: 'عصر',
  maghrib: 'مغرب',
  isha: 'عشاء'
}

/** Build the 10 athan rows from per-prayer times (`HH:MM` or `HH:MM:SS`). */
export function buildAthanRows(times: Record<PrayerName, string>): string[] {
  const lines: string[] = []
  for (const prayer of PRAYER_ORDER) {
    const hhmm = times[prayer].slice(0, 5)
    lines.push(`${hhmm}:00|@||MACRO|${MACRO}`)
    lines.push(`${hhmm}:02|+|${FILE_NAME[prayer]}|${CATEGORY}|AZAN ${ARABIC_LABEL[prayer]}`)
  }
  return lines
}

/** Computed athan rows for a date (approximate — official AZAN files are exact). */
export function computeAthanLines(date: CalendarDate, options: AthanOptions = CAIRO_EGYPTIAN): string[] {
  return buildAthanRows(athanTimes(date, options))
}
