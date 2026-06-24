import type { CalendarDate } from '../types'
import { eventLine } from '../export/simian'
import { addDays, weekday } from '../dates'
import { dayRows } from './expand'
import { substituteDateTokens } from './tokens'
import type { FormatSet } from './types'
import type { Sequential } from '../sequential/types'
import { makeResolver, substituteSequentialTokens } from '../sequential/resolve'
import { mulberry32, type Rng } from '../sequential/rng'

const LINE_SEP = '\r\n'

export interface ResolvedDay {
  text: string
  /** Sequentials with queues advanced by this resolution (persist on export). */
  sequentials: Sequential[]
}

/** Deterministic rng seeded from a date — used for stable previews. */
export function seededRngForDate(date: CalendarDate): Rng {
  return mulberry32(date.year * 10000 + date.month * 100 + date.day)
}

/**
 * Resolve a full day for a calendar date: derive the weekday, expand the
 * assigned formats (date tokens filled), then substitute `{sequential}` tokens
 * in chronological order, popping each sequential's queue. Returns the Simian
 * text and the advanced sequentials.
 */
export function resolveForDate(
  set: FormatSet,
  date: CalendarDate,
  sequentials: Sequential[],
  rng: Rng = Math.random
): ResolvedDay {
  // Expand without date substitution so sequential prefixes stay intact for
  // lookup, then resolve {sequential} → template, then fill [date] tokens. This
  // also lets a sequential's prefix itself contain date tokens.
  const events = dayRows(set, weekday(date))
  const resolver = makeResolver(sequentials, rng)
  const pop = (name: string): string | null => resolver.pop(name)
  const nextDay = addDays(date, 1)
  const NEXT_STRIP = /\s*\[NEXT\]\s*/gi

  // [NEXT] (Natural Grid "load next day's log") is row-level: if EITHER the name
  // or description contains it, the whole row's date tokens resolve for the next
  // day (so the log filename and its description both advance), and the marker is
  // stripped from both fields.
  const lines = events.map((ev) => {
    const name = substituteSequentialTokens(ev.name, pop)
    const description =
      ev.description != null ? substituteSequentialTokens(ev.description, pop) : ev.description
    const rowNext =
      /\[NEXT\]/i.test(name) || (description != null && /\[NEXT\]/i.test(description))
    const when = rowNext ? nextDay : date
    const fill = (text: string): string =>
      substituteDateTokens(rowNext ? text.replace(NEXT_STRIP, ' ').trim() : text, when)
    return eventLine({
      ...ev,
      name: fill(name),
      description: description != null ? fill(description) : description
    })
  })

  const text = lines.length ? lines.join(LINE_SEP) + LINE_SEP : ''
  return { text, sequentials: resolver.updated() }
}
