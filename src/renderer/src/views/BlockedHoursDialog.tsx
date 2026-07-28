import { useEffect, useRef, useState } from 'react'
import { hoursSummary } from './HourPickerDialog'

interface Props {
  open: boolean
  /** Blocked hours per weekday `[Sun..Sat]`. */
  grid: number[][]
  onChange: (grid: number[][]) => void
  onClose: () => void
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad2 = (h: number): string => String(h).padStart(2, '0')

export const emptyBlockedGrid = (): number[][] => Array.from({ length: 7 }, () => [])

/** Compact label for the rules button: "none", "02–06", or "varies by day". */
export function blockedGridSummary(grid: number[][]): string {
  if (grid.every((d) => d.length === 0)) return 'none'
  const first = grid[0].join(',')
  if (grid.every((d) => d.join(',') === first)) return hoursSummary(grid[0])
  return 'varies by day'
}

/**
 * Station blocked hours, per day per hour — the same week table as the promo
 * placement grid. Click or drag across cells to block/unblock (the first cell
 * decides which); an hour header toggles the whole column, a day name the whole
 * day. Changes apply immediately; Done just closes.
 */
export function BlockedHoursDialog({ open, grid, onChange, onClose }: Props): JSX.Element | null {
  // Drag paint: the cell you press decides block vs clear; sweeping applies it.
  // `latest` mirrors the grid through a drag — sweep events can outrun React's
  // re-render, and deriving from props alone would drop the fastest cells.
  const dragMode = useRef<'block' | 'clear' | null>(null)
  const [dragging, setDragging] = useState(false)
  const latest = useRef(grid)
  if (!dragMode.current) latest.current = grid

  useEffect(() => {
    const up = (): void => {
      dragMode.current = null
      setDragging(false)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  if (!open) return null

  const sets = grid.map((d) => new Set(d))

  function commit(next: number[][]): void {
    latest.current = next
    onChange(next)
  }

  function setCell(wd: number, h: number, block: boolean): void {
    const cur = latest.current
    if (cur[wd].includes(h) === block) return
    commit(
      cur.map((d, i) =>
        i !== wd ? d : block ? [...d, h].sort((a, b) => a - b) : d.filter((x) => x !== h)
      )
    )
  }

  /** Hour header: block this hour on every day, or clear it if all days have it. */
  function toggleHour(h: number): void {
    const cur = latest.current
    const everywhere = cur.every((d) => d.includes(h))
    commit(
      cur.map((d) =>
        everywhere ? d.filter((x) => x !== h) : d.includes(h) ? d : [...d, h].sort((a, b) => a - b)
      )
    )
  }

  /** Day name: block the whole day, or clear it if every hour is blocked. */
  function toggleDay(wd: number): void {
    const cur = latest.current
    commit(cur.map((d, i) => (i !== wd ? d : d.length === 24 ? [] : [...HOURS])))
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal grid-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Blocked hours — station rules</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted">
          No promo may ever use a blocked hour — e.g. the Fagr window. Click or hold and drag
          across cells to block or unblock them; an hour number toggles the whole column, a day
          name the whole day. Blocked hours show black in every weekly grid.
        </p>

        <table className={`week-table blocked-edit ${dragging ? 'painting' : ''}`}>
          <thead>
            <tr>
              <th className="wd-col" />
              {HOURS.map((h) => (
                <th key={h} className="hour-h">
                  <button
                    className="hour-h-btn"
                    title={`${pad2(h)}:00 — toggle on every day`}
                    onClick={() => toggleHour(h)}
                  >
                    {h}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((name, wd) => (
              <tr key={wd}>
                <th className="wd-col" scope="row">
                  <button
                    className="btn-link"
                    title={`Toggle the whole ${name}`}
                    onClick={() => toggleDay(wd)}
                  >
                    <strong>{name}</strong>
                  </button>
                </th>
                {HOURS.map((h) => {
                  const on = sets[wd].has(h)
                  const label = `${name} ${pad2(h)}:00`
                  return (
                    <td
                      key={h}
                      className={`hour ${on ? 'gblocked' : 'free'}`}
                      title={on ? `${label} — blocked (drag to allow)` : `${label} — drag to block`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        dragMode.current = on ? 'clear' : 'block'
                        setDragging(true)
                        setCell(wd, h, !on)
                      }}
                      onMouseEnter={() => {
                        if (dragMode.current) setCell(wd, h, dragMode.current === 'block')
                      }}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn" onClick={() => onChange(emptyBlockedGrid())}>
            Clear all
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
