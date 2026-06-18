import type ExcelJS from 'exceljs'

/**
 * Robustly extract a cell's text. exceljs returns rich-text cells as objects
 * (whose `.text` can stringify to "[object Object]" for merged slaves), so we
 * unwrap rich text, hyperlinks and formula results explicitly.
 */
export function extractText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((r) => r.text ?? '').join('')
    }
    if (typeof obj.text === 'string') return obj.text
    if (obj.result != null) return String(obj.result)
  }
  return String(cell.text ?? '')
}

/** "key `r,c`" → master "`mr,mc`" for every cell inside a merge range. */
export type MergeMap = Map<string, [number, number]>

function colLettersToNumber(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

/** Build a map from each merged cell to its master (top-left) coordinates. */
export function buildMergeMap(ws: ExcelJS.Worksheet): MergeMap {
  const map: MergeMap = new Map()
  const merges = (ws.model?.merges ?? []) as string[]
  for (const range of merges) {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
    if (!m) continue
    const c1 = colLettersToNumber(m[1])
    const r1 = parseInt(m[2], 10)
    const c2 = colLettersToNumber(m[3])
    const r2 = parseInt(m[4], 10)
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) map.set(`${r},${c}`, [r1, c1])
    }
  }
  return map
}

/** The master coordinates for a cell (itself if not in a merge). */
export function masterOf(merges: MergeMap, row: number, col: number): [number, number] {
  return merges.get(`${row},${col}`) ?? [row, col]
}
