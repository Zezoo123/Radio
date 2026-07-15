import { useEffect, useRef, useState } from 'react'
import { blankRow, cloneRow, rowKind, type LogRow } from '../lib/logRows'
import { formatDuration, formatSeconds, parseDuration, type SimRow } from '../lib/runtime'

/**
 * Simian-style log grid: one row per log line, every cell directly editable,
 * rows drag-reorderable by the ⠿ grip, with per-row insert-below and delete.
 *
 * Two derived columns sit beside the raw log fields:
 *  - Expected — the computed real air time given the order and the cue rules
 *    (`@` fires at its stated time, `+` after the previous item finishes,
 *    `#` after the current item but never before its stated time).
 *  - Duration — seconds per file (filled from the Simian audio database,
 *    editable; comments and other non-audio rows stay 0).
 */

interface Props {
  rows: LogRow[]
  onRows: (rows: LogRow[]) => void
  /** Playout simulation result per row (indexed like `rows`). */
  sim: SimRow[]
  /** Duration in seconds for a row. */
  durationOf: (row: LogRow) => number
  onDuration: (id: number, seconds: number) => void
  /** App-wide Category → `#rrggbb` map; rows tint by their Category column. */
  categoryColors?: Record<string, string>
}

/** Row tint for a category color: translucent fill + a solid edge marker. */
function rowTint(color: string | undefined): React.CSSProperties | undefined {
  if (!color) return undefined
  return { background: `${color}24`, boxShadow: `inset 3px 0 0 0 ${color}` }
}

/** Column layout: defaults with a roomy Description; user resizes persist. */
type ColKey =
  | 'grip'
  | 'time'
  | 'cue'
  | 'expected'
  | 'name'
  | 'dur'
  | 'category'
  | 'description'
  | 'act'
const COLUMNS: { key: ColKey; label: string; width: number; fixed?: boolean }[] = [
  { key: 'grip', label: '', width: 26, fixed: true },
  { key: 'time', label: 'Time', width: 90 },
  { key: 'cue', label: 'Cue', width: 40 },
  { key: 'expected', label: 'Expected', width: 88 },
  { key: 'name', label: 'Name', width: 170 },
  { key: 'dur', label: 'Dur', width: 60 },
  { key: 'category', label: 'Category', width: 100 },
  { key: 'description', label: 'Description', width: 420 },
  { key: 'act', label: '', width: 76, fixed: true }
]

const MIN_COL_WIDTH = 24
const WIDTHS_KEY = 'editor.colWidths'
const defaultWidths = (): Record<string, number> =>
  Object.fromEntries(COLUMNS.map((c) => [c.key, c.width]))

function loadWidths(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as Record<string, unknown>
    const out = defaultWidths()
    for (const c of COLUMNS) {
      const w = saved[c.key]
      if (!c.fixed && typeof w === 'number' && Number.isFinite(w)) {
        out[c.key] = Math.max(MIN_COL_WIDTH, Math.round(w))
      }
    }
    return out
  } catch {
    return defaultWidths()
  }
}

/** The Expected cell: green = plays, red = cut by an @, yellow = never plays. */
function expectedCell(s: SimRow | undefined): JSX.Element {
  if (!s) return <td className="expected-col" />
  if (s.status === 'skipped') {
    return (
      <td className="expected-col st-skipped" title="Skipped — a timed event fires before it can play">
        skipped
      </td>
    )
  }
  if (s.status === 'interrupted') {
    return (
      <td
        className="expected-col st-interrupted"
        title={`Interrupted — cut at ${s.cutAt != null ? formatSeconds(s.cutAt) : '?'} by the next @`}
      >
        {s.expected != null ? formatSeconds(s.expected) : ''}
      </td>
    )
  }
  return (
    <td className="expected-col" title="Computed from the order, cues and durations">
      {s.expected != null ? formatSeconds(s.expected) : ''}
    </td>
  )
}

export function LogGrid({
  rows,
  onRows,
  sim,
  durationOf,
  onDuration,
  categoryColors
}: Props): JSX.Element {
  // Drag state: which row id may start a drag (grip pressed), the row being
  // dragged and the row currently hovered as the drop target.
  const [dragArmed, setDragArmed] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // Delete needs a second click: the first click arms this row id, and the arm
  // times out so a stray click can't linger as a landmine.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    },
    []
  )

  // Excel-style column sizing: drag a header's right edge; widths persist.
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths)

  function startResize(key: ColKey, e: React.MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widths[key]
    const onMove = (ev: MouseEvent): void => {
      const w = Math.max(MIN_COL_WIDTH, Math.round(startWidth + ev.clientX - startX))
      setWidths((prev) => ({ ...prev, [key]: w }))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setWidths((prev) => {
        try {
          localStorage.setItem(WIDTHS_KEY, JSON.stringify(prev))
        } catch {
          /* storage unavailable — keep in-memory sizes */
        }
        return prev
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** Double-click a handle to snap the column back to its default width. */
  function resetWidth(key: ColKey): void {
    setWidths((prev) => {
      const next = { ...prev, [key]: defaultWidths()[key] }
      try {
        localStorage.setItem(WIDTHS_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }

  function editCell(id: number, field: number, value: string): void {
    onRows(
      rows.map((r) => {
        if (r.id !== id) return r
        const fields = [...r.fields] as LogRow['fields']
        fields[field] = value
        return { ...r, fields }
      })
    )
  }

  function insertBelow(index: number): void {
    const copy = [...rows]
    copy.splice(index + 1, 0, blankRow())
    onRows(copy)
  }

  function duplicateRow(index: number): void {
    const copy = [...rows]
    const dupe = cloneRow(rows[index])
    copy.splice(index + 1, 0, dupe)
    // Carry the original's duration so the Expected timeline stays truthful.
    onDuration(dupe.id, durationOf(rows[index]))
    onRows(copy)
  }

  function removeRow(index: number, id: number): void {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    if (confirmDelete !== id) {
      // First click arms; it disarms by itself shortly after.
      setConfirmDelete(id)
      confirmTimer.current = setTimeout(() => setConfirmDelete(null), 1800)
      return
    }
    setConfirmDelete(null)
    onRows(rows.filter((_, i) => i !== index))
  }

  function endDrag(): void {
    setDragArmed(null)
    setDragIndex(null)
    setOverIndex(null)
  }

  function dropOn(target: number): void {
    if (dragIndex === null || dragIndex === target) {
      endDrag()
      return
    }
    const copy = [...rows]
    const [moved] = copy.splice(dragIndex, 1)
    copy.splice(target, 0, moved)
    onRows(copy)
    endDrag()
  }

  /** Commit an MM:SS duration edit; invalid text snaps back to the old value. */
  function commitDuration(id: number, input: HTMLInputElement, current: number): void {
    const parsed = parseDuration(input.value)
    if (parsed == null) input.value = formatDuration(current)
    else if (parsed !== current) onDuration(id, parsed)
    else input.value = formatDuration(current)
  }

  /** A log cell (Time, Cue, Name, Category, Description) as an editable input. */
  const fieldCell = (r: LogRow, fi: number): JSX.Element => (
    <td key={fi} className={`lf-${fi}`}>
      <input
        value={r.fields[fi]}
        dir="auto"
        spellCheck={false}
        onChange={(e) => editCell(r.id, fi, e.target.value)}
      />
    </td>
  )

  return (
    <table className="log-grid">
      <colgroup>
        {COLUMNS.map((c) => (
          <col key={c.key} style={{ width: widths[c.key] }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {COLUMNS.map((c) =>
            c.fixed ? (
              <th key={c.key} className={`${c.key}-col`} />
            ) : (
              <th key={c.key} className={c.key === 'expected' || c.key === 'dur' ? `${c.key}-col` : ''}>
                {c.label}
                <span
                  className="col-resize"
                  title="Drag to resize · double-click to reset"
                  onMouseDown={(e) => startResize(c.key, e)}
                  onDoubleClick={() => resetWidth(c.key)}
                />
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.id}
            style={rowTint(categoryColors?.[r.fields[3].trim().toUpperCase()])}
            className={[
              `r-${rowKind(r)}`,
              sim[i]?.status === 'skipped' ? 'row-skipped' : '',
              sim[i]?.status === 'interrupted' ? 'row-interrupted' : '',
              dragIndex === i ? 'dragging' : '',
              overIndex === i && dragIndex !== null && dragIndex !== i ? 'drop-target' : ''
            ].join(' ')}
            draggable={dragArmed === r.id}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault()
              if (overIndex !== i) setOverIndex(i)
            }}
            onDrop={() => dropOn(i)}
            onDragEnd={endDrag}
          >
            <td
              className="grip-col"
              title="Drag to reorder"
              onMouseDown={() => setDragArmed(r.id)}
              onMouseUp={() => setDragArmed(null)}
            >
              ⠿
            </td>
            {fieldCell(r, 0)}
            {fieldCell(r, 1)}
            {expectedCell(sim[i])}
            {fieldCell(r, 2)}
            <td className="dur-col">
              {/* MM:SS, committed on blur/Enter; keyed so DB refreshes re-sync it. */}
              <input
                key={`${r.id}:${durationOf(r)}`}
                defaultValue={formatDuration(durationOf(r))}
                spellCheck={false}
                onBlur={(e) => commitDuration(r.id, e.currentTarget, durationOf(r))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </td>
            {fieldCell(r, 3)}
            {fieldCell(r, 4)}
            <td className="act-col">
              <button className="row-act" title="Duplicate row" onClick={() => duplicateRow(i)}>
                ⧉
              </button>
              <button className="row-act" title="Insert row below" onClick={() => insertBelow(i)}>
                +
              </button>
              <button
                className={`row-act danger ${confirmDelete === r.id ? 'armed' : ''}`}
                title={confirmDelete === r.id ? 'Click again to delete' : 'Delete row (click twice)'}
                onClick={() => removeRow(i, r.id)}
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
