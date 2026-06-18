/**
 * Top-of-hour comment markers. Each hour gets a comment row with the hour in
 * both the time column and the comment text, e.g. for 9am:
 *
 *   09:00:00|||COMMENT|9
 *
 * The marker text is configurable; the default is the bare hour number (per the
 * user's note). Placement of this block within the day is still being confirmed.
 */

export interface HourlyOptions {
  enabled: boolean
  /** First hour to mark (0-23). */
  startHour: number
  /** Last hour to mark (0-23, inclusive). */
  endHour: number
}

export const DEFAULT_HOURLY: HourlyOptions = { enabled: false, startHour: 0, endHour: 23 }

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Comment text shown for an hour marker (default: bare hour number). */
export function hourLabel(hour: number): string {
  return String(hour)
}

export function hourlyMarkerLine(hour: number): string {
  return `${pad2(hour)}:00:00|||COMMENT|${hourLabel(hour)}`
}

export function hourlyMarkerLines(opts: HourlyOptions): string[] {
  if (!opts.enabled) return []
  const lines: string[] = []
  for (let h = opts.startHour; h <= opts.endHour; h++) lines.push(hourlyMarkerLine(h))
  return lines
}
