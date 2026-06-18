import { readFile } from 'node:fs/promises'
import type { CalendarDate } from '../types'

/**
 * Parses a monthly AZAN (athan) export file. These are produced from the
 * official Egyptian prayer timetable, so they are the authoritative source for
 * athan times and rows (computation drifts ~1 minute and doesn't match). Each
 * day block looks like:
 *
 *   |||COMMENT|----…              (rule)
 *   |||COMMENT|…=§§ 01 - 06 - 2026 §§=…
 *   |||COMMENT|----…              (rule)
 *                                 (blank)
 *   04:10:00|@||MACRO|DECKFADE CURRENT,100,0,10000,UNLOAD,RETURN
 *   04:10:02|+|AZ22-01RB|FEA|AZAN فجر
 *   …(5 prayers × 2 rows)…
 *                                 (blank)
 *
 * We keep the athan rows verbatim so they reproduce exactly on export.
 */

const DATE_RE = /=§§\s+(\d+)\s+-\s+(\d+)\s+-\s+(\d+)\s+§§=/
const RULE_RE = /^\|\|\|COMMENT\|-{5,}/

export interface AzanFile {
  /** "year-month-day" → the athan rows for that day (verbatim, in order). */
  byDay: Map<string, string[]>
  /** Distinct (month, year) pairs found in the file. */
  months: { month: number; year: number }[]
}

const key = (d: CalendarDate): string => `${d.year}-${d.month}-${d.day}`

export function parseAzanText(text: string): AzanFile {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n/)
  const byDay = new Map<string, string[]>()
  const months = new Map<string, { month: number; year: number }>()

  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(DATE_RE)
    if (!m) {
      i++
      continue
    }
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    const year = parseInt(m[3], 10)
    months.set(`${year}-${month}`, { month, year })

    // Skip the closing rule line (i+1); collect content until the next rule.
    let k = i + 2
    const rows: string[] = []
    while (k < lines.length && !RULE_RE.test(lines[k])) {
      if (lines[k].trim()) rows.push(lines[k])
      k++
    }
    byDay.set(key({ year, month, day }), rows)
    i = k
  }

  return { byDay, months: [...months.values()] }
}

export async function parseAzanFile(filePath: string): Promise<AzanFile> {
  return parseAzanText(await readFile(filePath, 'utf-8'))
}

/** The verbatim athan rows for a date, or null if the file doesn't cover it. */
export function athanLinesForDate(azan: AzanFile, date: CalendarDate): string[] | null {
  return azan.byDay.get(key(date)) ?? null
}
