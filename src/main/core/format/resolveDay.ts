import type { CalendarDate } from '../types'
import { eventLine } from '../export/simian'
import { weekday } from '../dates'
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
  const apply = (text: string): string =>
    substituteDateTokens(substituteSequentialTokens(text, pop), date)

  const lines = events.map((ev) =>
    eventLine({
      ...ev,
      name: apply(ev.name),
      description: ev.description != null ? apply(ev.description) : ev.description
    })
  )

  const text = lines.length ? lines.join(LINE_SEP) + LINE_SEP : ''
  return { text, sequentials: resolver.updated() }
}
