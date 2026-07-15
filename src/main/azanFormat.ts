import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_AZAN_FORMAT, type AzanFormat, type AzanLine } from './core/prayer/azanRows'
import type { Cue } from './core/types'

/**
 * Persists the AZAN format — the deckfade/extra lines and their offsets around
 * each prayer's azan. This is a global setting (shared by every station); it's
 * set once in Settings and rarely changes.
 */

function filePath(): string {
  return join(app.getPath('userData'), 'azan-format.json')
}

function normalizeLine(raw: unknown): AzanLine | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<AzanLine>
  const cue: Cue = o.cue === '@' || o.cue === '#' ? o.cue : '+'
  return {
    offset: Number.isFinite(o.offset) ? Math.trunc(o.offset as number) : 0,
    cue,
    name: typeof o.name === 'string' ? o.name : '',
    category: typeof o.category === 'string' ? o.category : '',
    description: typeof o.description === 'string' ? o.description : ''
  }
}

/** Coerce persisted/incoming data to a well-formed AzanFormat. */
export function normalizeAzanFormat(raw: unknown): AzanFormat {
  if (!raw || typeof raw !== 'object') {
    return { azanCategory: 'FEATURE', lines: DEFAULT_AZAN_FORMAT.lines.map((l) => ({ ...l })) }
  }
  const o = raw as Partial<AzanFormat>
  return {
    azanCategory: typeof o.azanCategory === 'string' && o.azanCategory ? o.azanCategory : 'FEATURE',
    lines: Array.isArray(o.lines)
      ? (o.lines.map(normalizeLine).filter(Boolean) as AzanLine[])
      : []
  }
}

class AzanFormatStore {
  async load(): Promise<AzanFormat> {
    try {
      return normalizeAzanFormat(JSON.parse(await readFile(filePath(), 'utf-8')))
    } catch (err) {
      // Only a missing file means "first run" → seed with the default format.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { azanCategory: 'FEATURE', lines: DEFAULT_AZAN_FORMAT.lines.map((l) => ({ ...l })) }
      }
      throw err
    }
  }

  async save(format: AzanFormat): Promise<void> {
    await writeFile(filePath(), JSON.stringify(normalizeAzanFormat(format), null, 2), 'utf-8')
  }
}

export const azanFormatStore = new AzanFormatStore()
