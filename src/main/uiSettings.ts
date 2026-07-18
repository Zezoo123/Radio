import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Persists app-wide front-end preferences — currently the per-category row
 * colors used by the log Editor. Global (shared by every station), set in
 * Settings.
 */

export interface UiSettings {
  /** Simian Category (UPPERCASE) → row highlight color as `#rrggbb`. Absent = no tint. */
  categoryColors: Record<string, string>
  /** Simian Category (UPPERCASE) → row text color as `#rrggbb`. Absent = default text. */
  categoryTextColors: Record<string, string>
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Category renames applied to older persisted data (old name → new name). */
const RENAMED_CATEGORIES: Record<string, string> = { ADS: 'ADV' }

function normalizeColorMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [category, color] of Object.entries(raw)) {
    if (typeof color === 'string' && HEX_COLOR.test(color) && category.trim()) {
      const key = category.trim().toUpperCase()
      const renamed = RENAMED_CATEGORIES[key]
      // A color already stored under the new name wins over the legacy one.
      if (renamed && renamed in out) continue
      out[renamed ?? key] = color.toLowerCase()
    }
  }
  return out
}

export function normalizeUiSettings(raw: unknown): UiSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<UiSettings>) : {}
  return {
    categoryColors: normalizeColorMap(obj.categoryColors),
    categoryTextColors: normalizeColorMap(obj.categoryTextColors)
  }
}

function filePath(): string {
  return join(app.getPath('userData'), 'ui-settings.json')
}

class UiSettingsStore {
  async load(): Promise<UiSettings> {
    try {
      return normalizeUiSettings(JSON.parse(await readFile(filePath(), 'utf-8')))
    } catch {
      return normalizeUiSettings(null)
    }
  }

  async save(settings: UiSettings): Promise<void> {
    await writeFile(filePath(), JSON.stringify(normalizeUiSettings(settings), null, 2), 'utf-8')
  }
}

export const uiSettingsStore = new UiSettingsStore()
