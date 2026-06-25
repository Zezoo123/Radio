import {
  DEFAULT_CATEGORIES,
  emptyDayDefaults,
  type FormatSet,
  type WeekGrid
} from './types'

/** Coerce a parsed grid into a well-formed 7×24 grid. */
function normalizeGrid(grid: WeekGrid | undefined): WeekGrid {
  const cells: (string | null)[][] = []
  for (let wd = 0; wd < 7; wd++) {
    const row = grid?.cells?.[wd] ?? []
    const out = new Array<string | null>(24).fill(null)
    for (let h = 0; h < 24; h++) out[h] = row[h] ?? null
    cells.push(out)
  }
  return { cells }
}

/**
 * Validate + migrate a parsed object into a FormatSet, or null if it isn't one.
 * Shared by the auto-store and file import so older/partial data is tolerated.
 */
export function normalizeFormatSet(raw: unknown): FormatSet | null {
  const set = raw as FormatSet | undefined
  if (!set || !Array.isArray(set.formats) || !set.grid) return null
  set.grid = normalizeGrid(set.grid)
  if (!Array.isArray(set.categories) || set.categories.length === 0) {
    set.categories = [...DEFAULT_CATEGORIES]
  }
  if (!Array.isArray(set.defaultClocks)) set.defaultClocks = []
  if (!Array.isArray(set.dayDefaults) || set.dayDefaults.length !== 7) {
    set.dayDefaults = emptyDayDefaults()
  }
  return set
}
