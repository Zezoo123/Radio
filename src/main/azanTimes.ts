import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { AzanTimes } from './core/prayer/azan'
import { DEFAULT_BIASES, type AzanBiases } from './core/prayer/calibrate'

/**
 * Persists the OFFICIAL azan times fetched from esa.gov.eg, plus the fallback
 * calibration fitted from them. Global (azan times are Cairo's, shared by every
 * station); the export uses these verbatim for covered dates and the calibrated
 * computation for the rest — never the network.
 */

export interface AzanTimesFile {
  /** `YYYY-MM-DD` → official times (`HH:MM:SS` per prayer). */
  times: Record<string, AzanTimes>
  /** Fallback calibration fitted from `times` at the last fetch. */
  biases: AzanBiases
  /** ISO timestamp of the last successful fetch (null = never fetched). */
  fetchedAt: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HMS = /^\d{2}:\d{2}:\d{2}$/
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const

export function normalizeAzanTimesFile(raw: unknown): AzanTimesFile {
  const out: AzanTimesFile = { times: {}, biases: { ...DEFAULT_BIASES }, fetchedAt: null }
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Partial<AzanTimesFile>
  if (o.times && typeof o.times === 'object') {
    for (const [date, times] of Object.entries(o.times)) {
      if (!ISO_DATE.test(date) || !times || typeof times !== 'object') continue
      const t = times as Record<string, unknown>
      if (PRAYERS.every((p) => typeof t[p] === 'string' && HMS.test(t[p] as string))) {
        out.times[date] = times as AzanTimes
      }
    }
  }
  if (o.biases && typeof o.biases === 'object') {
    for (const p of PRAYERS) {
      const b = (o.biases as Record<string, unknown>)[p]
      if (typeof b === 'number' && Number.isFinite(b) && Math.abs(b) <= 600) out.biases[p] = b
    }
  }
  if (typeof o.fetchedAt === 'string') out.fetchedAt = o.fetchedAt
  return out
}

/** Coverage summary for the UI: how many days, spanning which dates. */
export function coverageOf(file: AzanTimesFile): {
  dayCount: number
  first: string | null
  last: string | null
  fetchedAt: string | null
} {
  const dates = Object.keys(file.times).sort()
  return {
    dayCount: dates.length,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    fetchedAt: file.fetchedAt
  }
}

function filePath(): string {
  return join(app.getPath('userData'), 'azan-times.json')
}

class AzanTimesStore {
  async load(): Promise<AzanTimesFile> {
    try {
      return normalizeAzanTimesFile(JSON.parse(await readFile(filePath(), 'utf-8')))
    } catch {
      return normalizeAzanTimesFile(null)
    }
  }

  async save(file: AzanTimesFile): Promise<void> {
    await writeFile(filePath(), JSON.stringify(normalizeAzanTimesFile(file), null, 1), 'utf-8')
  }
}

export const azanTimesStore = new AzanTimesStore()
