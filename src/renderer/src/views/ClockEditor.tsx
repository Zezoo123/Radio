import { useRef, useState } from 'react'
import type { Cue } from '../../../main/core/types'
import type { FormatRow, HourFormat } from '../../../main/core/format/types'
import { InsertDialog } from './InsertDialog'

const CUES: Cue[] = ['+', '@', '#']

type Field = 'name' | 'description'

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

  // Track the last-focused editable field + caret so Insert lands in the right spot.
  const focusedEl = useRef<HTMLInputElement | null>(null)
  const focusedRow = useRef<number | null>(null)
  const focusedField = useRef<Field | null>(null)
  const selStart = useRef(0)
  const selEnd = useRef(0)

  const [insertOpen, setInsertOpen] = useState(false)
  const [insertLabel, setInsertLabel] = useState<string | null>(null)
  // Which insertable field the cursor is in (drives the Insert button's enabled
  // state). null while editing Min/Sec/Cue/Category or the format name.
  const [activeField, setActiveField] = useState<Field | null>(null)

  function track(e: { currentTarget: HTMLInputElement }, row: number, field: Field): void {
    const el = e.currentTarget
    focusedEl.current = el
    focusedRow.current = row
    focusedField.current = field
    selStart.current = el.selectionStart ?? el.value.length
    selEnd.current = el.selectionEnd ?? selStart.current
  }

  const fieldHandlers = (row: number, field: Field) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      track(e, row, field)
      setActiveField(field)
    },
    onSelect: (e: React.SyntheticEvent<HTMLInputElement>) => track(e, row, field),
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => track(e, row, field),
    onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => track(e, row, field)
  })

  // Inputs that are NOT insert targets clear the active field on focus.
  const nonTargetFocus = { onFocus: () => setActiveField(null) }

  function openInsert(): void {
    const row = focusedRow.current
    const field = focusedField.current
    setInsertLabel(
      row != null && field ? `Row ${row + 1} · ${field === 'name' ? 'Name' : 'Description'}` : null
    )
    setInsertOpen(true)
  }

  function insertText(text: string): void {
    const el = focusedEl.current
    const row = focusedRow.current
    const field = focusedField.current
    if (!selected || row == null || !field) return
    const cur = (field === 'name' ? selected.rows[row].name : selected.rows[row].description) ?? ''
    const start = selStart.current
    const end = selEnd.current
    const next = cur.slice(0, start) + text + cur.slice(end)
    patchRow(row, field === 'name' ? { name: next } : { description: next || undefined })
    setInsertOpen(false)
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        const pos = start + text.length
        el.setSelectionRange(pos, pos)
        selStart.current = pos
        selEnd.current = pos
      }
    })
  }

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
                {...nonTargetFocus}
                onChange={(e) => onChangeFormat({ ...selected, name: e.target.value })}
                style={{ minWidth: 200 }}
              />
              <input
                type="color"
                value={selected.color}
                {...nonTargetFocus}
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
                        {...nonTargetFocus}
                        onChange={(e) => patchRow(i, { minute: clamp(+e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={row.second}
                        {...nonTargetFocus}
                        onChange={(e) => patchRow(i, { second: clamp(+e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={row.cue}
                        {...nonTargetFocus}
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
                        {...fieldHandlers(i, 'name')}
                        onChange={(e) => patchRow(i, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={row.category ?? ''}
                        {...nonTargetFocus}
                        onChange={(e) => patchRow(i, { category: e.target.value || undefined })}
                      />
                    </td>
                    <td>
                      <input
                        dir="auto"
                        value={row.description ?? ''}
                        {...fieldHandlers(i, 'description')}
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

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={addRow}>
                + Add row
              </button>
              <button
                className="btn"
                disabled={!activeField}
                title={activeField ? '' : 'Click into a Name or Description field first'}
                onClick={openInsert}
              >
                Insert…
              </button>
            </div>
          </>
        )}
      </div>

      <InsertDialog
        open={insertOpen}
        targetLabel={insertLabel}
        onPick={insertText}
        onClose={() => setInsertOpen(false)}
      />
    </div>
  )
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(59, Math.trunc(n)))
}
