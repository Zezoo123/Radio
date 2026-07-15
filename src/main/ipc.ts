import { readFile, writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { session } from './session'
import { azanFormatStore } from './azanFormat'
import { uiSettingsStore, type UiSettings } from './uiSettings'
import { formatStore, normalizeFormatSet } from './formats'
import { gridHasAssignments, serializeWeek } from './core/format/expand'
import { resolveForDate, seededRngForDate } from './core/format/resolveDay'
import { sequentialStore } from './sequentials'
import { loadSimianDb, lookupDuration, type SimianDb } from './core/simianDb'
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
  await writeFile(res.filePath, text, 'utf-8')
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
    await writeFile(res.filePath, JSON.stringify(set, null, 2), 'utf-8')
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
      return set ? { status: 'loaded' as const, set } : { status: 'invalid' as const }
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
      title: 'Export Simian log',
      defaultPath: defaultName,
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (res.canceled || !res.filePath) return { saved: false, warnings }
    await writeFile(res.filePath, text, 'utf-8')
    // Persist the advanced sequential queues only once the file is written.
    await sequentialStore.save(sequentials)
    return { saved: true, path: res.filePath, warnings }
  })

  // --- Log editor: open any exported Simian log, edit in-app, save back ------
  const LOG_FILTERS = [
    { name: 'Simian log', extensions: ['txt', 'bsi'] },
    { name: 'Text', extensions: ['txt'] },
    { name: 'BSI log', extensions: ['bsi'] }
  ]

  ipcMain.handle('log:open', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open Simian log',
      properties: ['openFile'],
      filters: LOG_FILTERS
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
    return { path, text: buffer.toString('utf-8') }
  })

  ipcMain.handle(
    'log:save',
    async (_e, { text, path }: { text: string; path?: string }) => {
      if (path) {
        await writeFile(path, text, 'utf-8')
        return { saved: true, path }
      }
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const res = await dialog.showSaveDialog(win!, {
        title: 'Save Simian log',
        defaultPath: 'log.txt',
        filters: LOG_FILTERS
      })
      if (res.canceled || !res.filePath) return { saved: false }
      await writeFile(res.filePath, text, 'utf-8')
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
}
