import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_MUSIC_IMPORT,
  normalizeMusicImportSettings,
  type MusicImportSettings
} from './core/parsers/musicLog'

/**
 * Persists the Music Log import settings — the field START/LENGTH positions
 * mirroring Simian's Tools → Program Options → Log Import (Music format).
 * A global setting like the AZAN format: the stations' Simian installs share
 * one music scheduler layout, and it's set once and rarely changes.
 */

function filePath(): string {
  return join(app.getPath('userData'), 'music-import.json')
}

class MusicImportStore {
  async load(): Promise<MusicImportSettings> {
    try {
      return normalizeMusicImportSettings(JSON.parse(await readFile(filePath(), 'utf-8')))
    } catch (err) {
      // Only a missing file means "first run" → seed with the station default.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return normalizeMusicImportSettings(DEFAULT_MUSIC_IMPORT)
      }
      throw err
    }
  }

  async save(settings: MusicImportSettings): Promise<void> {
    await writeFile(
      filePath(),
      JSON.stringify(normalizeMusicImportSettings(settings), null, 2),
      'utf-8'
    )
  }
}

export const musicImportStore = new MusicImportStore()
