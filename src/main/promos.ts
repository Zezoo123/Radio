import { readFile, writeFile } from 'node:fs/promises'
import type { PromoSet } from './core/parsers/promosFile'
import type { PromoExclusions, PromoOverrides } from './core/promos/schedule'
import { stationFile, stationFileEnsured } from './station'

/** What's persisted to promos.json: the imported set + the user's edits. */
export interface PromosFile {
  fileName: string | null
  set: PromoSet
  /** Per-program, per-date manual time edits. */
  overrides: PromoOverrides
  /** Per-program hours excluded from the random range. */
  exclusions: PromoExclusions
}

export function emptyPromosFile(): PromosFile {
  return { fileName: null, set: { entries: [] }, overrides: {}, exclusions: {} }
}

/**
 * Coerce persisted exclusions to the per-weekday shape. Migrates the earlier
 * global `number[]` form (one list for every day) by applying it to all 7 days.
 */
function normalizeExclusions(raw: unknown): PromoExclusions {
  const out: PromoExclusions = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const ints = (xs: unknown): number[] =>
      Array.isArray(xs) ? xs.filter((n): n is number => Number.isInteger(n)) : []
    if (value.length > 0 && typeof value[0] === 'number') {
      const all = ints(value)
      out[key] = Array.from({ length: 7 }, () => [...all])
    } else {
      out[key] = Array.from({ length: 7 }, (_, i) => ints(value[i]))
    }
  }
  return out
}

/** Persists the imported promo set and per-date time overrides as JSON, per station. */
class PromosStore {
  async load(): Promise<PromosFile> {
    try {
      const raw = JSON.parse(await readFile(stationFile('promos.json'), 'utf-8')) as Partial<PromosFile>
      return {
        fileName: raw.fileName ?? null,
        set: raw.set?.entries ? raw.set : { entries: [] },
        overrides: raw.overrides ?? {},
        exclusions: normalizeExclusions(raw.exclusions)
      }
    } catch (err) {
      // Only a missing file means "first run"; other errors must surface so
      // a failed read can't be persisted back as an empty set on the next save.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyPromosFile()
      throw err
    }
  }

  async save(file: PromosFile): Promise<void> {
    await writeFile(await stationFileEnsured('promos.json'), JSON.stringify(file, null, 2), 'utf-8')
  }
}

export const promosStore = new PromosStore()
