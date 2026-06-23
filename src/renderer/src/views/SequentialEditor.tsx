import { useEffect, useState } from 'react'
import type { Sequential, SequentialMode } from '../../../main/core/sequential/types'
import { sequentialValues } from '../../../main/core/sequential/values'
import { substituteDateTokens } from '../../../main/core/format/tokens'

function today(): { year: number; month: number; day: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

interface Props {
  open: boolean
  /** Sequential being edited, or null to create a new one. */
  initial: Sequential | null
  onSaved: (list: Sequential[]) => void
  onDeleted: (list: Sequential[]) => void
  onClose: () => void
}

const BLANK = { name: '', mode: 'numerical' as SequentialMode, start: '0', end: '9', randomize: false }

export function SequentialEditor({
  open,
  initial,
  onSaved,
  onDeleted,
  onClose
}: Props): JSX.Element | null {
  const [name, setName] = useState(BLANK.name)
  const [mode, setMode] = useState<SequentialMode>(BLANK.mode)
  const [start, setStart] = useState(BLANK.start)
  const [end, setEnd] = useState(BLANK.end)
  const [randomize, setRandomize] = useState(BLANK.randomize)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setMode(initial.mode)
      setStart(initial.start)
      setEnd(initial.end)
      setRandomize(initial.randomize)
    } else {
      setName(BLANK.name)
      setMode(BLANK.mode)
      setStart(mode === 'alphabetical' ? 'A' : BLANK.start)
      setEnd(mode === 'alphabetical' ? 'F' : BLANK.end)
      setRandomize(BLANK.randomize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  if (!open) return null

  const draft: Sequential = {
    id: initial?.id ?? '',
    name: name.trim(),
    mode,
    start,
    end,
    randomize,
    queue: []
  }
  // Show the values with date tokens resolved for today, so the auto-populated
  // date is visible (export uses the chosen export date).
  const values = sequentialValues(draft).map((v) => substituteDateTokens(v, today()))
  const sample = values.length > 6 ? [...values.slice(0, 5), '…', values[values.length - 1]] : values

  async function save(): Promise<void> {
    if (!draft.name) return
    const seq: Sequential = { ...draft, id: initial?.id ?? crypto.randomUUID() }
    onSaved(await window.api.saveSequential(seq))
    onClose()
  }

  async function remove(): Promise<void> {
    if (!initial) return
    onDeleted(await window.api.deleteSequential(initial.id))
    onClose()
  }

  function switchMode(next: SequentialMode): void {
    setMode(next)
    if (next === 'alphabetical') {
      setStart('A')
      setEnd('F')
    } else {
      setStart('0')
      setEnd('9')
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial ? 'Edit sequential' : 'New sequential'}</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-grid">
          <label>Prefix (file name)</label>
          <div className="row">
            <input
              value={name}
              placeholder="e.g. JNG"
              onChange={(e) => setName(e.target.value)}
              style={{ minWidth: 160 }}
            />
            <span className="muted">→ {name || 'PREFIX'}-##</span>
          </div>

          <label>Type</label>
          <div className="row seg">
            <button
              className={`seg-btn ${mode === 'numerical' ? 'on' : ''}`}
              onClick={() => switchMode('numerical')}
            >
              Numerical
            </button>
            <button
              className={`seg-btn ${mode === 'alphabetical' ? 'on' : ''}`}
              onClick={() => switchMode('alphabetical')}
            >
              Alphabetical
            </button>
          </div>

          <label>Range</label>
          <div className="row">
            <input value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 70 }} />
            <span className="muted">to</span>
            <input value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 70 }} />
          </div>

          <label>Order</label>
          <label className="check">
            <input
              type="checkbox"
              checked={randomize}
              onChange={(e) => setRandomize(e.target.checked)}
            />
            Randomize (shuffle each cycle; still all distinct per cycle)
          </label>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <span className="muted">Rotates through {values.length} file name(s): </span>
          {values.length ? (
            <code>{sample.join(', ')}</code>
          ) : (
            <span className="empty">invalid range</span>
          )}
          <p className="muted" style={{ margin: '6px 0 0' }}>
            These are the names written into the log; Simian looks them up in its own database.
          </p>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          {initial ? (
            <button className="btn-link" onClick={remove}>
              delete
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!draft.name || !values.length} onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
