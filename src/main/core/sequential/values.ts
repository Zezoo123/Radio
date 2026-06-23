import type { Sequential } from './types'

/**
 * The full ordered list of filenames a sequential produces, e.g.
 *   numerical   JNG 0-2  → ["JNG-00", "JNG-01", "JNG-02"]
 *   alphabetical JNG A-C → ["JNG-A", "JNG-B", "JNG-C"]
 * Returns [] for an invalid/empty range.
 */
export function sequentialValues(seq: Sequential): string[] {
  return seq.mode === 'numerical' ? numericValues(seq) : alphaValues(seq)
}

function numericValues(seq: Sequential): string[] {
  const s = parseInt(seq.start, 10)
  const e = parseInt(seq.end, 10)
  if (Number.isNaN(s) || Number.isNaN(e)) return []
  const lo = Math.min(s, e)
  const hi = Math.max(s, e)
  const width = Math.max(2, String(hi).length, String(lo).length)
  const out: string[] = []
  for (let n = lo; n <= hi; n++) out.push(`${seq.name}-${String(n).padStart(width, '0')}`)
  return out
}

function alphaValues(seq: Sequential): string[] {
  const s = seq.start.trim().toUpperCase().charCodeAt(0)
  const e = seq.end.trim().toUpperCase().charCodeAt(0)
  if (!isLetter(s) || !isLetter(e)) return []
  const lo = Math.min(s, e)
  const hi = Math.max(s, e)
  const out: string[] = []
  for (let c = lo; c <= hi; c++) out.push(`${seq.name}-${String.fromCharCode(c)}`)
  return out
}

function isLetter(code: number): boolean {
  return code >= 65 && code <= 90
}
