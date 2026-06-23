import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { session, type AthanMode } from './session'
import { formatStore } from './formats'
import { serializeForDate, serializeWeek } from './core/format/expand'
import type { FormatSet } from './core/format/types'
import type { ProgramMap } from './core/programMap'
import type { HourlyOptions } from './core/schedule/hourly'
import type { CalendarDate } from './core/types'

const XLSX_FILTER = { name: 'Excel files', extensions: ['xlsx', 'xlsm'] }

interface RangeArg {
  start: CalendarDate
  end: CalendarDate
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

  ipcMain.handle('grid:open', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open station grid',
      properties: ['openFile'],
      filters: [XLSX_FILTER]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return session.loadGrid(res.filePaths[0])
  })

  ipcMain.handle('grid:selectSheet', (_e, sheet: string) => session.selectGridSheet(sheet))

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

  ipcMain.handle('azan:open', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open AZAN (athan) month file',
      properties: ['openFile'],
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return session.loadAzan(res.filePaths[0])
  })

  ipcMain.handle('config:get', () => session.getConfig())
  ipcMain.handle('config:setAthanMode', (_e, mode: AthanMode) => session.setAthanMode(mode))
  ipcMain.handle('config:setHourly', (_e, hourly: HourlyOptions) => session.setHourly(hourly))

  ipcMain.handle('programMap:load', () => session.loadProgramMap())
  ipcMain.handle('programMap:save', (_e, map: ProgramMap) => session.saveProgramMap(map))

  ipcMain.handle('formats:load', () => formatStore.load())
  ipcMain.handle('formats:save', (_e, set: FormatSet) => formatStore.save(set))

  ipcMain.handle(
    'formats:exportForDate',
    async (_e, { set, date }: { set: FormatSet; date: CalendarDate }) => {
      const stamp = `${date.year}-${String(date.month).padStart(2, '0')}-${String(
        date.day
      ).padStart(2, '0')}`
      return saveText(serializeForDate(set, date), `format_${stamp}.txt`)
    }
  )
  ipcMain.handle('formats:exportWeek', async (_e, set: FormatSet) =>
    saveText(serializeWeek(set), 'format_week.txt')
  )

  ipcMain.handle('schedule:preview', (_e, { start, end }: RangeArg) => session.preview(start, end))

  ipcMain.handle('schedule:export', async (_e, { start, end }: RangeArg) => {
    const { text, warnings } = session.preview(start, end)
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
    return { saved: true, path: res.filePath, warnings }
  })
}
