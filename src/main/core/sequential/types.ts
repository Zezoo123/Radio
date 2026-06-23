/**
 * A "sequential": a named prefix that expands to PREFIX-<counter>, rotating
 * through a range so repeated uses in a day yield distinct files. Inserted into
 * a clock field as a `{name}` token (curly braces, vs `[]` for dates).
 */
export type SequentialMode = 'numerical' | 'alphabetical'

export interface Sequential {
  id: string
  /** Token name and filename prefix, e.g. `JNG` → `{JNG}` → `JNG-01`. */
  name: string
  mode: SequentialMode
  /** Range start — a number (numerical) or single letter (alphabetical), as text. */
  start: string
  /** Range end (inclusive). */
  end: string
  /** Shuffle each fresh cycle when true; otherwise cycle in order. */
  randomize: boolean
  /** Persisted remaining values in the current cycle (advances across exports). */
  queue: string[]
}
