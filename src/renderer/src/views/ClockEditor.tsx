import type { Cue } from '../../../main/core/types'
import type { FormatRow, HourFormat } from '../../../main/core/format/types'

const CUES: Cue[] = ['+', '@', '#']

interface Props {
  formats: HourFormat[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddFormat: () => void
  onChangeFormat: (format: HourFormat) => void
  onDeleteFormat: (id: string) => void
}

export function ClockEditor({
  formats,
  selectedId,
  onSelect,
  onAddFormat,
  onChangeFormat,
  onDeleteFormat
}: Props): JSX.Element {
  const selected = formats.find((f) => f.id === selectedId) ?? null

  function patchRow(index: number, patch: Partial<FormatRow>): void {
    if (!selected) return
    const rows = selected.rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChangeFormat({ ...selected, rows })
  }

  function addRow(): void {
    if (!selected) return
    const rows = [...selected.rows, { minute: 0, second: 0, cue: '+' as Cue, name: '' }]
    onChangeFormat({ ...selected, rows })
  }

  function removeRow(index: number): void {
    if (!selected) return
    onChangeFormat({ ...selected, rows: selected.rows.filter((_, i) => i !== index) })
  }

  return (
    <div className="clock-layout">
      <div className="clock-list">
        <div className="card-head">
          <h2>Clocks</h2>
          <button className="btn" onClick={onAddFormat}>
            + New
          </button>
        </div>
        {formats.length === 0 && <p className="empty">No formats yet.</p>}
        {formats.map((f) => (
          <button
            key={f.id}
            className={`clock-item ${f.id === selectedId ? 'on' : ''}`}
            onClick={() => onSelect(f.id)}
          >
            <span className="swatch" style={{ background: f.color }} />
            <span className="clock-name">{f.name || '(unnamed)'}</span>
            <span className="muted">{f.rows.length}</span>
          </button>
        ))}
      </div>

      <div className="clock-edit">
        {!selected ? (
          <p className="empty">Select or create a clock to edit its rows.</p>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <input
                value={selected.name}
                placeholder="Format name"
                onChange={(e) => onChangeFormat({ ...selected, name: e.target.value })}
                style={{ minWidth: 200 }}
              />
              <input
                type="color"
                value={selected.color}
                onChange={(e) => onChangeFormat({ ...selected, color: e.target.value })}
              />
              <button className="btn-link" onClick={() => onDeleteFormat(selected.id)}>
                delete
              </button>
            </div>

            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Min</th>
                  <th style={{ width: 64 }}>Sec</th>
                  <th style={{ width: 70 }}>Cue</th>
                  <th>Name / cart</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {selected.rows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={row.minute}
                        onChange={(e) => patchRow(i, { minute: clamp(+e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={row.second}
                        onChange={(e) => patchRow(i, { second: clamp(+e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={row.cue}
                        onChange={(e) => patchRow(i, { cue: e.target.value as Cue })}
                      >
                        {CUES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.name}
                        onChange={(e) => patchRow(i, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={row.category ?? ''}
                        onChange={(e) =>
                          patchRow(i, { category: e.target.value || undefined })
                        }
                      />
                    </td>
                    <td>
                      <input
                        dir="auto"
                        value={row.description ?? ''}
                        onChange={(e) =>
                          patchRow(i, { description: e.target.value || undefined })
                        }
                      />
                    </td>
                    <td>
                      <button className="btn-link" onClick={() => removeRow(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" style={{ marginTop: 10 }} onClick={addRow}>
              + Add row
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(59, Math.trunc(n)))
}
