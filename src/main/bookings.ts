import { readFile, writeFile } from 'node:fs/promises'
import { stationFile, stationFileEnsured } from './station'

/**
 * One imported Booking element, persisted BY REFERENCE: the Excel file's path
 * plus its stats when last read — never the parsed data. The spreadsheet stays
 * the source of truth; the app re-parses on launch, so external edits are
 * picked up automatically. `code`/`category` are the user's in-app overrides
 * and survive restarts — including while the file itself is missing.
 */
export interface BookingRef {
  path: string
  /** mtime (ms) when last parsed — a difference means the sheet was edited outside the app. */
  mtimeMs: number
  /** File size in bytes when last parsed. */
  size: number
  /** In-app override of the element code (export file names follow it). */
  code?: string
  /** In-app override of the Simian Category. */
  category?: string
}

function normalizeRef(raw: unknown): BookingRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<BookingRef>
  if (typeof obj.path !== 'string' || !obj.path.trim()) return null
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined
  const code = str(obj.code)
  const category = str(obj.category)
  return {
    path: obj.path,
    mtimeMs: num(obj.mtimeMs),
    size: num(obj.size),
    ...(code ? { code } : {}),
    ...(category ? { category } : {})
  }
}

/** Persists the imported Booking element references as JSON, per station. */
class BookingsStore {
  async load(): Promise<BookingRef[]> {
    try {
      const raw = JSON.parse(await readFile(stationFile('bookings.json'), 'utf-8')) as {
        templates?: unknown
      }
      if (!Array.isArray(raw.templates)) return []
      return raw.templates.map(normalizeRef).filter((r): r is BookingRef => r !== null)
    } catch (err) {
      // Only a missing file means "first run"; other errors must surface so
      // a failed read can't be persisted back as an empty list on the next save.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  async save(templates: BookingRef[]): Promise<void> {
    await writeFile(
      await stationFileEnsured('bookings.json'),
      JSON.stringify({ templates }, null, 2),
      'utf-8'
    )
  }
}

export const bookingsStore = new BookingsStore()
