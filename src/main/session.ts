import { basename } from 'node:path'
import { parseElementTemplate, type ElementTemplate } from './core/parsers/elementTemplate'
import { parsePromosFile, type PromoEntry } from './core/parsers/promosFile'
import { computeAzanLines, type AzanFormat } from './core/prayer/azanRows'
import { azanFormatStore } from './azanFormat'
import { DEFAULT_HOURLY, type HourlyOptions } from './core/schedule/hourly'
import { composeRange, exportRange, type ComposeOptions } from './core/schedule/compose'
import { dateRange } from './core/dates'
import { eventLine } from './core/export/simian'
import {
  dateKey,
  placementsForDate,
  placementsForWeek,
  promoEventsForDate,
  weekStartFor,
  type PromoPlacement,
  type PromoWeekRow
} from './core/promos/schedule'
import { promosStore, type PromosFile } from './promos'
import { getActiveStation, type Station } from './station'
import type { CalendarDate } from './core/types'

/** Lightweight summaries that cross IPC (the heavy parsed objects stay here). */
export interface TemplateSummary {
  fileName: string
  group: string
  code: string
  timeCount: number
  category: string
  /** Earliest/latest date the template covers, `YYYY-MM-DD` (null if empty). */
  firstDate: string | null
  lastDate: string | null
}

export interface PromoSummary {
  fileName: string
  programCount: number
}

export interface AppConfig {
  hourly: HourlyOptions
  /** Include the computed azan (per the global AZAN format) in the export. */
  includeAzan: boolean
  hasPromos: boolean
  includePromos: boolean
}

interface LoadedTemplate {
  fileName: string
  template: ElementTemplate
}

/** All in-memory session state for one station (imports live only in memory). */
interface StationState {
  templates: LoadedTemplate[]
  hourly: HourlyOptions
  includeAzan: boolean
  promos: PromosFile | null
  includePromos: boolean
}

function freshState(): StationState {
  return {
    templates: [],
    hourly: { ...DEFAULT_HOURLY },
    includeAzan: false,
    promos: null,
    includePromos: true
  }
}

/**
 * In-memory session state, kept separately per station so each station keeps its
 * own imports/azan/promos while the app runs. The persisted stores (formats,
 * sequentials, promos) are already scoped to the active station's directory.
 */
class Session {
  private states = new Map<Station, StationState>()

  /** State for the active station, created on first access. */
  private st(): StationState {
    const station = getActiveStation()
    if (!station) throw new Error('No station selected')
    let s = this.states.get(station)
    if (!s) {
      s = freshState()
      this.states.set(station, s)
    }
    return s
  }

  /** Import element templates as "audio": every event gets the AUDIO category. */
  async addTemplates(filePaths: string[]): Promise<TemplateSummary[]> {
    for (const filePath of filePaths) {
      const template = await parseElementTemplate(filePath)
      template.category = 'AUDIO'
      this.st().templates.push({ fileName: basename(filePath), template })
    }
    return this.templateSummaries()
  }

  removeTemplate(index: number): TemplateSummary[] {
    this.st().templates.splice(index, 1)
    return this.templateSummaries()
  }

  /** Change the Simian Category emitted for one template's events. */
  setTemplateCategory(index: number, category: string): TemplateSummary[] {
    const t = this.st().templates[index]
    if (t) t.template.category = category
    return this.templateSummaries()
  }

  /** Compose ONLY one template over a date range — for a per-template preview. */
  previewTemplate(
    index: number,
    start: CalendarDate,
    end: CalendarDate
  ): { text: string; warnings: string[] } {
    const t = this.st().templates[index]
    if (!t) return { text: '', warnings: [] }
    return exportRange(start, end, { templates: [t.template] })
  }

  templateSummaries(): TemplateSummary[] {
    return this.st().templates.map(({ fileName, template }) => {
      const cols = [...template.dayColumns].sort(
        (a, b) => a.year - b.year || a.month - b.month || a.day - b.day
      )
      const iso = (c: { year: number; month: number; day: number }): string =>
        `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`
      return {
        fileName,
        group: template.group,
        code: template.code,
        timeCount: template.timeRows.length,
        category: template.category ?? '',
        firstDate: cols.length ? iso(cols[0]) : null,
        lastDate: cols.length ? iso(cols[cols.length - 1]) : null
      }
    })
  }

  getConfig(): AppConfig {
    const st = this.st()
    return {
      hourly: st.hourly,
      includeAzan: st.includeAzan,
      hasPromos: (st.promos?.set.entries.length ?? 0) > 0,
      includePromos: st.includePromos
    }
  }

  setIncludePromos(include: boolean): AppConfig {
    this.st().includePromos = include
    return this.getConfig()
  }

  setIncludeAzan(include: boolean): AppConfig {
    this.st().includeAzan = include
    return this.getConfig()
  }

  setHourly(hourly: HourlyOptions): AppConfig {
    this.st().hourly = hourly
    return this.getConfig()
  }

  // --- Promos ---------------------------------------------------------------

  /** Lazy-load the persisted promo set + overrides on first use. */
  private async ensurePromos(): Promise<PromosFile> {
    const st = this.st()
    if (!st.promos) st.promos = await promosStore.load()
    return st.promos
  }

  private promoSummary(): PromoSummary | null {
    const { promos } = this.st()
    if (!promos || promos.set.entries.length === 0) return null
    return { fileName: promos.fileName ?? '', programCount: promos.set.entries.length }
  }

  async loadPromos(filePath: string): Promise<PromoSummary | null> {
    const set = await parsePromosFile(filePath)
    this.st().promos = { fileName: basename(filePath), set, overrides: {}, exclusions: {} }
    await promosStore.save(this.st().promos!)
    return this.promoSummary()
  }

  async getPromos(): Promise<PromoSummary | null> {
    await this.ensurePromos()
    return this.promoSummary()
  }

  /** All parsed promo programs — feeds the Promos info table (weekly grid etc.). */
  async promoEntries(): Promise<PromoEntry[]> {
    return (await this.ensurePromos()).set.entries
  }

  async removePromos(): Promise<PromoSummary | null> {
    this.st().promos = { fileName: null, set: { entries: [] }, overrides: {}, exclusions: {} }
    await promosStore.save(this.st().promos!)
    return this.promoSummary()
  }

  /** Per-program placement for the whole week containing `anchor` (Sun..Sat). */
  async promoWeek(anchor: CalendarDate): Promise<PromoWeekRow[]> {
    const file = await this.ensurePromos()
    return placementsForWeek(file.set, weekStartFor(anchor), file.overrides, file.exclusions)
  }

  /**
   * The promo Simian rows for one date (all promo files), as preview text.
   * Grouped per promo (not chronological) so each program's spots read together;
   * the export itself stays time-sorted.
   */
  async promoTextForDate(date: CalendarDate): Promise<string> {
    const file = await this.ensurePromos()
    const { events } = promoEventsForDate(file.set, date, {
      overrides: file.overrides,
      exclusions: file.exclusions,
      sort: 'promo'
    })
    return events.map(eventLine).join('\r\n')
  }

  /**
   * Set (or clear) the hours a program's promos may never use on one weekday
   * (0 = Sun … 6 = Sat). Re-rolls that weekday's auto times. Returns the refreshed
   * week containing `anchor`.
   */
  async setPromoExcludedHours(
    fileName: string,
    weekday: number,
    hours: number[],
    anchor: CalendarDate
  ): Promise<PromoWeekRow[]> {
    const file = await this.ensurePromos()
    const clean = [...new Set(hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort(
      (a, b) => a - b
    )
    const week = file.exclusions[fileName] ?? Array.from({ length: 7 }, () => [] as number[])
    if (weekday >= 0 && weekday <= 6) week[weekday] = clean
    if (week.every((d) => d.length === 0)) delete file.exclusions[fileName]
    else file.exclusions[fileName] = week
    await promosStore.save(file)
    return placementsForWeek(file.set, weekStartFor(anchor), file.overrides, file.exclusions)
  }

  /** Save (or clear, when `times` is empty) a manual time override. */
  async setPromoTimes(
    fileName: string,
    date: CalendarDate,
    times: string[]
  ): Promise<PromoPlacement[]> {
    const file = await this.ensurePromos()
    const key = dateKey(date)
    const clean = times.map((t) => t.trim()).filter(Boolean)
    if (clean.length === 0) {
      delete file.overrides[fileName]?.[key]
      if (file.overrides[fileName] && Object.keys(file.overrides[fileName]).length === 0) {
        delete file.overrides[fileName]
      }
    } else {
      ;(file.overrides[fileName] ??= {})[key] = clean
    }
    await promosStore.save(file)
    return placementsForDate(file.set, date, file.overrides, file.exclusions)
  }

  /** Drop a manual override so the date falls back to the auto schedule. */
  async resetPromoTimes(fileName: string, date: CalendarDate): Promise<PromoPlacement[]> {
    return this.setPromoTimes(fileName, date, [])
  }

  /**
   * Promo rows per date for export composition. Drops unrecorded promos (and
   * warns); empty when promos are disabled or none are loaded.
   */
  private promoLines(
    start: CalendarDate,
    end: CalendarDate
  ): { byDate: Map<string, string[]>; warnings: string[] } {
    const byDate = new Map<string, string[]>()
    const warnings: string[] = []
    const { promos: file, includePromos } = this.st()
    if (!includePromos || !file || file.set.entries.length === 0) return { byDate, warnings }
    for (const date of dateRange(start, end)) {
      const { events, warnings: w } = promoEventsForDate(file.set, date, {
        overrides: file.overrides,
        exclusions: file.exclusions
      })
      warnings.push(...w)
      if (events.length) byDate.set(dateKey(date), events.map(eventLine))
    }
    return { byDate, warnings }
  }

  private composeOptions(
    formatLinesForDate?: (date: CalendarDate) => string[],
    promoLinesForDate?: (date: CalendarDate) => string[],
    azanFormat?: AzanFormat
  ): ComposeOptions {
    const st = this.st()
    const azanLinesForDate =
      st.includeAzan && azanFormat ? (date: CalendarDate) => computeAzanLines(date, azanFormat) : undefined
    return {
      templates: st.templates.map((t) => t.template),
      azanLinesForDate,
      formatLinesForDate,
      promoLinesForDate,
      hourly: st.hourly
    }
  }

  /**
   * Compose the schedule for a range. `formatLinesForDate` (the resolved Formats
   * clock rows per day) is injected by the caller, which owns the Formats set and
   * the sequential queues. The computed azan (per the global AZAN format) is
   * included when this station has "include azan" on.
   */
  async preview(
    start: CalendarDate,
    end: CalendarDate,
    formatLinesForDate?: (date: CalendarDate) => string[]
  ): Promise<{ text: string; warnings: string[] }> {
    await this.ensurePromos()
    const azanFormat = this.st().includeAzan ? await azanFormatStore.load() : undefined
    const promo = this.promoLines(start, end)
    const opts = this.composeOptions(
      formatLinesForDate,
      (d) => promo.byDate.get(dateKey(d)) ?? [],
      azanFormat
    )
    const { text, warnings } = exportRange(start, end, opts)
    return { text, warnings: [...warnings, ...promo.warnings] }
  }

  dayCount(start: CalendarDate, end: CalendarDate): number {
    return composeRange(start, end, this.composeOptions()).days.length
  }
}

export const session = new Session()
