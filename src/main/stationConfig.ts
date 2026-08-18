import { readFile, writeFile } from 'node:fs/promises'
import { DEFAULT_HOURLY, type HourlyOptions } from './core/schedule/hourly'
import { stationFile, stationFileEnsured } from './station'

/**
 * The per-station LOG composition toggles (the include-chips + hourly-marker
 * options), persisted so they survive restarts instead of resetting to the
 * defaults every launch.
 */
export interface StationConfig {
  hourly: HourlyOptions
  includeAzan: boolean
  includePromos: boolean
  includeClocks: boolean
  includeElements: boolean
  includeMusic: boolean
}

export function defaultStationConfig(): StationConfig {
  return {
    hourly: { ...DEFAULT_HOURLY },
    includeAzan: false,
    includePromos: true,
    includeClocks: true,
    includeElements: true,
    includeMusic: true
  }
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const hour = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback

export function normalizeStationConfig(raw: unknown): StationConfig {
  const def = defaultStationConfig()
  if (!raw || typeof raw !== 'object') return def
  const obj = raw as Partial<StationConfig>
  const h = obj.hourly && typeof obj.hourly === 'object' ? obj.hourly : def.hourly
  return {
    hourly: {
      enabled: bool(h.enabled, def.hourly.enabled),
      startHour: hour(h.startHour, def.hourly.startHour),
      endHour: hour(h.endHour, def.hourly.endHour)
    },
    includeAzan: bool(obj.includeAzan, def.includeAzan),
    includePromos: bool(obj.includePromos, def.includePromos),
    includeClocks: bool(obj.includeClocks, def.includeClocks),
    includeElements: bool(obj.includeElements, def.includeElements),
    includeMusic: bool(obj.includeMusic, def.includeMusic)
  }
}

/** Persists the LOG toggles as JSON, per station. */
class StationConfigStore {
  async load(): Promise<StationConfig> {
    try {
      return normalizeStationConfig(JSON.parse(await readFile(stationFile('config.json'), 'utf-8')))
    } catch (err) {
      // Only a missing file means "first run". Anything else (permissions,
      // corrupt JSON) must surface rather than silently resetting the toggles.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultStationConfig()
      throw err
    }
  }

  async save(config: StationConfig): Promise<void> {
    await writeFile(
      await stationFileEnsured('config.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    )
  }
}

export const stationConfigStore = new StationConfigStore()
