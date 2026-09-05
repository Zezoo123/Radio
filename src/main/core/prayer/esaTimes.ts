import { PRAYER_ORDER, type PrayerName } from './azan'
import type { AzanTimes } from './azan'

/**
 * Parses the monthly prayer-times table published by the Egyptian Survey
 * Authority (الهيئة المصرية العامة للمساحة) at esa.gov.eg — the station's
 * ground truth for azan times. The page is an ASP.NET form; the fetcher
 * (`src/main/esaFetch.ts`) does the postback dance and hands the HTML here.
 *
 * Table columns: city · Gregorian date · Hijri date · فجر · شروق · ظهر · عصر ·
 * مغرب · عشاء, with times like `5:2 ص` (05:02) and `12:55 م` (12:55).
 */

export interface EsaDay {
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM:SS` per prayer (seconds always `:00` — the table is minute-based). */
  times: AzanTimes
}

/** `5:2 ص` / `12:55 م` → `HH:MM:SS` (Arabic 12-hour marks: ص = AM, م = PM). */
export function arabicTimeTo24(text: string): string | null {
  const m = text.match(/(\d{1,2}):(\d{1,2})\s*(ص|م)/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 12 || min > 59) return null
  if (m[3] === 'م' && h !== 12) h += 12
  if (m[3] === 'ص' && h === 12) h = 0
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(h)}:${p(min)}:00`
}

// Column indexes in the ESA table (0-based, after stripping tags):
// 0 city · 1 Gregorian date · 2 Hijri · 3 fajr · 4 sunrise · 5 dhuhr ·
// 6 asr · 7 maghrib · 8 isha. Sunrise is not an azan; it is skipped.
const COLUMN: Record<PrayerName, number> = { fajr: 3, dhuhr: 5, asr: 6, maghrib: 7, isha: 8 }

/**
 * Extract every day of the month table. Returns [] when the HTML carries no
 * table (e.g. the postback failed) — the caller treats that as a failed month.
 * Rows with an unparseable date or time are skipped rather than fatal.
 */
export function parseEsaMonthHtml(html: string): EsaDay[] {
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0]
  if (!table) return []

  const days: EsaDay[] = []
  for (const rowMatch of table.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      c[1].replace(/<[^>]*>/g, '').trim()
    )
    const date = cells[1]?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
    if (!date) continue // header or malformed row

    const times = {} as AzanTimes
    let complete = true
    for (const prayer of PRAYER_ORDER) {
      const t = arabicTimeTo24(cells[COLUMN[prayer]] ?? '')
      if (!t) {
        complete = false
        break
      }
      times[prayer] = t
    }
    if (complete) days.push({ date, times })
  }
  return days
}
