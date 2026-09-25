import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_AZAN_FORMAT,
  DEFAULT_PRAYER_COMMENTS,
  DEFAULT_PRAYER_NAMES,
  type AzanFormat,
  type AzanLine
} from './core/prayer/azanRows'
import { PRAYER_ORDER, type PrayerName } from './core/prayer/azan'
import type { Cue } from './core/types'

/**
 * Persists the AZAN format — the deckfade/extra lines and their offsets around
 * each prayer's azan. This is a global setting (shared by every station); it's
 * set once in Settings and rarely changes.
 */

function filePath(): string {
  return join(app.getPath('userData'), 'azan-format.json')
}

/** Category renames applied to older persisted data (old name → new name). */
const RENAMED_CATEGORIES: Record<string, string> = { ADS: 'ADV', FEATURE: 'FEA' }

function migrateCategory(category: string): string {
  return RENAMED_CATEGORIES[category] ?? category
}

function normalizeLine(raw: unknown): AzanLine | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<AzanLine>
  const cue: Cue = o.cue === '@' || o.cue === '#' ? o.cue : '+'
  return {
    offset: Number.isFinite(o.offset) ? Math.trunc(o.offset as number) : 0,
    cue,
    name: typeof o.name === 'string' ? o.name : '',
    category: typeof o.category === 'string' ? migrateCategory(o.category) : '',
    description: typeof o.description === 'string' ? o.description : ''
  }
}

/** Per-prayer text map: persisted values win, defaults fill the gaps. */
function normalizePrayerMap(
  raw: unknown,
  defaults: Record<PrayerName, string>
): Record<PrayerName, string> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = {} as Record<PrayerName, string>
  for (const prayer of PRAYER_ORDER) {
    const v = o[prayer]
    out[prayer] = typeof v === 'string' && v.trim() ? v.trim() : defaults[prayer]
  }
  return out
}

/** Coerce persisted/incoming data to a well-formed AzanFormat. */
export function normalizeAzanFormat(raw: unknown): AzanFormat {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_AZAN_FORMAT,
      names: { ...DEFAULT_PRAYER_NAMES },
      comments: { ...DEFAULT_PRAYER_COMMENTS },
      lines: DEFAULT_AZAN_FORMAT.lines.map((l) => ({ ...l }))
    }
  }
  const o = raw as Partial<AzanFormat>
  return {
    azanCategory:
      typeof o.azanCategory === 'string' && o.azanCategory
        ? migrateCategory(o.azanCategory)
        : 'FEA',
    output: o.output === 'comment' ? 'comment' : 'audio',
    names: normalizePrayerMap(o.names, DEFAULT_PRAYER_NAMES),
    comments: normalizePrayerMap(o.comments, DEFAULT_PRAYER_COMMENTS),
    lines: Array.isArray(o.lines) ? (o.lines.map(normalizeLine).filter(Boolean) as AzanLine[]) : []
  }
}

class AzanFormatStore {
  async load(): Promise<AzanFormat> {
    try {
      return normalizeAzanFormat(JSON.parse(await readFile(filePath(), 'utf-8')))
    } catch (err) {
      // Only a missing file means "first run" → seed with the default format.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return normalizeAzanFormat(null)
      }
      throw err
    }
  }

  async save(format: AzanFormat): Promise<void> {
    await writeFile(filePath(), JSON.stringify(normalizeAzanFormat(format), null, 2), 'utf-8')
  }
}

export const azanFormatStore = new AzanFormatStore()
