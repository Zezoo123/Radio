import type { Section } from '../types'

/**
 * Orders the items injected into a commercial break.
 *
 * A break is every injected item sharing one `HH:MM` — stations book their
 * spots on the hour's break minutes (:10 :30 :50 …), so the booking-element
 * events and promos landing on the same minute form one break. Simian sorts
 * the imported log by time, so items with identical times play in file order,
 * which is whatever order the sections happen to serialize in. This pass makes
 * the order deliberate: within each break the items sort by category priority
 * (liner opens, then ads, features, promos) and the SECONDS field is rewritten
 * to 00, 01, 02 … to force that order. The minute never changes.
 *
 * Only sequential (`+`) rows participate — a timed row (`@`/`#`) fires at its
 * wall-clock time, so its seconds are real and must not move. Clock rows and
 * azan rows are the day's fixed skeleton and are not touched either.
 */

/** Play order within a break: lower runs first. Unlisted categories run last. */
export const BREAK_PRIORITY: Record<string, number> = {
  LI_C: 0,
  ADV: 1,
  FEA: 2,
  PROMO: 3
}

const UNLISTED_PRIORITY = 4

const TIME_RE = /^\d{2}:\d{2}:\d{2}$/

const pad2 = (n: number): string => String(n).padStart(2, '0')

function priorityOf(category: string | undefined): number {
  return BREAK_PRIORITY[(category ?? '').trim().toUpperCase()] ?? UNLISTED_PRIORITY
}

/** One reorderable item: where it sits (`HH:MM`) and how to move its seconds. */
interface Handle {
  minute: string
  priority: number
  /** Position in the day's original emit order — the tie-breaker, for stability. */
  order: number
  setSecond(second: number): void
}

/**
 * Sequence every break formed by the injected items: the booking-element
 * section events plus the promo rows. Returns rewritten copies; the inputs are
 * not mutated. Breaks with a single item keep their original seconds.
 */
export function sequenceBreaks(
  sections: Section[],
  promoLines?: string[]
): { sections: Section[]; promoLines?: string[] } {
  const outSections = sections.map((s) => ({ ...s, events: s.events.map((e) => ({ ...e })) }))
  const outPromoLines = promoLines ? [...promoLines] : undefined

  const handles: Handle[] = []
  let order = 0

  for (const section of outSections) {
    for (const event of section.events) {
      if (event.cue !== '+' || !TIME_RE.test(event.time)) continue
      handles.push({
        minute: event.time.slice(0, 5),
        priority: priorityOf(event.category),
        order: order++,
        setSecond: (s) => (event.time = `${event.time.slice(0, 5)}:${pad2(s)}`)
      })
    }
  }

  outPromoLines?.forEach((line, i) => {
    const fields = line.split('|')
    if (fields[1] !== '+' || !TIME_RE.test(fields[0] ?? '')) return
    handles.push({
      minute: fields[0].slice(0, 5),
      priority: priorityOf(fields[3]),
      order: order++,
      setSecond: (s) => (outPromoLines[i] = `${fields[0].slice(0, 5)}:${pad2(s)}${line.slice(8)}`)
    })
  })

  const breaks = new Map<string, Handle[]>()
  for (const h of handles) {
    const group = breaks.get(h.minute)
    if (group) group.push(h)
    else breaks.set(h.minute, [h])
  }

  for (const group of breaks.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => a.priority - b.priority || a.order - b.order)
    group.forEach((h, i) => h.setSecond(Math.min(i, 59)))
  }

  // Reassigned seconds are ascending in emit order within a category, so each
  // section stays time-sorted — but keep the invariant explicit.
  for (const section of outSections) {
    section.events.sort((a, b) => a.time.localeCompare(b.time))
  }

  return { sections: outSections, promoLines: outPromoLines }
}
