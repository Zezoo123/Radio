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
 * placement grid. Click a cell to block/unblock that hour on that weekday;
 * click an hour header to toggle the whole column, a day name for the whole
 * day. Changes apply immediately; Done just closes.
 */
export function BlockedHoursDialog({ open, grid, onChange, onClose }: Props): JSX.Element | null {
  if (!open) return null

  const sets = grid.map((d) => new Set(d))
  const commit = (next: Set<number>[]): void =>
    onChange(next.map((s) => [...s].sort((a, b) => a - b)))

  function toggleCell(wd: number, h: number): void {
    const next = sets.map((s) => new Set(s))
    if (next[wd].has(h)) next[wd].delete(h)
    else next[wd].add(h)
    commit(next)
  }

  /** Hour header: block this hour on every day, or clear it if all days have it. */
  function toggleHour(h: number): void {
    const everywhere = sets.every((s) => s.has(h))
    const next = sets.map((s) => new Set(s))
    for (const s of next) {
      if (everywhere) s.delete(h)
      else s.add(h)
    }
    commit(next)
  }

  /** Day name: block the whole day, or clear it if every hour is blocked. */
  function toggleDay(wd: number): void {
    const next = sets.map((s) => new Set(s))
    next[wd] = sets[wd].size === 24 ? new Set() : new Set(HOURS)
    commit(next)
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
          No promo may ever use a blocked hour — e.g. the Fagr window. Click a cell to block that
          hour on that day; click an hour number for the whole column, a day name for the whole
          day. Blocked hours show black in every weekly grid.
        </p>

        <table className="week-table blocked-edit">
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
                  </button>{' '}
                  <span className="muted">{sets[wd].size === 0 ? '' : hoursSummary(grid[wd])}</span>
                </th>
                {HOURS.map((h) => {
                  const on = sets[wd].has(h)
                  const label = `${name} ${pad2(h)}:00`
                  return (
                    <td
                      key={h}
                      className={`hour ${on ? 'gblocked' : 'free'}`}
                      title={on ? `${label} — blocked (click to allow)` : `${label} — click to block`}
                      onClick={() => toggleCell(wd, h)}
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
