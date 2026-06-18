import { contextBridge, ipcRenderer } from 'electron'
import type { GridSummary, TemplateSummary } from '../main/session'
import type { ProgramMap } from '../main/core/programMap'
import type { CalendarDate } from '../main/core/types'

export interface ExportResult {
  saved: boolean
  path?: string
  warnings: string[]
}

export interface PreviewResult {
  text: string
  warnings: string[]
}

/** Typed bridge exposed to the renderer as `window.api`. */
const api = {
  openGrid: (): Promise<GridSummary | null> => ipcRenderer.invoke('grid:open'),
  selectGridSheet: (sheet: string): Promise<GridSummary> =>
    ipcRenderer.invoke('grid:selectSheet', sheet),

  addTemplates: (): Promise<TemplateSummary[]> => ipcRenderer.invoke('templates:add'),
  removeTemplate: (index: number): Promise<TemplateSummary[]> =>
    ipcRenderer.invoke('templates:remove', index),
  listTemplates: (): Promise<TemplateSummary[]> => ipcRenderer.invoke('templates:list'),

  loadProgramMap: (): Promise<ProgramMap> => ipcRenderer.invoke('programMap:load'),
  saveProgramMap: (map: ProgramMap): Promise<void> => ipcRenderer.invoke('programMap:save', map),

  preview: (start: CalendarDate, end: CalendarDate): Promise<PreviewResult> =>
    ipcRenderer.invoke('schedule:preview', { start, end }),
  exportLog: (start: CalendarDate, end: CalendarDate): Promise<ExportResult> =>
    ipcRenderer.invoke('schedule:export', { start, end })
}

contextBridge.exposeInMainWorld('api', api)

export type RadioApi = typeof api
