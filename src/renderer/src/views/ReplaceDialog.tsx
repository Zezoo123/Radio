import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { LogRow } from '../lib/logRows'

interface Props {
  open: boolean
  rows: LogRow[]
  /** Replacement result: the new rows plus a summary for the status line. */
  onApply: (rows: LogRow[], summary: string) => void
  onClose: () => void
}

/** Which grid columns a replace may touch, mapped to `LogRow.fields` indices. */
const SCOPES: { key: string; label: string; fields: number[] }[] = [
  { key: 'all', label: 'All columns', fields: [0, 1, 2, 3, 4] },
  { key: 'time', label: 'Time', fields: [0] },
  { key: 'cue', label: 'Cue', fields: [1] },
  { key: 'name', label: 'Name', fields: [2] },
  { key: 'category', label: 'Category', fields: [3] },
  { key: 'description', label: 'Description', fields: [4] }
]

/** Occurrences of `find` in `text`, optionally case-insensitive. */
function countIn(text: string, find: string, matchCase: boolean): number {
  const hay = matchCase ? text : text.toLowerCase()
  const needle = matchCase ? find : find.toLowerCase()
  let n = 0
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++
  return n
}

/** Replace every occurrence, preserving the original casing outside matches. */
function replaceIn(text: string, find: string, repl: string, matchCase: boolean): string {
  const hay = matchCase ? text : text.toLowerCase()
  const needle = matchCase ? find : find.toLowerCase()
  let out = ''
  let from = 0
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, from)) {
    out += text.slice(from, i) + repl
    from = i + needle.length
  }
  return out + text.slice(from)
}

/**
 * Notepad-style search & replace over the log grid's cell values, scoped to a
 * single column or all of them. Shows a live match count; Replace all rewrites
 * every matching cell in one shot (one dirty state hop for the Editor).
 */
export function ReplaceDialog({ open, rows, onApply, onClose }: Props): JSX.Element | null {
  const [find, setFind] = useState('')
  const [repl, setRepl] = useState('')
  const [scopeKey, setScopeKey] = useState('all')
  const [matchCase, setMatchCase] = useState(false)

  // Fresh inputs each time the dialog opens.
  useEffect(() => {
    if (open) {
      setFind('')
      setRepl('')
    }
  }, [open])

  const scope = SCOPES.find((s) => s.key === scopeKey) ?? SCOPES[0]

  // The live match count rescans every cell; on multi-thousand-row logs doing
  // that synchronously per keystroke makes the Find input stutter. Deferring
  // the scanned value keeps typing instant — the count trails by a frame.
  const deferredFind = useDeferredValue(find)
  const { matches, cells } = useMemo(() => {
    if (!open || !deferredFind) return { matches: 0, cells: 0 }
    const fields = (SCOPES.find((s) => s.key === scopeKey) ?? SCOPES[0]).fields
    let matches = 0
    let cells = 0
    for (const r of rows) {
      for (const fi of fields) {
        const n = countIn(r.fields[fi], deferredFind, matchCase)
        if (n > 0) {
          matches += n
          cells++
        }
      }
    }
    return { matches, cells }
  }, [open, rows, deferredFind, matchCase, scopeKey])

  if (!open) return null

  function replaceAll(): void {
    // Counted live (not from the deferred display value) so Enter right after
    // typing replaces exactly what the current input matches.
    if (!find) return
    let replaced = 0
    let cellsHit = 0
    const next = rows.map((r) => {
      let fields: LogRow['fields'] | null = null
      for (const fi of scope.fields) {
        const n = countIn(r.fields[fi], find, matchCase)
        if (n === 0) continue
        replaced += n
        cellsHit++
        fields = fields ?? ([...r.fields] as LogRow['fields'])
        fields[fi] = replaceIn(fields[fi], find, repl, matchCase)
      }
      return fields ? { ...r, fields } : r
    })
    if (replaced === 0) return
    onApply(
      next,
      `Replaced ${replaced} occurrence${replaced === 1 ? '' : 's'} in ${cellsHit} cell${
        cellsHit === 1 ? '' : 's'
      }`
    )
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Search &amp; replace</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-grid">
          <label>Find</label>
          <input
            autoFocus
            value={find}
            dir="auto"
            spellCheck={false}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') replaceAll()
            }}
          />
          <label>Replace with</label>
          <input
            value={repl}
            dir="auto"
            spellCheck={false}
            onChange={(e) => setRepl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') replaceAll()
            }}
          />
          <label>In column</label>
          <div className="row">
            <select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
              {SCOPES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
              />
              Match case
            </label>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="muted">
            {find
              ? matches > 0
                ? `${matches} match${matches === 1 ? '' : 'es'} in ${cells} cell${
                    cells === 1 ? '' : 's'
                  }`
                : 'No matches'
              : 'Type something to find'}
          </span>
          <span className="row">
            <button className="btn" onClick={onClose}>
              Close
            </button>
            <button className="btn primary" disabled={matches === 0} onClick={replaceAll}>
              Replace all
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
