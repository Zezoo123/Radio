import { CalculationMethod, Coordinates, PrayerTimes, Rounding } from 'adhan'
import type { CalendarDate } from '../types'
import { CAIRO_EGYPTIAN, PRAYER_ORDER, type AzanOptions, type AzanTimes, type PrayerName } from './azan'

/**
 * Calibrated azan computation — the OFFLINE FALLBACK for dates the fetched
 * official (esa.gov.eg) tables don't cover.
 *
 * A year-long diff against the official Cairo tables showed the astronomy
 * agrees but the publishing convention differs: each prayer sits a fixed few
 * seconds off adhan's raw (unrounded) times, most visibly dhuhr at about
 * −65s. So the fallback computes RAW times (no library rounding, no method
 * adjustments), adds a per-prayer bias fitted from whatever official data has
 * been fetched, and rounds to the nearest minute. Against the 2026 tables the
 * fitted fallback is exact ~92% of days and never off by more than one minute
 * (asr carries most of the residue — ESA's asr algorithm differs seasonally by
 * up to ~±26s, which no constant offset can absorb).
 */

/** Per-prayer bias in seconds, added to adhan's raw time before rounding. */
export type AzanBiases = Record<PrayerName, number>

/** Fitted vs the official 2026 Cairo tables — used until a fetch fits fresher ones. */
export const DEFAULT_BIASES: AzanBiases = { fajr: -13, dhuhr: -69, asr: -17, maghrib: -7, isha: -10 }

/** Seconds-of-day in the configured timezone for a Date instant. */
function secondsOfDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(instant)
  const get = (type: string): number => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  return get('hour') * 3600 + get('minute') * 60 + get('second')
}

/** adhan's RAW times (unrounded, no method adjustments) as seconds-of-day. */
export function rawAzanSeconds(
  date: CalendarDate,
  options: AzanOptions = CAIRO_EGYPTIAN
): Record<PrayerName, number> {
  const params = (
    CalculationMethod[options.method] as () => ConstructorParameters<typeof PrayerTimes>[2]
  )()
  params.rounding = Rounding.None
  params.adjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
  const times = new PrayerTimes(
    new Coordinates(options.latitude, options.longitude),
    new Date(date.year, date.month - 1, date.day),
    params
  )
  const out = {} as Record<PrayerName, number>
  for (const prayer of PRAYER_ORDER) out[prayer] = secondsOfDay(times[prayer], options.timeZone)
  return out
}

const toHMS = (totalMinutes: number): string => {
  const t = ((totalMinutes % 1440) + 1440) % 1440
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 60))}:${p(t % 60)}:00`
}

/** The fallback: raw + bias, rounded to the nearest minute, as `HH:MM:00`. */
export function calibratedAzanTimes(
  date: CalendarDate,
  biases: AzanBiases = DEFAULT_BIASES,
  options: AzanOptions = CAIRO_EGYPTIAN
): AzanTimes {
  const raw = rawAzanSeconds(date, options)
  const out = {} as AzanTimes
  for (const prayer of PRAYER_ORDER) {
    out[prayer] = toHMS(Math.round((raw[prayer] + (biases[prayer] ?? 0)) / 60))
  }
  return out
}

/**
 * Fit per-prayer biases from fetched official days, so every fetch
 * re-calibrates the fallback. For each prayer, picks the bias in ±120s that
 * mismatches the official rounded minute on the fewest days (median-of-residual
 * fitting loses to this on asr, where the official algorithm drifts
 * seasonally). Falls back to the measured defaults when there is nothing to fit.
 */
export function fitBiases(
  officialByDate: Record<string, AzanTimes>,
  options: AzanOptions = CAIRO_EGYPTIAN
): AzanBiases {
  const residuals: Record<PrayerName, number[]> = {
    fajr: [],
    dhuhr: [],
    asr: [],
    maghrib: [],
    isha: []
  }
  for (const [iso, times] of Object.entries(officialByDate)) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) continue
    const raw = rawAzanSeconds({ year: +m[1], month: +m[2], day: +m[3] }, options)
    for (const prayer of PRAYER_ORDER) {
      const t = times[prayer]?.match(/^(\d{2}):(\d{2})/)
      if (!t) continue
      residuals[prayer].push(+t[1] * 3600 + +t[2] * 60 - raw[prayer])
    }
  }
  const out = { ...DEFAULT_BIASES }
  for (const prayer of PRAYER_ORDER) {
    const r = residuals[prayer]
    if (r.length === 0) continue
    // official minute = raw + residual (already a whole minute); we match it
    // when round((raw + bias)/60) == (raw + residual)/60 — i.e. bias − residual
    // in [−30, 30), Math.round taking halves upward.
    let best = out[prayer]
    let bestMisses = Infinity
    for (let bias = -120; bias <= 120; bias++) {
      let misses = 0
      for (const res of r) {
        const d = bias - res
        if (d >= 30 || d < -30) misses++
      }
      if (misses < bestMisses) {
        bestMisses = misses
        best = bias
      }
    }
    out[prayer] = best
  }
  return out
}
