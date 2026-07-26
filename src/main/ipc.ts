import { readFile, writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import iconv from 'iconv-lite'
import { session } from './session'
import { azanFormatStore } from './azanFormat'
import { uiSettingsStore, type UiSettings } from './uiSettings'
import { formatStore, normalizeFormatSet } from './formats'
import { gridHasAssignments, serializeWeek } from './core/format/expand'
import { resolveForDate, seededRngForDate } from './core/format/resolveDay'
import { sequentialStore } from './sequentials'
import { sanitizeSequential } from './core/sequential/sanitize'
import { loadSimianDb, lookupDuration, lookupTrack, type SimianDb } from './core/simianDb'
import { isBsiBuffer, parseBsiLog } from './core/parsers/bsiLog'
import { STATIONS, getActiveStation, setActiveStation, type Station } from './station'
import { dateRange } from './core/dates'
import type { FormatSet } from './core/format/types'
import type { AzanFormat } from './core/prayer/azanRows'
import type { Sequential } from './core/sequential/types'
import type { HourlyOptions } from './core/schedule/hourly'
import type { CalendarDate } from './core/types'

const XLSX_FILTER = { name: 'Excel files', extensions: ['xlsx', 'xlsm'] }

interface RangeArg {
  start: CalendarDate
  end: CalendarDate
}

const dateKey = (d: CalendarDate): string => `${d.year}-${d.month}-${d.day}`

// Simian reads log files as ANSI (the Windows Arabic codepage on the stations'
// PCs), not UTF-8 — Arabic descriptions exported as UTF-8 come out as mojibake
// in Simian. All log text therefore round-trips through Windows-1256.
const LOG_CODEPAGE = 'windows-1256'
const encodeLogText = (text: string): Buffer => iconv.encode(text, LOG_CODEPAGE)

/** Read a log file: UTF-8 when it strictly is (older exports), ANSI otherwise. */
function decodeLogText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return iconv.decode(buffer, LOG_CODEPAGE)
  }
}

/**
 * Resolve the Formats week-grid clock rows for every day in a range, threading
 * the sequential queues day by day. `persist: false` (preview) uses a per-date
 * seeded rng and leaves queues untouched; `persist: true` (export) uses the live
 * rng and returns the advanced queues for the caller to save.
 */
async function resolveFormatLines(
  start: CalendarDate,
  end: CalendarDate,
  persist: boolean
): Promise<{ byDate: Map<string, string[]>; sequentials: Sequential[] }> {
  const set = await formatStore.load()
  let seqs = await sequentialStore.load()
  const byDate = new Map<string, string[]>()
  for (const date of dateRange(start, end)) {
    const { text, sequentials } = persist
      ? resolveForDate(set, date, seqs)
      : resolveForDate(set, date, seqs, seededRngForDate(date))
    seqs = sequentials
    const lines = text.split('\r\n').filter(Boolean)
    if (lines.length) byDate.set(dateKey(date), lines)
  }
  return { byDate, sequentials: seqs }
}

/** Show a save dialog and write text to the chosen path. */
async function saveText(
  text: string,
  defaultName: string
): Promise<{ saved: boolean; path?: string }> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined
  const res = await dialog.showSaveDialog(win!, {
    title: 'Export',
    defaultPath: defaultName,
    filters: [{ name: 'Text', extensions: ['txt'] }]
  })
  if (res.canceled || !res.filePath) return { saved: false }
  await writeFile(res.filePath, encodeLogText(text))
  return { saved: true, path: res.filePath }
}

export function registerIpc(): void {
  ipcMain.handle('app:ping', () => 'pong')

  // --- Station selection ----------------------------------------------------
  ipcMain.handle('station:list', () => STATIONS)
  ipcMain.handle('station:get', () => getActiveStation())
  ipcMain.handle('station:set', (_e, station: Station) => {
    setActiveStation(station)
    return getActiveStation()
  })

  ipcMain.handle('templates:add', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Add element templates',
      properties: ['openFile', 'multiSelections'],
      filters: [XLSX_FILTER]
    })
    if (res.canceled || res.filePaths.length === 0) return session.templateSummaries()
    return session.addTemplates(res.filePaths)
  })

  ipcMain.handle('templates:remove', (_e, index: number) => session.removeTemplate(index))
  ipcMain.handle('templates:list', () => session.templateSummaries())

  ipcMain.handle(
    'templates:setCategory',
    (_e, { index, category }: { index: number; category: string }) =>
      session.setTemplateCategory(index, category)
  )

  ipcMain.handle('templates:setCode', (_e, { index, code }: { index: number; code: string }) =>
    session.setTemplateCode(index, code)
  )

  ipcMain.handle('templates:grid', (_e, index: number) => session.templateGrid(index))

  ipcMain.handle(
    'templates:preview',
    (_e, { index, start, end }: { index: number } & RangeArg) =>
      session.previewTemplate(index, start, end)
  )

  ipcMain.handle('config:get', () => session.getConfig())
  ipcMain.handle('config:setHourly', (_e, hourly: HourlyOptions) => session.setHourly(hourly))
  ipcMain.handle('config:setIncludeAzan', (_e, include: boolean) => session.setIncludeAzan(include))
  ipcMain.handle('config:setIncludePromos', (_e, include: boolean) =>
    session.setIncludePromos(include)
  )

  // --- AZAN format (global setting) -----------------------------------------
  ipcMain.handle('azanFormat:get', () => azanFormatStore.load())
  ipcMain.handle('azanFormat:save', async (_e, format: AzanFormat) => {
    await azanFormatStore.save(format)
    return azanFormatStore.load()
  })

  // --- Front-end preferences (global setting) --------------------------------
  ipcMain.handle('uiSettings:get', () => uiSettingsStore.load())
  ipcMain.handle('uiSettings:save', async (_e, settings: UiSettings) => {
    await uiSettingsStore.save(settings)
    return uiSettingsStore.load()
  })

  // --- Promos ---------------------------------------------------------------
  ipcMain.handle('promos:open', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open promos spreadsheet',
      properties: ['openFile'],
      filters: [XLSX_FILTER]
    })
    if (res.canceled || !res.filePaths[0]) return session.getPromos()
    return session.loadPromos(res.filePaths[0])
  })
  ipcMain.handle('promos:get', () => session.getPromos())
  ipcMain.handle('promos:entries', () => session.promoEntries())
  ipcMain.handle('promos:remove', () => session.removePromos())
  ipcMain.handle('promos:week', (_e, anchor: CalendarDate) => session.promoWeek(anchor))
  ipcMain.handle('promos:previewForDate', (_e, date: CalendarDate) =>
    session.promoTextForDate(date)
  )
  ipcMain.handle(
    'promos:setTimes',
    (_e, { fileName, date, times }: { fileName: string; date: CalendarDate; times: string[] }) =>
      session.setPromoTimes(fileName, date, times)
  )
  ipcMain.handle(
    'promos:resetTimes',
    (_e, { fileName, date }: { fileName: string; date: CalendarDate }) =>
      session.resetPromoTimes(fileName, date)
  )
  ipcMain.handle(
    'promos:setExcludedHours',
    (
      _e,
      {
        fileName,
        weekday,
        hours,
        anchor
      }: { fileName: string; weekday: number; hours: number[]; anchor: CalendarDate }
    ) => session.setPromoExcludedHours(fileName, weekday, hours, anchor)
  )

  ipcMain.handle('formats:load', () => formatStore.load())
  ipcMain.handle('formats:save', (_e, set: FormatSet) => formatStore.save(set))

  // Export/import the whole format set (clocks + grid + defaults) as a portable
  // file the user can back up, move between PCs, or keep several of.
  const FORMAT_FILTER = { name: 'Radio grid format', extensions: ['json'] }

  ipcMain.handle('formats:saveToFile', async (_e, set: FormatSet) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showSaveDialog(win!, {
      title: 'Save weekly grid format',
      defaultPath: 'weekly-grid.json',
      filters: [FORMAT_FILTER]
    })
    if (res.canceled || !res.filePath) return { saved: false }
    // Bundle the sequentials (definitions + current rotation position) so the
    // clocks' {tokens} keep resolving when the file is loaded on another PC.
    const sequentials = await sequentialStore.load()
    await writeFile(res.filePath, JSON.stringify({ ...set, sequentials }, null, 2), 'utf-8')
    return { saved: true, path: res.filePath }
  })

  ipcMain.handle('formats:loadFromFile', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Load weekly grid format',
      properties: ['openFile'],
      filters: [FORMAT_FILTER]
    })
    if (res.canceled || !res.filePaths[0]) return { status: 'cancelled' as const }
    try {
      const raw = JSON.parse(await readFile(res.filePaths[0], 'utf-8'))
      const set = normalizeFormatSet(raw)
      if (!set) return { status: 'invalid' as const }
      // Import bundled sequentials (older format files simply don't have any):
      // same id replaces, everything else is kept — queue position included.
      let importedSequentials = 0
      const bundled = (raw as { sequentials?: unknown }).sequentials
      if (Array.isArray(bundled)) {
        const incoming = bundled
          .map(sanitizeSequential)
          .filter((s): s is Sequential => s !== null)
        if (incoming.length > 0) {
          const existing = await sequentialStore.load()
          const merged = [
            ...existing.filter((s) => !incoming.some((i) => i.id === s.id)),
            ...incoming
          ]
          await sequentialStore.save(merged)
          importedSequentials = incoming.length
        }
      }
      // The bundle key is not part of the format set proper — don't let it
      // leak into formats.json via the renderer's auto-save.
      delete (set as FormatSet & { sequentials?: unknown }).sequentials
      return { status: 'loaded' as const, set, sequentials: importedSequentials }
    } catch {
      return { status: 'invalid' as const }
    }
  })

  ipcMain.handle('sequentials:list', () => sequentialStore.load())
  ipcMain.handle('sequentials:save', (_e, seq: Sequential) => sequentialStore.upsert(seq))
  ipcMain.handle('sequentials:delete', (_e, id: string) => sequentialStore.remove(id))

  // Dry-run: resolve with a date-seeded rng and DO NOT persist queue advances.
  ipcMain.handle(
    'formats:previewForDate',
    async (_e, { set, date }: { set: FormatSet; date: CalendarDate }) => {
      const sequentials = await sequentialStore.load()
      return resolveForDate(set, date, sequentials, seededRngForDate(date)).text
    }
  )

  ipcMain.handle(
    'formats:exportForDate',
    async (_e, { set, date }: { set: FormatSet; date: CalendarDate }) => {
      const sequentials = await sequentialStore.load()
      const { text, sequentials: advanced } = resolveForDate(set, date, sequentials)
      const stamp = `${date.year}-${String(date.month).padStart(2, '0')}-${String(
        date.day
      ).padStart(2, '0')}`
      const result = await saveText(text, `format_${stamp}.txt`)
      // Only persist the rotation advance if the file was actually written.
      if (result.saved) await sequentialStore.save(advanced)
      return result
    }
  )
  ipcMain.handle('formats:exportWeek', async (_e, set: FormatSet) =>
    saveText(serializeWeek(set), 'format_week.txt')
  )

  // True when the Formats set has anything that would emit rows — used to enable
  // the Export tab even with no audio templates / azan loaded.
  ipcMain.handle('formats:hasAssignments', async () => {
    const set = await formatStore.load()
    return gridHasAssignments(set.grid) || (set.dayDefaults ?? []).some(Boolean)
  })

  ipcMain.handle('schedule:preview', async (_e, { start, end }: RangeArg) => {
    const { byDate } = await resolveFormatLines(start, end, false)
    return session.preview(start, end, (d) => byDate.get(dateKey(d)) ?? [])
  })

  // `text`, when provided, is the (possibly edited) preview grid from the
  // renderer — it is written verbatim so what you see is exactly what exports.
  // The sequential queues still advance either way, keeping {sequential}
  // rotation continuity across exports.
  ipcMain.handle('schedule:export', async (_e, { start, end, text: edited }: RangeArg & { text?: string }) => {
    const { byDate, sequentials } = await resolveFormatLines(start, end, true)
    let text = edited
    let warnings: string[] = []
    if (text == null) {
      const res = await session.preview(start, end, (d) => byDate.get(dateKey(d)) ?? [])
      text = res.text
      warnings = res.warnings
    }
    const defaultName = `log_${start.year}-${String(start.month).padStart(2, '0')}-${String(
      start.day
    ).padStart(2, '0')}.txt`
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export log',
      defaultPath: defaultName,
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (res.canceled || !res.filePath) return { saved: false, warnings }
    await writeFile(res.filePath, encodeLogText(text))
    // Persist the advanced sequential queues only once the file is written.
    await sequentialStore.save(sequentials)
    return { saved: true, path: res.filePath, warnings }
  })

  // --- Log editor: open any exported log, edit in-app, save back as text -----
  // Opening still accepts native .bsi (read-only Access databases); saving is
  // always plain text, so the save dialog offers only .txt.
  const OPEN_LOG_FILTERS = [
    { name: 'Log files', extensions: ['txt', 'bsi'] },
    { name: 'Text', extensions: ['txt'] },
    { name: 'BSI log', extensions: ['bsi'] }
  ]

  ipcMain.handle('log:open', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open log',
      properties: ['openFile'],
      filters: OPEN_LOG_FILTERS
    })
    if (res.canceled || !res.filePaths[0]) return null
    const path = res.filePaths[0]
    const buffer = await readFile(path)
    // Native Simian logs (.bsi) are Access databases, not text — detect by
    // content, not extension, and convert to the standard pipe lines.
    if (isBsiBuffer(buffer)) {
      const { lines, durations } = parseBsiLog(buffer)
      return {
        path,
        text: lines.length ? lines.join('\r\n') + '\r\n' : '',
        rowDurations: durations,
        bsi: true
      }
    }
    return { path, text: decodeLogText(buffer) }
  })

  ipcMain.handle(
    'log:save',
    async (_e, { text, path }: { text: string; path?: string }) => {
      if (path) {
        await writeFile(path, encodeLogText(text))
        return { saved: true, path }
      }
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const res = await dialog.showSaveDialog(win!, {
        title: 'Save log',
        defaultPath: 'log.txt',
        filters: [{ name: 'Text', extensions: ['txt'] }]
      })
      if (res.canceled || !res.filePath) return { saved: false }
      await writeFile(res.filePath, encodeLogText(text))
      return { saved: true, path: res.filePath }
    }
  )

  // --- Simian audio database (Access .mdb): file-name → duration lookups -----
  let simianDb: { path: string; db: SimianDb } | null = null
  const simianSummary = (): { path: string; table: string; trackCount: number } | null =>
    simianDb && {
      path: simianDb.path,
      table: simianDb.db.table,
      trackCount: simianDb.db.tracks.size
    }

  ipcMain.handle('simian:openDb', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open Simian audio database',
      properties: ['openFile'],
      filters: [{ name: 'Access database', extensions: ['mdb', 'accdb'] }]
    })
    if (res.canceled || !res.filePaths[0]) return simianSummary()
    const path = res.filePaths[0]
    simianDb = { path, db: loadSimianDb(await readFile(path)) }
    return simianSummary()
  })

  ipcMain.handle('simian:getDb', () => simianSummary())

  // Batch lookup: names → seconds (missing/comment names simply come back 0).
  ipcMain.handle('simian:durations', (_e, names: string[]) => {
    const out: Record<string, number> = {}
    if (!simianDb) return out
    for (const name of names) {
      const hit = lookupDuration(simianDb.db.tracks, name)
      if (hit != null) out[name] = hit
    }
    return out
  })

  // Batch lookup: names → duration + library description (names the DB doesn't
  // know are simply absent from the result).
  ipcMain.handle('simian:tracks', (_e, names: string[]) => {
    const out: Record<string, { duration?: number; description?: string }> = {}
    if (!simianDb) return out
    for (const name of names) {
      const duration = lookupDuration(simianDb.db.tracks, name)
      const description = lookupTrack(simianDb.db.descriptions, name)
      if (duration != null || description != null) {
        out[name] = {
          ...(duration != null ? { duration } : {}),
          ...(description != null ? { description } : {})
        }
      }
    }
    return out
  })
}
