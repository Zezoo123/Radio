import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_CATEGORIES,
  emptyDefaultDay,
  emptyFormatSet,
  type FormatSet
} from './core/format/types'

/** Persists the hour-format set (clocks + week grid) as JSON in userData. */
class FormatStore {
  private filePath(): string {
    return join(app.getPath('userData'), 'formats.json')
  }

  async load(): Promise<FormatSet> {
    try {
      const set = JSON.parse(await readFile(this.filePath(), 'utf-8')) as FormatSet
      // Tolerate older/partial files.
      if (!set.formats || !set.grid) return emptyFormatSet()
      // Older files predate the category list — seed it with the defaults.
      if (!set.categories || set.categories.length === 0) {
        set.categories = [...DEFAULT_CATEGORIES]
      }
      // Older files predate the default day (and the earlier per-weekday field).
      if (!set.defaultDay || set.defaultDay.length !== 24) {
        set.defaultDay = emptyDefaultDay()
      }
      return set
    } catch {
      return emptyFormatSet()
    }
  }

  async save(set: FormatSet): Promise<void> {
    await writeFile(this.filePath(), JSON.stringify(set, null, 2), 'utf-8')
  }
}

export const formatStore = new FormatStore()
