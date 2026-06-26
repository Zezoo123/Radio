import { basename } from 'node:path'
import { parseElementTemplate, type ElementTemplate } from './core/parsers/elementTemplate'
import { athanLinesForDate, parseAzanFile, type AzanFile } from './core/parsers/azanFile'
import { computeAthanLines } from './core/prayer/athanRows'
import { DEFAULT_HOURLY, type HourlyOptions } from './core/schedule/hourly'
import { composeRange, exportRange, type ComposeOptions } from './core/schedule/compose'
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

export interface AzanSummary {
  fileName: string
  months: string[]
  dayCount: number
}

export type AthanMode = 'off' | 'import' | 'calculate'

export interface AppConfig {
  athanMode: AthanMode
  hourly: HourlyOptions
  hasAzan: boolean
}

interface LoadedTemplate {
  fileName: string
  template: ElementTemplate
}

/** In-memory session state for the main process. */
class Session {
  private templates: LoadedTemplate[] = []
  private azan: { fileName: string; file: AzanFile } | null = null
  private athanMode: AthanMode = 'off'
  private hourly: HourlyOptions = { ...DEFAULT_HOURLY }

  /** Import element templates as "audio": every event gets the AUDIO category. */
  async addTemplates(filePaths: string[]): Promise<TemplateSummary[]> {
    for (const filePath of filePaths) {
      const template = await parseElementTemplate(filePath)
      template.category = 'AUDIO'
      this.templates.push({ fileName: basename(filePath), template })
    }
    return this.templateSummaries()
  }

  removeTemplate(index: number): TemplateSummary[] {
    this.templates.splice(index, 1)
    return this.templateSummaries()
  }

  /** Change the Simian Category emitted for one template's events. */
  setTemplateCategory(index: number, category: string): TemplateSummary[] {
    const t = this.templates[index]
    if (t) t.template.category = category
    return this.templateSummaries()
  }

  /** Compose ONLY one template over a date range — for a per-template preview. */
  previewTemplate(
    index: number,
    start: CalendarDate,
    end: CalendarDate
  ): { text: string; warnings: string[] } {
    const t = this.templates[index]
    if (!t) return { text: '', warnings: [] }
    return exportRange(start, end, { templates: [t.template] })
  }

  templateSummaries(): TemplateSummary[] {
    return this.templates.map(({ fileName, template }) => {
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

  async loadAzan(filePath: string): Promise<AzanSummary> {
    const file = await parseAzanFile(filePath)
    this.azan = { fileName: basename(filePath), file }
    if (this.athanMode === 'off') this.athanMode = 'import'
    return this.azanSummary()
  }

  getConfig(): AppConfig {
    return { athanMode: this.athanMode, hourly: this.hourly, hasAzan: Boolean(this.azan) }
  }

  setAthanMode(mode: AthanMode): AppConfig {
    this.athanMode = mode
    return this.getConfig()
  }

  setHourly(hourly: HourlyOptions): AppConfig {
    this.hourly = hourly
    return this.getConfig()
  }

  private azanSummary(): AzanSummary {
    if (!this.azan) throw new Error('No AZAN file loaded')
    return {
      fileName: this.azan.fileName,
      months: this.azan.file.months.map(
        (m) => `${m.year}-${String(m.month).padStart(2, '0')}`
      ),
      dayCount: this.azan.file.byDay.size
    }
  }

  private composeOptions(
    formatLinesForDate?: (date: CalendarDate) => string[]
  ): ComposeOptions {
    const azan = this.azan
    let athanSource: ComposeOptions['athanLinesForDate']
    if (this.athanMode === 'import' && azan) {
      athanSource = (date) => athanLinesForDate(azan.file, date)
    } else if (this.athanMode === 'calculate') {
      athanSource = (date) => computeAthanLines(date)
    }
    return {
      templates: this.templates.map((t) => t.template),
      athanLinesForDate: athanSource,
      athanCategory: 'ATHAN',
      formatLinesForDate,
      hourly: this.hourly
    }
  }

  /**
   * Compose the schedule for a range. `formatLinesForDate` (the resolved Formats
   * clock rows per day) is injected by the caller, which owns the Formats set and
   * the sequential queues.
   */
  preview(
    start: CalendarDate,
    end: CalendarDate,
    formatLinesForDate?: (date: CalendarDate) => string[]
  ): { text: string; warnings: string[] } {
    return exportRange(start, end, this.composeOptions(formatLinesForDate))
  }

  dayCount(start: CalendarDate, end: CalendarDate): number {
    return composeRange(start, end, this.composeOptions()).days.length
  }
}

export const session = new Session()
