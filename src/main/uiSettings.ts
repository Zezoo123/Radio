import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Persists app-wide front-end preferences — currently the per-category row
 * colors used by the log Editor. Global (shared by every station), set in
 * Settings.
 */

export interface UiSettings {
  /** Simian Category (UPPERCASE) → row color as `#rrggbb`. Absent = no tint. */
  categoryColors: Record<string, string>
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function normalizeUiSettings(raw: unknown): UiSettings {
  const out: UiSettings = { categoryColors: {} }
  if (!raw || typeof raw !== 'object') return out
  const colors = (raw as Partial<UiSettings>).categoryColors
  if (colors && typeof colors === 'object') {
    for (const [category, color] of Object.entries(colors)) {
      if (typeof color === 'string' && HEX_COLOR.test(color) && category.trim()) {
        out.categoryColors[category.trim().toUpperCase()] = color.toLowerCase()
      }
    }
  }
  return out
}

function filePath(): string {
  return join(app.getPath('userData'), 'ui-settings.json')
}

class UiSettingsStore {
  async load(): Promise<UiSettings> {
    try {
      return normalizeUiSettings(JSON.parse(await readFile(filePath(), 'utf-8')))
    } catch {
      return { categoryColors: {} }
    }
  }

  async save(settings: UiSettings): Promise<void> {
    await writeFile(filePath(), JSON.stringify(normalizeUiSettings(settings), null, 2), 'utf-8')
  }
}

export const uiSettingsStore = new UiSettingsStore()
