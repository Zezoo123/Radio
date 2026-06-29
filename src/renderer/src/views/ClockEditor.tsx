import { useEffect, useRef, useState } from 'react'
import type { Cue } from '../../../main/core/types'
import type { FormatRow, HourFormat } from '../../../main/core/format/types'
import { InsertDialog } from './InsertDialog'

const CUES: Cue[] = ['+', '@', '#']

type Field = 'name' | 'description'

interface Props {
  formats: HourFormat[]
  categories: string[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddFormat: () => void
  onChangeFormat: (format: HourFormat) => void
  onDeleteFormat: (id: string) => void
  onDuplicateFormat: (id: string) => void
  onAddCategory: (category: string) => void
  /** Show the per-row Hour column (default clocks only). */
  showHour?: boolean
}

// Sentinel select value that switches a Category cell into "type a new one" mode.
const ADD_CATEGORY = '__add__'
// Sentinel: a one-click "load next day's log" row (auto-configured + locked).
const NEXT_DAY_LOG = '__nextdaylog__'
const LOG_DESCRIPTION = '[Day] [YYMMDD] Log'
const HOURS = Array.from({ length: 24 }, (_, h) => h)
// Categories that carry no audio file/cart — the Name/cart cell is disabled for
// these (MACRO commands live in Description; COMMENT rows are plain comments).
const NO_NAME_CATEGORIES = ['MACRO', 'COMMENT']

export function ClockEditor({
  formats,
  categories,
  selectedId,
  onSelect,
  onAddFormat,
  onChangeFormat,
  onDeleteFormat,
  onDuplicateFormat,
  onAddCategory,
  showHour = false
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

  // Row index whose Category cell is currently entering a brand-new category.
  const [addingCatRow, setAddingCatRow] = useState<number | null>(null)
  const [newCat, setNewCat] = useState('')

  // Clock (in the list) awaiting delete confirmation; auto-cancels after a moment.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  useEffect(() => {
    if (!confirmDeleteId) return
    const t = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(t)
  }, [confirmDeleteId])

  function commitNewCategory(index: number): void {
    const cat = newCat.trim()
    if (cat) {
      onAddCategory(cat)
      patchRow(index, { category: cat })
    }
    setAddingCatRow(null)
    setNewCat('')
  }

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

  // "NEXT DAY LOG": one-click load-next-day row — 23:59:59 +, empty name,
  // Category LOG, fixed Description, next-day on. Locked until you change category.
  function configureLogRow(index: number): void {
    patchRow(index, {
      hour: 23,
      minute: 59,
      second: 59,
      cue: '+',
      name: '',
      category: 'LOG',
      description: LOG_DESCRIPTION,
      nextDay: true,
      logRow: true
    })
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
          <div key={f.id} className={`clock-item ${f.id === selectedId ? 'on' : ''}`}>
            <button
              className="clock-select"
              onClick={() => {
                onSelect(f.id)
                setConfirmDeleteId(null)
              }}
            >
              <span className="swatch" style={{ background: f.color }} />
              <span className="clock-name">{f.name || '(unnamed)'}</span>
              <span className="muted">{f.rows.length}</span>
            </button>
            {confirmDeleteId === f.id ? (
              <button
                className="trash confirm"
                title="Click again to delete"
                onClick={() => {
                  onDeleteFormat(f.id)
                  setConfirmDeleteId(null)
                }}
              >
                Delete?
              </button>
            ) : (
              <button
                className="trash"
                title="Delete clock"
                onClick={() => setConfirmDeleteId(f.id)}
              >
                <TrashIcon />
              </button>
            )}
          </div>
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
              <button className="btn-link" onClick={() => onDuplicateFormat(selected.id)}>
                duplicate
              </button>
            </div>

            <table className="tbl">
              <thead>
                <tr>
                  {showHour && <th style={{ width: 88 }}>Hour</th>}
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
                {selected.rows.map((row, i) => {
                  const noName = NO_NAME_CATEGORIES.includes(row.category ?? '')
                  return (
                  <tr key={i} className={row.logRow ? 'row-log' : ''}>
                    {showHour && (
                      <td>
                        <select
                          value={row.hour ?? ''}
                          disabled={row.logRow}
                          {...nonTargetFocus}
                          onChange={(e) =>
                            patchRow(i, {
                              hour: e.target.value === '' ? undefined : Number(e.target.value)
                            })
                          }
                        >
                          <option value="">every</option>
                          {HOURS.map((h) => (
                            <option key={h} value={h}>
                              {String(h).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={row.minute}
                        disabled={row.logRow}
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
                        disabled={row.logRow}
                        {...nonTargetFocus}
                        onChange={(e) => patchRow(i, { second: clamp(+e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={row.cue}
                        disabled={row.logRow}
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
                        disabled={row.logRow || noName}
                        placeholder={
                          noName
                            ? 'N/A'
                            : row.logRow
                              ? 'log file name (optional)'
                              : ''
                        }
                        title={noName ? `${row.category} rows have no name/cart` : undefined}
                        {...fieldHandlers(i, 'name')}
                        onChange={(e) => patchRow(i, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      {addingCatRow === i ? (
                        <input
                          autoFocus
                          placeholder="New category"
                          value={newCat}
                          {...nonTargetFocus}
                          onChange={(e) => setNewCat(e.target.value)}
                          onBlur={() => commitNewCategory(i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitNewCategory(i)
                            else if (e.key === 'Escape') {
                              setAddingCatRow(null)
                              setNewCat('')
                            }
                          }}
                        />
                      ) : (
                        <select
                          value={row.logRow ? NEXT_DAY_LOG : row.category ?? ''}
                          {...nonTargetFocus}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === ADD_CATEGORY) {
                              setNewCat('')
                              setAddingCatRow(i)
                            } else if (v === NEXT_DAY_LOG) {
                              configureLogRow(i)
                            } else {
                              // Switching away from NEXT DAY LOG unlocks the row.
                              // MACRO/COMMENT carry no name/cart, so clear it.
                              patchRow(i, {
                                category: v || undefined,
                                logRow: undefined,
                                nextDay: undefined,
                                ...(NO_NAME_CATEGORIES.includes(v) ? { name: '' } : {})
                              })
                            }
                          }}
                        >
                          <option value="">—</option>
                          {row.category && !categories.includes(row.category) && (
                            <option value={row.category}>{row.category}</option>
                          )}
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          <option value={NEXT_DAY_LOG}>📅 NEXT DAY LOG</option>
                          <option value={ADD_CATEGORY}>➕ Add new…</option>
                        </select>
                      )}
                    </td>
                    <td>
                      <input
                        dir="auto"
                        value={row.description ?? ''}
                        disabled={row.logRow}
                        title={row.logRow ? 'Auto-filled — resolves to the next day' : undefined}
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
                  )
                })}
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

function TrashIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
