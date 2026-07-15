import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan'
import type { CalendarDate } from '../types'

/**
 * Computes the 5 daily prayer (azan) times. Defaults to Cairo with the
 * Egyptian General Authority of Survey method, formatted in the Africa/Cairo
 * timezone (so DST is handled automatically). adhan rounds to the nearest
 * minute, so times come out at :00 seconds.
 */

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'

export const PRAYER_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']

export interface AzanOptions {
  latitude: number
  longitude: number
  /** IANA timezone used to render the HH:MM:SS string. */
  timeZone: string
  /** Key of adhan's CalculationMethod (e.g. 'Egyptian'). */
  method: keyof typeof CalculationMethod
}

export const CAIRO_EGYPTIAN: AzanOptions = {
  latitude: 30.0444,
  longitude: 31.2357,
  timeZone: 'Africa/Cairo',
  method: 'Egyptian'
}

/** Azan times as `HH:MM:SS` strings in the configured timezone. */
export type AzanTimes = Record<PrayerName, string>

function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

export function azanTimes(date: CalendarDate, options: AzanOptions = CAIRO_EGYPTIAN): AzanTimes {
  const coords = new Coordinates(options.latitude, options.longitude)
  const params = (CalculationMethod[options.method] as () => ConstructorParameters<
    typeof PrayerTimes
  >[2])()
  const local = new Date(date.year, date.month - 1, date.day)
  const times = new PrayerTimes(coords, local, params)

  return {
    fajr: formatInZone(times.fajr, options.timeZone),
    dhuhr: formatInZone(times.dhuhr, options.timeZone),
    asr: formatInZone(times.asr, options.timeZone),
    maghrib: formatInZone(times.maghrib, options.timeZone),
    isha: formatInZone(times.isha, options.timeZone)
  }
}
