import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { blankRow, cloneRow, rowKind, type LogRow } from '../lib/logRows'
import { formatDuration, formatSeconds, parseDuration, type SimRow } from '../lib/runtime'

/**
 * Simian-style log grid: one row per log line, every cell directly editable,
 * rows drag-reorderable by the ⠿ grip, with per-row duplicate / insert-below /
 * two-click delete, and Excel-style resizable columns (widths persist).
 *
 * Two derived columns sit beside the raw log fields:
 *  - Expected — the playout simulation's real air time (green plays, red was
 *    cut by an @, yellow never plays).
 *  - Duration — MM:SS per file (from the Simian audio database or the .bsi,
 *    editable; comments and other non-audio rows stay 0).
 *
 * PERFORMANCE: logs run to thousands of rows × ~8 interactive cells. Rows are
 * memoized so a keystroke or a drag-hover re-renders only the affected row —
 * not the whole table (which pegs a CPU core on real-world logs).
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
  /** App-wide Category → `#rrggbb` map; row text recolors by Category. */
  categoryTextColors?: Record<string, string>
}

/**
 * Row style for the category colors: translucent fill + a solid edge marker
 * for the highlight, plus the text color (cell inputs `color: inherit` it —
 * the interrupted/skipped red/yellow rules target the inputs directly, so
 * they still override a category text color).
 */
function rowStyle(
  tint: string | undefined,
  textColor: string | undefined
): React.CSSProperties | undefined {
  if (!tint && !textColor) return undefined
  return {
    ...(tint ? { background: `${tint}24`, boxShadow: `inset 3px 0 0 0 ${tint}` } : {}),
    color: textColor
  }
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

/** Stable per-row callbacks (identity never changes → memoized rows hold). */
interface RowHandlers {
  editCell(id: number, field: number, value: string): void
  commitDuration(id: number, input: HTMLInputElement): void
  duplicateRow(index: number): void
  insertBelow(index: number): void
  removeRow(index: number, id: number): void
  armDrag(id: number | null): void
  dragStart(index: number): void
  dragOver(index: number, e: React.DragEvent): void
  drop(index: number): void
  dragEnd(): void
}

interface GridRowProps {
  row: LogRow
  index: number
  sim: SimRow | undefined
  duration: number
  tint: string | undefined
  textColor: string | undefined
  isDragArmed: boolean
  isDragging: boolean
  isDropTarget: boolean
  isConfirmDelete: boolean
  h: RowHandlers
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

const GridRow = memo(
  function GridRow({
    row: r,
    index: i,
    sim,
    duration,
    tint,
    textColor,
    isDragArmed,
    isDragging,
    isDropTarget,
    isConfirmDelete,
    h
  }: GridRowProps): JSX.Element {
    const fieldCell = (fi: number): JSX.Element => (
      <td key={fi} className={`lf-${fi}`}>
        <input
          value={r.fields[fi]}
          dir="auto"
          spellCheck={false}
          onChange={(e) => h.editCell(r.id, fi, e.target.value)}
        />
      </td>
    )

    return (
      <tr
        style={rowStyle(tint, textColor)}
        className={[
          `r-${rowKind(r)}`,
          sim?.status === 'skipped' ? 'row-skipped' : '',
          sim?.status === 'interrupted' ? 'row-interrupted' : '',
          isDragging ? 'dragging' : '',
          isDropTarget ? 'drop-target' : ''
        ].join(' ')}
        draggable={isDragArmed}
        onDragStart={() => h.dragStart(i)}
        onDragOver={(e) => h.dragOver(i, e)}
        onDrop={() => h.drop(i)}
        onDragEnd={h.dragEnd}
      >
        <td
          className="grip-col"
          title="Drag to reorder"
          onMouseDown={() => h.armDrag(r.id)}
          onMouseUp={() => h.armDrag(null)}
        >
          ⠿
        </td>
        {fieldCell(0)}
        {fieldCell(1)}
        {expectedCell(sim)}
        {fieldCell(2)}
        <td className="dur-col">
          {/* MM:SS, committed on blur/Enter; keyed so DB refreshes re-sync it. */}
          <input
            key={`${r.id}:${duration}`}
            defaultValue={formatDuration(duration)}
            spellCheck={false}
            onBlur={(e) => h.commitDuration(r.id, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </td>
        {fieldCell(3)}
        {fieldCell(4)}
        <td className="act-col">
          <button className="row-act" title="Duplicate row" onClick={() => h.duplicateRow(i)}>
            ⧉
          </button>
          <button className="row-act" title="Insert row below" onClick={() => h.insertBelow(i)}>
            +
          </button>
          <button
            className={`row-act danger ${isConfirmDelete ? 'armed' : ''}`}
            title={isConfirmDelete ? 'Click again to delete' : 'Delete row (click twice)'}
            onClick={() => h.removeRow(i, r.id)}
          >
            ×
          </button>
        </td>
      </tr>
    )
  },
  (a, b) =>
    a.row === b.row &&
    a.index === b.index &&
    a.duration === b.duration &&
    a.tint === b.tint &&
    a.textColor === b.textColor &&
    a.isDragArmed === b.isDragArmed &&
    a.isDragging === b.isDragging &&
    a.isDropTarget === b.isDropTarget &&
    a.isConfirmDelete === b.isConfirmDelete &&
    // sim objects are rebuilt each simulation — compare by value.
    a.sim?.expected === b.sim?.expected &&
    a.sim?.status === b.sim?.status &&
    a.sim?.cutAt === b.sim?.cutAt
)

export function LogGrid({
  rows,
  onRows,
  sim,
  durationOf,
  onDuration,
  categoryColors,
  categoryTextColors
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

  // Live state behind stable handler identities: the memoized rows keep one
  // handlers object for the grid's whole life and read current data through it.
  const live = useRef({ rows, onRows, durationOf, onDuration, dragIndex, confirmDelete })
  live.current = { rows, onRows, durationOf, onDuration, dragIndex, confirmDelete }

  const handlers = useMemo<RowHandlers>(() => {
    const endDrag = (): void => {
      setDragArmed(null)
      setDragIndex(null)
      setOverIndex(null)
    }
    return {
      editCell(id, field, value) {
        live.current.onRows(
          live.current.rows.map((r) => {
            if (r.id !== id) return r
            const fields = [...r.fields] as LogRow['fields']
            fields[field] = value
            return { ...r, fields }
          })
        )
      },
      commitDuration(id, input) {
        // MM:SS commit; invalid text snaps back to the current value.
        const row = live.current.rows.find((r) => r.id === id)
        const current = row ? live.current.durationOf(row) : 0
        const parsed = parseDuration(input.value)
        if (parsed == null || parsed === current) input.value = formatDuration(current)
        else live.current.onDuration(id, parsed)
      },
      duplicateRow(index) {
        const { rows, onRows, onDuration, durationOf } = live.current
        const copy = [...rows]
        const dupe = cloneRow(rows[index])
        copy.splice(index + 1, 0, dupe)
        // Carry the original's duration so the Expected timeline stays truthful.
        onDuration(dupe.id, durationOf(rows[index]))
        onRows(copy)
      },
      insertBelow(index) {
        const copy = [...live.current.rows]
        copy.splice(index + 1, 0, blankRow())
        live.current.onRows(copy)
      },
      removeRow(index, id) {
        if (confirmTimer.current) clearTimeout(confirmTimer.current)
        if (live.current.confirmDelete !== id) {
          // First click arms; it disarms by itself shortly after.
          setConfirmDelete(id)
          confirmTimer.current = setTimeout(() => setConfirmDelete(null), 1800)
          return
        }
        setConfirmDelete(null)
        live.current.onRows(live.current.rows.filter((_, i) => i !== index))
      },
      armDrag(id) {
        setDragArmed(id)
      },
      dragStart(index) {
        setDragIndex(index)
      },
      dragOver(index, e) {
        e.preventDefault()
        setOverIndex((prev) => (prev === index ? prev : index))
      },
      drop(target) {
        const { rows, onRows, dragIndex } = live.current
        if (dragIndex === null || dragIndex === target) {
          endDrag()
          return
        }
        const copy = [...rows]
        const [moved] = copy.splice(dragIndex, 1)
        copy.splice(target, 0, moved)
        onRows(copy)
        endDrag()
      },
      dragEnd: endDrag
    }
  }, [])

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
          <GridRow
            key={r.id}
            row={r}
            index={i}
            sim={sim[i]}
            duration={durationOf(r)}
            tint={categoryColors?.[r.fields[3].trim().toUpperCase()]}
            textColor={categoryTextColors?.[r.fields[3].trim().toUpperCase()]}
            isDragArmed={dragArmed === r.id}
            isDragging={dragIndex === i}
            isDropTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
            isConfirmDelete={confirmDelete === r.id}
            h={handlers}
          />
        ))}
      </tbody>
    </table>
  )
}
