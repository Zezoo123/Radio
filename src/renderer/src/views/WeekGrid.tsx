import { useEffect, useRef, useState } from 'react'
import type { HourFormat, WeekGrid as WeekGridModel } from '../../../main/core/format/types'
import { WEEKDAY_LABELS } from '../../../main/core/format/types'

interface Props {
  grid: WeekGridModel
  formats: HourFormat[]
  /** Active format id to paint, or null to erase. */
  paintId: string | null
  onAssign: (weekday: number, hour: number, id: string | null) => void
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad2 = (n: number): string => String(n).padStart(2, '0')

export function WeekGrid({ grid, formats, paintId, onAssign }: Props): JSX.Element {
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

  function paint(weekday: number, hour: number): void {
    onAssign(weekday, hour, paintId)
  }

  return (
    <div className={`week-grid ${painting ? 'painting' : ''}`}>
      <table className="grid-tbl">
        <thead>
          <tr>
            <th className="corner" />
            {WEEKDAY_LABELS.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <th className="hour-label">{pad2(hour)}</th>
              {WEEKDAY_LABELS.map((_, wd) => {
                const fmt = byId(grid.cells[wd]?.[hour] ?? null)
                return (
                  <td
                    key={wd}
                    className="grid-cell"
                    title={fmt?.name ?? ''}
                    style={fmt ? { background: fmt.color, color: '#0b0d11' } : undefined}
                    onMouseDown={() => {
                      paintingRef.current = true
                      setPainting(true)
                      paint(wd, hour)
                    }}
                    onMouseEnter={() => {
                      if (paintingRef.current) paint(wd, hour)
                    }}
                  >
                    {fmt ? abbreviate(fmt.name) : ''}
                  </td>
                )
              })}
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
