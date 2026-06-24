import { useEffect, useRef, useState } from 'react'
import type { HourFormat, WeekGrid as WeekGridModel } from '../../../main/core/format/types'
import { WEEKDAY_LABELS } from '../../../main/core/format/types'

interface Props {
  grid: WeekGridModel
  formats: HourFormat[]
  /** The shared 24-hour default day (hour → format id). */
  defaultDay: (string | null)[]
  /** Active format id to paint, or null to erase. */
  paintId: string | null
  onAssign: (weekday: number, hour: number, id: string | null) => void
  onAssignDefault: (hour: number, id: string | null) => void
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad2 = (n: number): string => String(n).padStart(2, '0')

export function WeekGrid({
  grid,
  formats,
  defaultDay,
  paintId,
  onAssign,
  onAssignDefault
}: Props): JSX.Element {
  const [painting, setPainting] = useState(false)
  const paintingRef = useRef(false)

  useEffect(() => {
    const up = (): void => {
      paintingRef.current = false
      setPainting(false)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const byId = (id: string | null): HourFormat | undefined =>
    id ? formats.find((f) => f.id === id) : undefined

  const startPaint = (fn: () => void): void => {
    paintingRef.current = true
    setPainting(true)
    fn()
  }

  function cell(fmt: HourFormat | undefined, onPaint: () => void, key: string, extra = ''): JSX.Element {
    return (
      <td
        key={key}
        className={`grid-cell ${extra}`}
        title={fmt?.name ?? ''}
        style={fmt ? { background: fmt.color, color: '#0b0d11' } : undefined}
        onMouseDown={() => startPaint(onPaint)}
        onMouseEnter={() => {
          if (paintingRef.current) onPaint()
        }}
      >
        {fmt ? abbreviate(fmt.name) : ''}
      </td>
    )
  }

  return (
    <div className={`week-grid ${painting ? 'painting' : ''}`}>
      <table className="grid-tbl">
        <thead>
          <tr>
            <th className="corner" />
            <th className="def-col" title="Applied to every day">
              Default
            </th>
            {WEEKDAY_LABELS.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <th className="hour-label">{pad2(hour)}</th>
              {cell(
                byId(defaultDay[hour] ?? null),
                () => onAssignDefault(hour, paintId),
                `def-${hour}`,
                'def-col'
              )}
              {WEEKDAY_LABELS.map((_, wd) =>
                cell(byId(grid.cells[wd]?.[hour] ?? null), () => onAssign(wd, hour, paintId), `${wd}-${hour}`)
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function abbreviate(name: string): string {
  return name.length <= 8 ? name : name.slice(0, 7) + '…'
}
