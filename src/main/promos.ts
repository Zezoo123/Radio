import { readFile, writeFile } from 'node:fs/promises'
import type { PromoSet } from './core/parsers/promosFile'
import { blockedHoursGrid } from './core/promos/schedule'
import type { PromoExclusions, PromoOverrides, PromoRules } from './core/promos/schedule'
import { stationFile, stationFileEnsured } from './station'

/** Station rules in their canonical persisted shape: blocked hours per weekday. */
export interface StationRules {
  /** Hours no promo may use, per weekday `[Sun..Sat]`. */
  blockedHours: number[][]
  breaks: number[]
}

/** What's persisted to promos.json: the imported set + the user's edits. */
export interface PromosFile {
  fileName: string | null
  set: PromoSet
  /** Per-program, per-date manual time edits. */
  overrides: PromoOverrides
  /** Per-program hours excluded from the random range. */
  exclusions: PromoExclusions
  /** Station-wide rules: blackout hours + break minutes, applied to every promo. */
  rules: StationRules
}

export function emptyPromosFile(): PromosFile {
  return {
    fileName: null,
    set: { entries: [] },
    overrides: {},
    exclusions: {},
    rules: sanitizeRules(undefined)
  }
}

/**
 * Coerce arbitrary input into well-formed station rules. Blocked hours become
 * per-weekday lists; the earlier flat list migrates to the same hours every day.
 */
export function sanitizeRules(raw: Partial<PromoRules> | undefined): StationRules {
  return {
    blockedHours: blockedHoursGrid(raw?.blockedHours),
    breaks: intList(raw?.breaks, 59)
  }
}

/** Sanitize a persisted int list: whole numbers within [0, max], deduped, sorted. */
function intList(raw: unknown, max: number): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= max))].sort(
    (a, b) => a - b
  )
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
        exclusions: normalizeExclusions(raw.exclusions),
        rules: sanitizeRules(raw.rules)
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
