import type { Sequential } from './types'
import { sequentialValues } from './values'
import type { Rng } from './rng'

// A sequential token is {name}; the name (= prefix) may contain hyphens and
// even date tokens (e.g. {abc-[YYMMDD]}), so allow anything but braces.
const TOKEN_RE = /\{([^{}]+)\}/g

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A fresh cycle of values (shuffled when randomize is on). */
export function refillQueue(seq: Sequential, rng: Rng): string[] {
  const values = sequentialValues(seq)
  return seq.randomize ? shuffle(values, rng) : values
}

export interface SequentialResolver {
  /** Next value for a sequential name, or null if the name is unknown. */
  pop(name: string): string | null
  /** Sequentials with their queues advanced to reflect the pops so far. */
  updated(): Sequential[]
}

/**
 * Builds a resolver over a set of sequentials. Each pop() takes the next value
 * from that sequential's queue, refilling (a full cycle) when empty so every
 * value appears once per cycle. Queues start from each sequential's persisted
 * state, so rotation continues across exports.
 */
export function makeResolver(sequentials: Sequential[], rng: Rng): SequentialResolver {
  const work = new Map<string, { seq: Sequential; queue: string[]; last?: string }>()
  for (const seq of sequentials) work.set(seq.name, { seq, queue: seq.queue.slice(), last: seq.last })

  return {
    pop(name: string): string | null {
      const entry = work.get(name)
      if (!entry) return null
      if (entry.queue.length === 0) {
        const next = refillQueue(entry.seq, rng)
        // Never repeat the same file twice in a row: if a fresh cycle would
        // start with the value just played, swap it deeper into the cycle.
        if (next.length > 1 && entry.last !== undefined && next[0] === entry.last) {
          const j = 1 + Math.floor(rng() * (next.length - 1))
          ;[next[0], next[j]] = [next[j], next[0]]
        }
        entry.queue = next
      }
      const value = entry.queue.shift() ?? null
      if (value !== null) entry.last = value
      return value
    },
    updated(): Sequential[] {
      return sequentials.map((seq) => {
        const w = work.get(seq.name)
        return w ? { ...seq, queue: w.queue, last: w.last } : seq
      })
    }
  }
}

/** Replace `{name}` tokens in text via pop(); unknown names are left as-is. */
export function substituteSequentialTokens(text: string, pop: (name: string) => string | null): string {
  return text.replace(TOKEN_RE, (match, name: string) => pop(name) ?? match)
}
