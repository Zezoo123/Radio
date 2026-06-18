import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app } from 'electron'
import { parseElementTemplate, type ElementTemplate } from './core/parsers/elementTemplate'
import { athanLinesForDate, parseAzanFile, type AzanFile } from './core/parsers/azanFile'
import {
  listGridSheets,
  parseStationGrid,
  programTitles,
  type StationGrid
} from './core/parsers/stationGrid'
import type { ProgramMap } from './core/programMap'
import { composeRange, exportRange, type ComposeOptions } from './core/schedule/compose'
import type { CalendarDate } from './core/types'

/** Lightweight summaries that cross IPC (the heavy parsed objects stay here). */
export interface GridSummary {
  fileName: string
  sheet: string
  sheets: string[]
  title: string
  segmentCount: number
  programTitles: string[]
}

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

interface LoadedGrid {
  fileName: string
  filePath: string
  sheets: string[]
  grid: StationGrid
}

interface LoadedTemplate {
  fileName: string
  template: ElementTemplate
}

/** In-memory session state for the main process. */
class Session {
  private grid: LoadedGrid | null = null
  private templates: LoadedTemplate[] = []
  private programMap: ProgramMap = {}
  private azan: { fileName: string; file: AzanFile } | null = null

  private mapPath(): string {
    return join(app.getPath('userData'), 'program-map.json')
  }

  async loadProgramMap(): Promise<ProgramMap> {
    try {
      this.programMap = JSON.parse(await readFile(this.mapPath(), 'utf-8')) as ProgramMap
    } catch {
      this.programMap = {}
    }
    return this.programMap
  }

  async saveProgramMap(map: ProgramMap): Promise<void> {
    this.programMap = map
    await writeFile(this.mapPath(), JSON.stringify(map, null, 2), 'utf-8')
  }

  getProgramMap(): ProgramMap {
    return this.programMap
  }

  async loadGrid(filePath: string, sheet?: string): Promise<GridSummary> {
    const sheets = await listGridSheets(filePath)
    const grid = await parseStationGrid(filePath, sheet)
    this.grid = { fileName: basename(filePath), filePath, sheets, grid }
    return this.gridSummary()
  }

  async selectGridSheet(sheet: string): Promise<GridSummary> {
    if (!this.grid) throw new Error('No station grid loaded')
    return this.loadGrid(this.grid.filePath, sheet)
  }

  private gridSummary(): GridSummary {
    if (!this.grid) throw new Error('No station grid loaded')
    const { grid, fileName, sheets } = this.grid
    return {
      fileName,
      sheet: grid.sheet,
      sheets,
      title: grid.title,
      segmentCount: grid.segments.length,
      programTitles: programTitles(grid)
    }
  }

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
    return this.azanSummary()
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

  private composeOptions(programLabel?: string): ComposeOptions {
    const azan = this.azan
    return {
      grid: this.grid?.grid,
      programMap: this.programMap,
      programSection: this.grid
        ? { code: 'PRG', label: programLabel || this.grid.grid.title || 'PROGRAMS' }
        : undefined,
      templates: this.templates.map((t) => t.template),
      athanLinesForDate: azan ? (date) => athanLinesForDate(azan.file, date) : undefined
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
