import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, PromoSummary, TemplateSummary } from '../main/session'
import type { HourlyOptions } from '../main/core/schedule/hourly'
import type { AzanFormat } from '../main/core/prayer/azanRows'
import type { UiSettings } from '../main/uiSettings'
import type { FormatSet } from '../main/core/format/types'
import type { Sequential } from '../main/core/sequential/types'
import type { PromoPlacement, PromoWeekRow } from '../main/core/promos/schedule'
import type { PromoEntry } from '../main/core/parsers/promosFile'
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

export interface SimianDbSummary {
  path: string
  table: string
  trackCount: number
}

export interface OpenLogResult {
  path: string
  text: string
  /** Per-line durations in seconds (native .bsi logs carry their own lengths). */
  rowDurations?: number[]
  /** True when the file was a native Access-format .bsi log. */
  bsi?: boolean
}

/** Typed bridge exposed to the renderer as `window.api`. */
const api = {
  listStations: (): Promise<string[]> => ipcRenderer.invoke('station:list'),
  getStation: (): Promise<string | null> => ipcRenderer.invoke('station:get'),
  setStation: (station: string): Promise<string | null> =>
    ipcRenderer.invoke('station:set', station),

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

  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setHourly: (hourly: HourlyOptions): Promise<AppConfig> =>
    ipcRenderer.invoke('config:setHourly', hourly),
  setIncludeAzan: (include: boolean): Promise<AppConfig> =>
    ipcRenderer.invoke('config:setIncludeAzan', include),
  setIncludePromos: (include: boolean): Promise<AppConfig> =>
    ipcRenderer.invoke('config:setIncludePromos', include),

  getUiSettings: (): Promise<UiSettings> => ipcRenderer.invoke('uiSettings:get'),
  saveUiSettings: (settings: UiSettings): Promise<UiSettings> =>
    ipcRenderer.invoke('uiSettings:save', settings),

  getAzanFormat: (): Promise<AzanFormat> => ipcRenderer.invoke('azanFormat:get'),
  saveAzanFormat: (format: AzanFormat): Promise<AzanFormat> =>
    ipcRenderer.invoke('azanFormat:save', format),

  openPromos: (): Promise<PromoSummary | null> => ipcRenderer.invoke('promos:open'),
  getPromos: (): Promise<PromoSummary | null> => ipcRenderer.invoke('promos:get'),
  listPromoEntries: (): Promise<PromoEntry[]> => ipcRenderer.invoke('promos:entries'),
  removePromos: (): Promise<PromoSummary | null> => ipcRenderer.invoke('promos:remove'),
  promoWeek: (anchor: CalendarDate): Promise<PromoWeekRow[]> =>
    ipcRenderer.invoke('promos:week', anchor),
  promoPreviewForDate: (date: CalendarDate): Promise<string> =>
    ipcRenderer.invoke('promos:previewForDate', date),
  setPromoTimes: (
    fileName: string,
    date: CalendarDate,
    times: string[]
  ): Promise<PromoPlacement[]> =>
    ipcRenderer.invoke('promos:setTimes', { fileName, date, times }),
  resetPromoTimes: (fileName: string, date: CalendarDate): Promise<PromoPlacement[]> =>
    ipcRenderer.invoke('promos:resetTimes', { fileName, date }),
  setPromoExcludedHours: (
    fileName: string,
    weekday: number,
    hours: number[],
    anchor: CalendarDate
  ): Promise<PromoWeekRow[]> =>
    ipcRenderer.invoke('promos:setExcludedHours', { fileName, weekday, hours, anchor }),

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
  exportLog: (start: CalendarDate, end: CalendarDate, text?: string): Promise<ExportResult> =>
    ipcRenderer.invoke('schedule:export', { start, end, text }),

  openLog: (): Promise<OpenLogResult | null> => ipcRenderer.invoke('log:open'),
  saveLog: (text: string, path?: string): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('log:save', { text, path }),

  openSimianDb: (): Promise<SimianDbSummary | null> => ipcRenderer.invoke('simian:openDb'),
  getSimianDb: (): Promise<SimianDbSummary | null> => ipcRenderer.invoke('simian:getDb'),
  simianDurations: (names: string[]): Promise<Record<string, number>> =>
    ipcRenderer.invoke('simian:durations', names)
}

contextBridge.exposeInMainWorld('api', api)

export type RadioApi = typeof api
