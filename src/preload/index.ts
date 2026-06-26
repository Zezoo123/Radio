import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, AthanMode, AzanSummary, TemplateSummary } from '../main/session'
import type { HourlyOptions } from '../main/core/schedule/hourly'
import type { FormatSet } from '../main/core/format/types'
import type { Sequential } from '../main/core/sequential/types'
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
  addTemplates: (): Promise<TemplateSummary[]> => ipcRenderer.invoke('templates:add'),
  removeTemplate: (index: number): Promise<TemplateSummary[]> =>
    ipcRenderer.invoke('templates:remove', index),
  listTemplates: (): Promise<TemplateSummary[]> => ipcRenderer.invoke('templates:list'),
  setTemplateCategory: (index: number, category: string): Promise<TemplateSummary[]> =>
    ipcRenderer.invoke('templates:setCategory', { index, category }),
  previewTemplate: (
    index: number,
    start: CalendarDate,
    end: CalendarDate
  ): Promise<PreviewResult> => ipcRenderer.invoke('templates:preview', { index, start, end }),

  openAzan: (): Promise<AzanSummary | null> => ipcRenderer.invoke('azan:open'),

  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setAthanMode: (mode: AthanMode): Promise<AppConfig> =>
    ipcRenderer.invoke('config:setAthanMode', mode),
  setHourly: (hourly: HourlyOptions): Promise<AppConfig> =>
    ipcRenderer.invoke('config:setHourly', hourly),

  loadFormats: (): Promise<FormatSet> => ipcRenderer.invoke('formats:load'),
  saveFormats: (set: FormatSet): Promise<void> => ipcRenderer.invoke('formats:save', set),
  saveFormatFile: (set: FormatSet): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('formats:saveToFile', set),
  loadFormatFile: (): Promise<{ status: 'loaded' | 'cancelled' | 'invalid'; set?: FormatSet }> =>
    ipcRenderer.invoke('formats:loadFromFile'),
  exportFormatForDate: (
    set: FormatSet,
    date: CalendarDate
  ): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('formats:exportForDate', { set, date }),
  exportFormatWeek: (set: FormatSet): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('formats:exportWeek', set),
  previewFormatForDate: (set: FormatSet, date: CalendarDate): Promise<string> =>
    ipcRenderer.invoke('formats:previewForDate', { set, date }),

  listSequentials: (): Promise<Sequential[]> => ipcRenderer.invoke('sequentials:list'),
  saveSequential: (seq: Sequential): Promise<Sequential[]> =>
    ipcRenderer.invoke('sequentials:save', seq),
  deleteSequential: (id: string): Promise<Sequential[]> =>
    ipcRenderer.invoke('sequentials:delete', id),

  hasFormats: (): Promise<boolean> => ipcRenderer.invoke('formats:hasAssignments'),
  preview: (start: CalendarDate, end: CalendarDate): Promise<PreviewResult> =>
    ipcRenderer.invoke('schedule:preview', { start, end }),
  exportLog: (start: CalendarDate, end: CalendarDate): Promise<ExportResult> =>
    ipcRenderer.invoke('schedule:export', { start, end })
}

contextBridge.exposeInMainWorld('api', api)

export type RadioApi = typeof api
