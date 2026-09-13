import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_CATEGORIES } from './core/format/types'

/**
 * Persists app-wide front-end preferences — the single category list every
 * form offers, and the per-category row colors used by the log Editor. Global
 * (shared by every station), set in Settings.
 */

export interface UiSettings {
  /**
   * THE app-wide category list (UPPERCASE). Every category dropdown — Booking,
   * Clock rows, the AZAN format — offers exactly these; add/delete in
   * Settings. Deleting only removes the option: rows keeping a deleted
   * category still work (selects show the unknown value prepended).
   */
  categories: string[]
  /** Simian Category (UPPERCASE) → row highlight color as `#rrggbb`. Absent = no tint. */
  categoryColors: Record<string, string>
  /** Simian Category (UPPERCASE) → row text color as `#rrggbb`. Absent = default text. */
  categoryTextColors: Record<string, string>
  /** App-wide opacity % (1-100) applied to every highlight color. */
  tintOpacity: number
  /** App-wide opacity % (1-100) applied to every category text color. */
  textOpacity: number
}

// Colors persist solid; an alpha suffix from transient builds is dropped.
const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

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
      out[renamed ?? key] = color.toLowerCase().slice(0, 7)
    }
  }
  return out
}

function normalizePct(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 100 ? raw : fallback
}

function normalizeCategories(raw: unknown): string[] {
  // Settings written before the list existed fall back to the built-ins.
  if (!Array.isArray(raw)) return [...DEFAULT_CATEGORIES]
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const key = item.trim().toUpperCase()
    const name = RENAMED_CATEGORIES[key] ?? key
    if (name && name.length <= 32 && !out.includes(name)) out.push(name)
  }
  return out
}

export function normalizeUiSettings(raw: unknown): UiSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<UiSettings>) : {}
  return {
    categories: normalizeCategories(obj.categories),
    categoryColors: normalizeColorMap(obj.categoryColors),
    categoryTextColors: normalizeColorMap(obj.categoryTextColors),
    tintOpacity: normalizePct(obj.tintOpacity, 35),
    textOpacity: normalizePct(obj.textOpacity, 100)
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
