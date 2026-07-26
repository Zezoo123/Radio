/**
 * Tomorrow (system date + 1) as `YYYY-MM-DD` — the default date everywhere a
 * view exports or previews: schedules are prepared for the next broadcast day.
 */
export function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Clamp an ISO date into an inclusive [first, last] range (nulls = unbounded). */
export function clampISO(date: string, first: string | null, last: string | null): string {
  if (first && date < first) return first
  if (last && date > last) return last
  return date
}
