import type { Sequential } from './types'

/**
 * Validate a sequential arriving from a portable format file. Keeps the queue
 * and last-played value so the rotation continues exactly where the saving PC
 * left off; anything malformed is dropped rather than imported broken.
 */
export function sanitizeSequential(raw: unknown): Sequential | null {
  const s = raw as Partial<Sequential> | null
  if (!s || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !s.name) return null
  if (s.mode !== 'numerical' && s.mode !== 'alphabetical') return null
  if (typeof s.start !== 'string' || typeof s.end !== 'string') return null
  return {
    id: s.id,
    name: s.name,
    mode: s.mode,
    start: s.start,
    end: s.end,
    randomize: Boolean(s.randomize),
    queue: Array.isArray(s.queue) ? s.queue.filter((q): q is string => typeof q === 'string') : [],
    last: typeof s.last === 'string' ? s.last : undefined
  }
}
