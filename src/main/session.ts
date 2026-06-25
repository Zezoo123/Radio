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

  async addTemplates(filePaths: string[]): Promise<TemplateSummary[]> {
    for (const filePath of filePaths) {
      const template = await parseElementTemplate(filePath)
      this.templates.push({ fileName: basename(filePath), template })
    }
    return this.templateSummaries()
  }

  removeTemplate(index: number): TemplateSummary[] {
    this.templates.splice(index, 1)
    return this.templateSummaries()
  }

  templateSummaries(): TemplateSummary[] {
    return this.templates.map(({ fileName, template }) => ({
      fileName,
      group: template.group,
      code: template.code,
      timeCount: template.timeRows.length
    }))
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

  private composeOptions(): ComposeOptions {
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
      hourly: this.hourly
    }
  }

  preview(start: CalendarDate, end: CalendarDate): { text: string; warnings: string[] } {
    return exportRange(start, end, this.composeOptions())
  }

  dayCount(start: CalendarDate, end: CalendarDate): number {
    return composeRange(start, end, this.composeOptions()).days.length
  }
}

export const session = new Session()
