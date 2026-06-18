/**
 * Programs in a station grid are human titles (often Arabic, with trailing
 * spaces and embedded newlines). Simian needs a file name, so the operator
 * maintains a title → file-name map (persisted by the main process). Keys are
 * normalized so cosmetic whitespace differences in the grid still match.
 */

export type ProgramMap = Record<string, string>

/** Canonical lookup key: trim, and collapse all whitespace (incl. newlines). */
export function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

export interface ResolvedName {
  /** The file name to emit. */
  name: string
  /** False when the title had no mapping (caller should surface a warning). */
  mapped: boolean
}

/**
 * Resolve a program title to a file name. When unmapped, falls back to the
 * normalized title so the pipeline still runs, and flags it for the UI.
 */
export function resolveProgramName(map: ProgramMap, title: string): ResolvedName {
  const key = normalizeTitle(title)
  const mapped = Object.prototype.hasOwnProperty.call(map, key)
  return { name: mapped ? map[key] : key, mapped }
}
