import { readFile, writeFile } from 'node:fs/promises'
import { emptyFormatSet, type FormatSet } from './core/format/types'
import { normalizeFormatSet } from './core/format/normalize'
import { stationFile, stationFileEnsured } from './station'

export { normalizeFormatSet }

/** Persists the hour-format set (clocks + week grid) as JSON, per station. */
class FormatStore {
  async load(): Promise<FormatSet> {
    try {
      const raw = JSON.parse(await readFile(stationFile('formats.json'), 'utf-8'))
      return normalizeFormatSet(raw) ?? emptyFormatSet()
    } catch (err) {
      // Only a missing file means "first run". Anything else (permissions,
      // disk error, corrupt JSON) must surface — defaulting to empty here
      // lets the next save() overwrite the user's data.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyFormatSet()
      throw err
    }
  }

  async save(set: FormatSet): Promise<void> {
    await writeFile(await stationFileEnsured('formats.json'), JSON.stringify(set, null, 2), 'utf-8')
  }
}

export const formatStore = new FormatStore()
