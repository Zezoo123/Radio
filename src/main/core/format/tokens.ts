import type { CalendarDate } from '../types'
import { weekday } from '../dates'

/**
 * Natural Grid-style date-sensitive tokens (manual p.11). A bracketed token in a
 * clock's Name/Description is replaced at export time with the export date:
 *   1234-[DAY]   → 1234-MON
 *   NEWS[yymmdd] → NEWS260618
 * Tokens are case-insensitive; unknown brackets are left untouched. Text around
 * a token is preserved.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Natural Grid day number: Monday=1 … Sunday=7. */
function naturalDayNum(wd: number): number {
  return wd === 0 ? 7 : wd
}

function tokenValue(token: string, date: CalendarDate): string | null {
  const yyyy = String(date.year)
  const yy = yyyy.slice(-2)
  const mm = String(date.month).padStart(2, '0')
  const dd = String(date.day).padStart(2, '0')
  const wd = weekday(date)

  switch (token.toLowerCase()) {
    case 'yyyymmdd':
      return yyyy + mm + dd
    case 'yyyyddmm':
      return yyyy + dd + mm
    case 'yymmdd':
      return yy + mm + dd
    case 'yyddmm':
      return yy + dd + mm
    case 'mmddyyyy':
      return mm + dd + yyyy
    case 'mmddyy':
      return mm + dd + yy
    case 'mmdd':
      return mm + dd
    case 'ddmmyyyy':
      return dd + mm + yyyy
    case 'ddmm':
      return dd + mm
    case 'day':
      return DAY_NAMES[wd]
    case 'daynum':
      return String(naturalDayNum(wd))
    default:
      return null
  }
}

/** Replace bracketed date tokens in `text` using `date`. */
export function substituteDateTokens(text: string, date: CalendarDate): string {
  return text.replace(/\[([A-Za-z]+)\]/g, (match, inner: string) => {
    const value = tokenValue(inner, date)
    return value ?? match
  })
}

/** Presets for the token-insert UI (token text + a short label). */
export const TOKEN_PRESETS: { token: string; label: string }[] = [
  { token: '[yymmdd]', label: 'YYMMDD' },
  { token: '[yyyymmdd]', label: 'YYYYMMDD' },
  { token: '[mmddyy]', label: 'MMDDYY' },
  { token: '[ddmm]', label: 'DDMM' },
  { token: '[mmdd]', label: 'MMDD' },
  { token: '[Day]', label: 'Day (Monday)' },
  { token: '[DayNum]', label: 'Day #' }
]

/** Tokens for the "Next day" insert category (loading the next day's log). */
export const NEXTDAY_PRESETS: { token: string; label: string; hint: string }[] = [
  {
    token: '[NEXT]',
    label: '[NEXT]',
    hint: "Resolve the whole row's date tokens (Name + Description) for the NEXT day"
  }
]
