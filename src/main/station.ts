import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

/** The fixed set of stations. Each gets its own formats, promos and imports. */
export const STATIONS = ['MegaFM', 'NaghamFM', 'RadioHitsFM', 'Sha3byFM'] as const
export type Station = (typeof STATIONS)[number]

let active: Station | null = null

export function getActiveStation(): Station | null {
  return active
}

export function setActiveStation(station: Station): void {
  if (!STATIONS.includes(station)) throw new Error(`Unknown station: ${station}`)
  active = station
}

/** Per-station data directory under userData, e.g. …/stations/MegaFM. */
function stationDir(): string {
  if (!active) throw new Error('No station selected')
  return join(app.getPath('userData'), 'stations', active)
}

/** Path to a per-station data file (does NOT create the directory — for reads). */
export function stationFile(name: string): string {
  return join(stationDir(), name)
}

/** Same, but ensures the station directory exists first — for writes. */
export async function stationFileEnsured(name: string): Promise<string> {
  await mkdir(stationDir(), { recursive: true })
  return stationFile(name)
}
