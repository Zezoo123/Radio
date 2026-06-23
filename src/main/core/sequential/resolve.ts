import type { Sequential } from './types'
import { sequentialValues } from './values'
import type { Rng } from './rng'

const TOKEN_RE = /\{([A-Za-z0-9_]+)\}/g

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
  const work = new Map<string, { seq: Sequential; queue: string[] }>()
  for (const seq of sequentials) work.set(seq.name, { seq, queue: seq.queue.slice() })

  return {
    pop(name: string): string | null {
      const entry = work.get(name)
      if (!entry) return null
      if (entry.queue.length === 0) entry.queue = refillQueue(entry.seq, rng)
      return entry.queue.shift() ?? null
    },
    updated(): Sequential[] {
      return sequentials.map((seq) => ({ ...seq, queue: work.get(seq.name)?.queue ?? seq.queue }))
    }
  }
}

/** Replace `{name}` tokens in text via pop(); unknown names are left as-is. */
export function substituteSequentialTokens(text: string, pop: (name: string) => string | null): string {
  return text.replace(TOKEN_RE, (match, name: string) => pop(name) ?? match)
}
