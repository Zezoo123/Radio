/**
 * Pre-air booking check: are all of the day's booked element spots actually
 * IN the finalized log, and is nothing element-shaped in the log that was
 * never booked? Runs after a human has edited the built log, so it compares
 * by name COUNT, not position — moving a spot is fine, deleting one is not.
 *
 * Only errors are reported (the client's spec): a booked name short in the
 * log is `not-inserted`, an element-named row over its booked count (or never
 * booked that day at all) is `extra`. Non-element rows (songs, clocks, azan,
 * comments) never match a template code and are ignored.
 */

export interface BookingIssue {
  name: string
  status: 'not-inserted' | 'extra'
  booked: number
  inLog: number
}

// Same normalization as the audio-DB lookups (simianDb.normalizeName), inlined
// here so this module stays renderer-safe — importing simianDb would drag the
// Node-only mdb-reader into the renderer bundle.
const AUDIO_EXT = /\.(wav|mp3|mp2|ogg|flac|m4a|aif+f?)$/i

/** Canonical form for matching: trimmed, uppercased, no extension, `-` = `_`. */
export const canonicalName = (name: string): string =>
  name.trim().replace(AUDIO_EXT, '').toUpperCase().replace(/-/g, '_')

/** True when `name` is one of `code`'s export names (`CODE`, `CODE-A`, …). */
function matchesCode(canonical: string, code: string): boolean {
  const c = canonicalName(code)
  return canonical === c || canonical.startsWith(c + '_')
}

export function checkBookingElements(
  plannedNames: string[],
  logNames: string[],
  codes: string[]
): BookingIssue[] {
  const booked = new Map<string, { name: string; count: number }>()
  for (const name of plannedNames) {
    const key = canonicalName(name)
    const cur = booked.get(key)
    if (cur) cur.count++
    else booked.set(key, { name, count: 1 })
  }

  // Log rows that are element-shaped: booked today, or named like any code.
  const inLog = new Map<string, { name: string; count: number }>()
  for (const raw of logNames) {
    const name = raw.trim()
    if (!name) continue
    const key = canonicalName(name)
    if (!booked.has(key) && !codes.some((code) => matchesCode(key, code))) continue
    const cur = inLog.get(key)
    if (cur) cur.count++
    else inLog.set(key, { name, count: 1 })
  }

  const issues: BookingIssue[] = []
  for (const [key, b] of booked) {
    const found = inLog.get(key)?.count ?? 0
    if (found < b.count)
      issues.push({ name: b.name, status: 'not-inserted', booked: b.count, inLog: found })
  }
  for (const [key, l] of inLog) {
    const bookedCount = booked.get(key)?.count ?? 0
    if (l.count > bookedCount)
      issues.push({ name: l.name, status: 'extra', booked: bookedCount, inLog: l.count })
  }
  return issues.sort((a, b) => a.name.localeCompare(b.name))
}
