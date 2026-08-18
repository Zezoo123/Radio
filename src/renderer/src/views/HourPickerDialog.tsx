import { useEffect } from 'react'

interface Props {
  open: boolean
  /** Where the picked hours apply, e.g. "Row 3". */
  targetLabel: string
  /** Currently selected hours (empty = every hour). */
  hours: number[]
  /** Explains what a selection means; defaults to the clock-row wording. */
  hint?: string
  /** Summary label for the empty selection (defaults to "every"). */
  emptyLabel?: string
  onChange: (hours: number[]) => void
  onClose: () => void
}

const pad2 = (h: number): string => String(h).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** "07:00 - 08:00" — the hour-range wording radio folks read at a glance. */
const rangeLabel = (h: number): string => `${pad2(h)}:00 - ${pad2((h + 1) % 24)}:00`

/** Compact summary for the grid cell: "every", "07", "07–09, 16–18". */
export function hoursSummary(hours: number[] | undefined): string {
  if (!hours || hours.length === 0 || hours.length === 24) return 'every'
  const sorted = [...hours].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const h of sorted.slice(1)) {
    if (h === prev + 1) {
      prev = h
      continue
    }
    parts.push(start === prev ? pad2(start) : `${pad2(start)}–${pad2(prev)}`)
    start = prev = h
  }
  parts.push(start === prev ? pad2(start) : `${pad2(start)}–${pad2(prev)}`)
  return parts.join(', ')
}

/**
 * Multi-select hour picker for a clock row: click hour ranges to toggle them,
 * All/None for bulk moves. Selecting nothing (or everything) means the row
 * fires every hour. Changes apply immediately; Done just closes.
 */
export function HourPickerDialog({
  open,
  targetLabel,
  hours,
  hint,
  emptyLabel,
  onChange,
  onClose
}: Props): JSX.Element | null {
  // Escape closes the dialog, like every overlay in the app.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const selected = new Set(hours)

  function toggle(h: number): void {
    const next = new Set(selected)
    if (next.has(h)) next.delete(h)
    else next.add(h)
    onChange([...next].sort((a, b) => a - b))
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Hours — {targetLabel}</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted">
          {hint ?? 'Pick the hours this row fires at. Nothing selected = every hour.'}
        </p>

        <div className="hour-pick-grid">
          {HOURS.map((h) => (
            <button
              key={h}
              className={`hour-pick ${selected.has(h) ? 'on' : ''}`}
              onClick={() => toggle(h)}
            >
              {rangeLabel(h)}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="row">
            <button className="btn" onClick={() => onChange(HOURS)}>
              All
            </button>
            <button className="btn" onClick={() => onChange([])}>
              None
            </button>
            <span className="muted">
              {hours.length === 0 && emptyLabel ? emptyLabel : hoursSummary(hours)}
            </span>
          </span>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
