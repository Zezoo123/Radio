import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadSimianDb, lookupDuration } from '../src/main/core/simianDb'
import { isBsiBuffer, parseBsiLog } from '../src/main/core/parsers/bsiLog'
import { parseLogText, serializeRows } from '../src/renderer/src/lib/logRows'

// Integration checks against the user's real Simian files. They live in
// Dropbox (not committed), so these suites self-skip where they're absent.
const DB_PATH = '/Users/zezo/Library/CloudStorage/Dropbox/Zeyad/Radio Scheduler/audio.mdb'
const BSI_PATH = '/Users/zezo/Library/CloudStorage/Dropbox/Zeyad/H260713.bsi'

describe.skipIf(!existsSync(DB_PATH))('Simian audio.mdb (local integration)', () => {
  it('loads the audio table and finds the station carts', () => {
    const db = loadSimianDb(readFileSync(DB_PATH))
    expect(db.table).toBe('Audio1')
    expect(db.tracks.size).toBeGreaterThan(15000)

    // Promo cart, stored as HP25-ChillChat.wav with Length "00:00:30.752".
    expect(lookupDuration(db.tracks, 'HP25-ChillChat')).toBeCloseTo(30.752, 3)
    // Sheets use underscores, the library uses dashes (ADS-1705-B.wav).
    expect(lookupDuration(db.tracks, 'ADS_1705_B')).toBeCloseTo(20.444, 3)
    // Azan audio row from the daily log.
    expect(lookupDuration(db.tracks, 'AZ22-01RB')).toBeGreaterThan(200)
    expect(lookupDuration(db.tracks, 'NOT-A-REAL-CART')).toBeNull()
  })
})

describe.skipIf(!existsSync(BSI_PATH))('Simian .bsi log (local integration)', () => {
  it('reads the List table into ordered pipe rows with durations', () => {
    const buffer = readFileSync(BSI_PATH)
    expect(isBsiBuffer(buffer)).toBe(true)

    const { lines, durations } = parseBsiLog(buffer)
    expect(lines).toHaveLength(833)
    expect(durations).toHaveLength(833)

    // First row of the log, in AbsPosition order.
    expect(lines[0]).toBe('00:00:10|+|L024-073|LI|Liner                    ID Arabic Slow')
    expect(durations[0]).toBe(7) // Length "00:07"
    expect(durations[1]).toBe(230) // "03:50"

    // Arabic descriptions come out as real Arabic, not cp1252 mojibake.
    expect(lines[1]).toContain('رامى جمال')
    // Cues survive as the three Simian codes.
    const cues = new Set(lines.map((l) => l.split('|')[1]))
    expect([...cues].sort()).toEqual(['#', '+', '@'])

    // And the converted text round-trips through the editor grid.
    const text = lines.join('\r\n') + '\r\n'
    expect(serializeRows(parseLogText(text))).toBe(text)
  })
})
