import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  parseElementTemplate,
  playedDayColumns,
  templateGrid,
  type ElementTemplate,
  type TemplateGrid
} from './core/parsers/elementTemplate'

export type { TemplateGrid }
import { parsePromosFile, type PromoEntry } from './core/parsers/promosFile'
import {
  musicLogLines,
  parseMusicLog,
  type MusicImportSettings,
  type MusicRow,
  type ParsedMusicLog
} from './core/parsers/musicLog'
import { musicImportStore } from './musicImport'
import { computeAzanLines, type AzanFormat } from './core/prayer/azanRows'
import { azanFormatStore } from './azanFormat'
import { DEFAULT_HOURLY, type HourlyOptions } from './core/schedule/hourly'
import { exportRange, type ComposeOptions } from './core/schedule/compose'
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
import { promosStore, sanitizeRules, type PromosFile, type StationRules } from './promos'
import { bookingsStore, type BookingRef } from './bookings'
import { stationConfigStore, type StationConfig } from './stationConfig'
import type { PromoRules } from './core/promos/schedule'
import { getActiveStation, type Station } from './station'
import type { CalendarDate } from './core/types'

/**
 * Where a booked element stands relative to its source spreadsheet:
 * `ok` — parsed from the file as last seen; `changed` — the file was edited
 * outside the app since the last read (re-parsed, so the edits are in);
 * `missing` — the file can't be read right now (moved, renamed, unsynced) —
 * the row and its overrides are kept until the user re-links or removes it.
 */
export type TemplateStatus = 'ok' | 'changed' | 'missing'

/** Lightweight summaries that cross IPC (the heavy parsed objects stay here). */
export interface TemplateSummary {
  fileName: string
  /** Absolute path of the source spreadsheet. */
  path: string
  status: TemplateStatus
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

export interface MusicSummary {
  fileName: string
  /** Timed audio rows / marker-comment rows, per the current import settings. */
  eventCount: number
  commentCount: number
}

export interface AppConfig {
  hourly: HourlyOptions
  /** Include the computed azan (per the global AZAN format) in the export. */
  includeAzan: boolean
  hasPromos: boolean
  includePromos: boolean
  /** Include the Formats week-grid clock rows in the export. */
  includeClocks: boolean
  /** Include the booked audio-element templates in the export. */
  includeElements: boolean
  hasMusic: boolean
  /** Include the imported Music Log in the export. */
  includeMusic: boolean
}

interface LoadedTemplate {
  fileName: string
  path: string
  /** Source-file stats when last parsed (mirrors the persisted BookingRef). */
  mtimeMs: number
  size: number
  status: TemplateStatus
  /** The user's in-app edits — reapplied over every re-parse. */
  overrides: { code?: string; category?: string }
  /** null while the source file is missing/unreadable. */
  template: ElementTemplate | null
}

/**
 * In-memory session state for one station. Imports are persisted BY REFERENCE
 * (bookings.json stores paths + overrides, never parsed data) and re-parsed
 * from their source spreadsheets on first access after launch; the LOG
 * toggles persist in config.json.
 */
interface StationState {
  templates: LoadedTemplate[]
  hourly: HourlyOptions
  includeAzan: boolean
  promos: PromosFile | null
  includePromos: boolean
  includeClocks: boolean
  includeElements: boolean
  /** Imported Music Log, kept raw so settings edits re-parse it. */
  music: { fileName: string; text: string } | null
  includeMusic: boolean
  /** Set once hydration from the persisted stores has started. */
  hydrated?: Promise<void>
}

function freshState(): StationState {
  return {
    templates: [],
    hourly: { ...DEFAULT_HOURLY },
    includeAzan: false,
    promos: null,
    includePromos: true,
    includeClocks: true,
    includeElements: true,
    music: null,
    includeMusic: true
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

  /**
   * The active station's state, hydrated from the persisted stores: the LOG
   * toggles from config.json, and every booked template re-parsed from its
   * source spreadsheet per bookings.json. Hydration runs once per station,
   * on first access after launch — the Excel files stay the source of truth,
   * so edits made outside the app are picked up here.
   */
  private async load(): Promise<StationState> {
    const s = this.st()
    if (!s.hydrated) s.hydrated = this.hydrate(s)
    await s.hydrated
    return s
  }

  private async hydrate(s: StationState): Promise<void> {
    const config = await stationConfigStore.load()
    s.hourly = config.hourly
    s.includeAzan = config.includeAzan
    s.includePromos = config.includePromos
    s.includeClocks = config.includeClocks
    s.includeElements = config.includeElements
    s.includeMusic = config.includeMusic

    const refs = await bookingsStore.load()
    s.templates = await Promise.all(refs.map((ref) => this.loadRef(ref)))
    // A re-parse of an externally-edited file refreshes the stored stats.
    if (s.templates.some((t) => t.status === 'changed')) await this.saveBookings(s)
  }

  /** Reapply the user's persisted edits over a freshly parsed template. */
  private applyOverrides(template: ElementTemplate, overrides: LoadedTemplate['overrides']): void {
    // Imports are "audio" by default: every event gets the AUDIO category.
    template.category = overrides.category ?? 'AUDIO'
    if (overrides.code) template.code = overrides.code
  }

  /** Re-parse one persisted reference; an unreadable file becomes a `missing` row. */
  private async loadRef(ref: BookingRef): Promise<LoadedTemplate> {
    const overrides = {
      ...(ref.code ? { code: ref.code } : {}),
      ...(ref.category ? { category: ref.category } : {})
    }
    try {
      const stats = await stat(ref.path)
      const template = await parseElementTemplate(ref.path)
      this.applyOverrides(template, overrides)
      const changed = stats.mtimeMs !== ref.mtimeMs || stats.size !== ref.size
      return {
        fileName: basename(ref.path),
        path: ref.path,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        status: changed ? 'changed' : 'ok',
        overrides,
        template
      }
    } catch {
      // Moved, renamed, or not synced yet — keep the row (and its overrides)
      // in a missing state until the user re-links or removes it.
      return {
        fileName: basename(ref.path),
        path: ref.path,
        mtimeMs: ref.mtimeMs,
        size: ref.size,
        status: 'missing',
        overrides,
        template: null
      }
    }
  }

  /** Write the current template references + overrides back to bookings.json. */
  private saveBookings(s: StationState): Promise<void> {
    return bookingsStore.save(
      s.templates.map(({ path, mtimeMs, size, overrides }) => ({
        path,
        mtimeMs,
        size,
        ...(overrides.code ? { code: overrides.code } : {}),
        ...(overrides.category ? { category: overrides.category } : {})
      }))
    )
  }

  /** Parse + stat a newly imported spreadsheet into a live template row. */
  private async importFile(filePath: string): Promise<LoadedTemplate> {
    const template = await parseElementTemplate(filePath)
    const overrides: LoadedTemplate['overrides'] = {}
    this.applyOverrides(template, overrides)
    const stats = await stat(filePath)
    return {
      fileName: basename(filePath),
      path: filePath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      status: 'ok',
      overrides,
      template
    }
  }

  /** Import element templates as "audio": every event gets the AUDIO category. */
  async addTemplates(filePaths: string[]): Promise<TemplateSummary[]> {
    const s = await this.load()
    for (const filePath of filePaths) {
      s.templates.push(await this.importFile(filePath))
    }
    await this.saveBookings(s)
    return this.summaries(s)
  }

  /**
   * Folder import: a directory can hold stray spreadsheets that aren't element
   * templates, so files that fail to parse are skipped (and reported) instead
   * of aborting the whole batch.
   */
  async addTemplatesLenient(
    filePaths: string[]
  ): Promise<{ templates: TemplateSummary[]; skipped: string[] }> {
    const s = await this.load()
    const skipped: string[] = []
    for (const filePath of filePaths) {
      try {
        s.templates.push(await this.importFile(filePath))
      } catch {
        skipped.push(basename(filePath))
      }
    }
    await this.saveBookings(s)
    return { templates: this.summaries(s), skipped }
  }

  async removeTemplate(index: number): Promise<TemplateSummary[]> {
    const s = await this.load()
    s.templates.splice(index, 1)
    await this.saveBookings(s)
    return this.summaries(s)
  }

  /**
   * Point a `missing` row (or any row) at a new source file: parse it, keep
   * the user's overrides, and persist the new reference.
   */
  async relinkTemplate(index: number, filePath: string): Promise<TemplateSummary[]> {
    const s = await this.load()
    const t = s.templates[index]
    if (!t) return this.summaries(s)
    const template = await parseElementTemplate(filePath)
    this.applyOverrides(template, t.overrides)
    const stats = await stat(filePath)
    s.templates[index] = {
      ...t,
      fileName: basename(filePath),
      path: filePath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      status: 'ok',
      template
    }
    await this.saveBookings(s)
    return this.summaries(s)
  }

  /** Change the Simian Category emitted for one template's events. */
  async setTemplateCategory(index: number, category: string): Promise<TemplateSummary[]> {
    const s = await this.load()
    const t = s.templates[index]
    if (t) {
      t.overrides.category = category
      if (t.template) t.template.category = category
      await this.saveBookings(s)
    }
    return this.summaries(s)
  }

  /**
   * Rename a template's element code. Every emitted file name derives from it
   * at compose time (`CODE`, `CODE-A`, …), so previews and exports pick the new
   * name up immediately. Empty input is ignored.
   */
  async setTemplateCode(index: number, code: string): Promise<TemplateSummary[]> {
    const s = await this.load()
    const t = s.templates[index]
    const clean = code.trim()
    if (t && clean) {
      t.overrides.code = clean
      if (t.template) t.template.code = clean
      await this.saveBookings(s)
    }
    return this.summaries(s)
  }

  /** The dates × times matrix for one template (the Import grid preview). */
  async templateGrid(index: number): Promise<TemplateGrid | null> {
    const t = (await this.load()).templates[index]
    return t?.template ? templateGrid(t.template) : null
  }

  /** Compose ONLY one template over a date range — for a per-template preview. */
  async previewTemplate(
    index: number,
    start: CalendarDate,
    end: CalendarDate
  ): Promise<{ text: string; warnings: string[] }> {
    const t = (await this.load()).templates[index]
    if (!t?.template) return { text: '', warnings: [] }
    return exportRange(start, end, { templates: [t.template] })
  }

  async templateSummaries(): Promise<TemplateSummary[]> {
    return this.summaries(await this.load())
  }

  private summaries(s: StationState): TemplateSummary[] {
    return s.templates.map(({ fileName, path, status, overrides, template }) => {
      if (!template) {
        // Missing file: only the reference + overrides are known (parsed data
        // is never persisted), so the row shows what the user last set.
        return {
          fileName,
          path,
          status,
          group: '',
          code: overrides.code ?? '',
          timeCount: 0,
          category: overrides.category ?? '',
          firstDate: null,
          lastDate: null
        }
      }
      // Covers = the span the element actually plays, not the sheet's full
      // column range (templates often pad a short campaign with empty months).
      const cols = playedDayColumns(template)
      const iso = (c: { year: number; month: number; day: number }): string =>
        `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`
      return {
        fileName,
        path,
        status,
        group: template.group,
        code: template.code,
        timeCount: template.timeRows.length,
        category: template.category ?? '',
        firstDate: cols.length ? iso(cols[0]) : null,
        lastDate: cols.length ? iso(cols[cols.length - 1]) : null
      }
    })
  }

  private configOf(s: StationState): AppConfig {
    return {
      hourly: s.hourly,
      includeAzan: s.includeAzan,
      hasPromos: (s.promos?.set.entries.length ?? 0) > 0,
      includePromos: s.includePromos,
      includeClocks: s.includeClocks,
      includeElements: s.includeElements,
      hasMusic: s.music !== null,
      includeMusic: s.includeMusic
    }
  }

  async getConfig(): Promise<AppConfig> {
    return this.configOf(await this.load())
  }

  /** Persist the LOG toggles so they survive restarts (per station). */
  private saveConfig(s: StationState): Promise<void> {
    const config: StationConfig = {
      hourly: s.hourly,
      includeAzan: s.includeAzan,
      includePromos: s.includePromos,
      includeClocks: s.includeClocks,
      includeElements: s.includeElements,
      includeMusic: s.includeMusic
    }
    return stationConfigStore.save(config)
  }

  private async setToggle(patch: (s: StationState) => void): Promise<AppConfig> {
    const s = await this.load()
    patch(s)
    await this.saveConfig(s)
    return this.configOf(s)
  }

  setIncludePromos(include: boolean): Promise<AppConfig> {
    return this.setToggle((s) => (s.includePromos = include))
  }

  setIncludeMusic(include: boolean): Promise<AppConfig> {
    return this.setToggle((s) => (s.includeMusic = include))
  }

  setIncludeClocks(include: boolean): Promise<AppConfig> {
    return this.setToggle((s) => (s.includeClocks = include))
  }

  setIncludeElements(include: boolean): Promise<AppConfig> {
    return this.setToggle((s) => (s.includeElements = include))
  }

  setIncludeAzan(include: boolean): Promise<AppConfig> {
    return this.setToggle((s) => (s.includeAzan = include))
  }

  setHourly(hourly: HourlyOptions): Promise<AppConfig> {
    return this.setToggle((s) => (s.hourly = hourly))
  }

  // --- Music Log ------------------------------------------------------------

  /** Parse the loaded music log with the current (or given) import settings. */
  private async parsedMusic(settings?: MusicImportSettings): Promise<ParsedMusicLog | null> {
    const { music } = this.st()
    if (!music) return null
    return parseMusicLog(music.text, settings ?? (await musicImportStore.load()))
  }

  private async musicSummaryOf(): Promise<MusicSummary | null> {
    const { music } = this.st()
    const parsed = await this.parsedMusic()
    if (!music || !parsed) return null
    return {
      fileName: music.fileName,
      eventCount: parsed.eventCount,
      commentCount: parsed.commentCount
    }
  }

  /** Store a decoded music log (the raw text; parsing follows the settings). */
  async loadMusicLog(fileName: string, text: string): Promise<MusicSummary | null> {
    this.st().music = { fileName, text }
    return this.musicSummaryOf()
  }

  async getMusicLog(): Promise<MusicSummary | null> {
    return this.musicSummaryOf()
  }

  removeMusicLog(): null {
    this.st().music = null
    return null
  }

  /**
   * The first rows of the loaded log parsed with `settings` (unsaved edits from
   * the import-settings dialog) or the persisted settings — the dialog's Test
   * table, like Simian's own Test button.
   */
  async musicPreviewRows(limit: number, settings?: MusicImportSettings): Promise<MusicRow[]> {
    const parsed = await this.parsedMusic(settings)
    return parsed ? parsed.rows.slice(0, Math.max(0, limit)) : []
  }

  /** The music log as pipe lines, or null when excluded or not loaded. */
  private async musicLines(): Promise<string[] | null> {
    if (!this.st().includeMusic) return null
    const parsed = await this.parsedMusic()
    return parsed ? musicLogLines(parsed) : null
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
    // Rules (blackout hours + breaks) are station properties — keep them when
    // the promo spreadsheet is replaced.
    const rules = (await this.ensurePromos()).rules
    this.st().promos = { fileName: basename(filePath), set, overrides: {}, exclusions: {}, rules }
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
    const rules = (await this.ensurePromos()).rules
    this.st().promos = {
      fileName: null,
      set: { entries: [] },
      overrides: {},
      exclusions: {},
      rules
    }
    await promosStore.save(this.st().promos!)
    return this.promoSummary()
  }

  /** Station-wide promo rules: blackout hours + break minutes. */
  async promoRules(): Promise<StationRules> {
    return (await this.ensurePromos()).rules
  }

  async setPromoRules(rules: Partial<PromoRules>): Promise<StationRules> {
    const file = await this.ensurePromos()
    file.rules = sanitizeRules(rules)
    await promosStore.save(file)
    return file.rules
  }

  /** Per-program placement for the whole week containing `anchor` (Sun..Sat). */
  async promoWeek(anchor: CalendarDate): Promise<PromoWeekRow[]> {
    const file = await this.ensurePromos()
    return placementsForWeek(
      file.set,
      weekStartFor(anchor),
      file.overrides,
      file.exclusions,
      file.rules
    )
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
      rules: file.rules,
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
    return placementsForWeek(
      file.set,
      weekStartFor(anchor),
      file.overrides,
      file.exclusions,
      file.rules
    )
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
    return placementsForDate(file.set, date, file.overrides, file.exclusions, file.rules)
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
        exclusions: file.exclusions,
        rules: file.rules
      })
      warnings.push(...w)
      if (events.length) byDate.set(dateKey(date), events.map(eventLine))
    }
    return { byDate, warnings }
  }

  private composeOptions(
    formatLinesForDate?: (date: CalendarDate) => string[],
    promoLinesForDate?: (date: CalendarDate) => string[],
    azanFormat?: AzanFormat,
    musicLines?: string[] | null
  ): ComposeOptions {
    const st = this.st()
    const azanLinesForDate =
      st.includeAzan && azanFormat
        ? (date: CalendarDate) => computeAzanLines(date, azanFormat)
        : undefined
    return {
      // Missing-file rows have nothing parsed to contribute — they are
      // skipped here and surfaced as warnings by preview().
      templates: st.includeElements
        ? st.templates.flatMap((t) => (t.template ? [t.template] : []))
        : [],
      azanLinesForDate,
      formatLinesForDate: st.includeClocks ? formatLinesForDate : undefined,
      promoLinesForDate,
      // The music log carries times but no dates — it applies to every day
      // of the composed range.
      musicLinesForDate: musicLines?.length ? () => musicLines : undefined,
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
    const s = await this.load()
    await this.ensurePromos()
    const azanFormat = s.includeAzan ? await azanFormatStore.load() : undefined
    const promo = this.promoLines(start, end)
    const opts = this.composeOptions(
      formatLinesForDate,
      (d) => promo.byDate.get(dateKey(d)) ?? [],
      azanFormat,
      await this.musicLines()
    )
    const missing = s.includeElements
      ? s.templates
          .filter((t) => !t.template)
          .map(
            (t) =>
              `Booking element "${t.overrides.code || t.fileName}" not included — source file missing (${t.path})`
          )
      : []
    const { text, warnings } = exportRange(start, end, opts)
    return { text, warnings: [...missing, ...warnings, ...promo.warnings] }
  }
}

export const session = new Session()
