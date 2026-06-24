import { useEffect, useState } from 'react'
import { TOKEN_PRESETS, substituteDateTokens } from '../../../main/core/format/tokens'
import type { Sequential } from '../../../main/core/sequential/types'
import { SequentialEditor } from './SequentialEditor'

interface Props {
  open: boolean
  /** Where the insert will land, e.g. "Row 2 · Name", or null if nothing focused. */
  targetLabel: string | null
  onPick: (text: string) => void
  onClose: () => void
}

type Category = 'date' | 'sequential' | 'nextday'

// Fixed sample dates just for the previews (Thu 2026-06-18, and the next day).
const SAMPLE = { year: 2026, month: 6, day: 18 }
const NEXT_SAMPLE = { year: 2026, month: 6, day: 19 }

/** Categorized insert popup: Date tokens and Sequentials. */
export function InsertDialog({ open, targetLabel, onPick, onClose }: Props): JSX.Element | null {
  const [category, setCategory] = useState<Category>('date')
  const [sequentials, setSequentials] = useState<Sequential[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Sequential | null>(null)

  useEffect(() => {
    if (open) window.api.listSequentials().then(setSequentials)
  }, [open])

  if (!open) return null

  const disabled = !targetLabel

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal wide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Insert</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>

        {targetLabel ? (
          <p className="muted">Inserting into: {targetLabel}</p>
        ) : (
          <p className="empty">Click into a Name or Description field first, then Insert.</p>
        )}

        <div className="insert-cols">
          <div className="insert-cats">
            <button
              className={`cat-item ${category === 'date' ? 'on' : ''}`}
              onClick={() => setCategory('date')}
            >
              Date
            </button>
            <button
              className={`cat-item ${category === 'sequential' ? 'on' : ''}`}
              onClick={() => setCategory('sequential')}
            >
              Sequential
            </button>
            <button
              className={`cat-item ${category === 'nextday' ? 'on' : ''}`}
              onClick={() => setCategory('nextday')}
            >
              Next day
            </button>
          </div>

          <div className="insert-body">
            {category === 'date' && (
              <>
                <p className="muted">Filled in with the export date when you export.</p>
                <div className="insert-list">
                  {TOKEN_PRESETS.map((t) => (
                    <button
                      key={t.token}
                      className="insert-item"
                      disabled={disabled}
                      onClick={() => onPick(t.token)}
                    >
                      <span className="insert-label">{t.label}</span>
                      <code>{t.token}</code>
                      <span className="muted">e.g. {substituteDateTokens(t.token, SAMPLE)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {category === 'sequential' && (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Rotating prefixes — inserted as {'{name}'}.</span>
                  <button
                    className="btn"
                    onClick={() => {
                      setEditing(null)
                      setEditorOpen(true)
                    }}
                  >
                    + New
                  </button>
                </div>
                <div className="insert-list" style={{ marginTop: 8 }}>
                  {sequentials.length === 0 && (
                    <p className="empty">No sequentials yet. Click “New” to create one.</p>
                  )}
                  {sequentials.map((s) => (
                    <div key={s.id} className="insert-item seq-row">
                      <button
                        className="seq-pick"
                        disabled={disabled}
                        onClick={() => onPick(`{${s.name}}`)}
                      >
                        <code>{`{${s.name}}`}</code>
                        <span className="muted">
                          {s.mode === 'numerical' ? '#' : 'A–Z'} {s.start}–{s.end}
                          {s.randomize ? ' · random' : ''}
                        </span>
                      </button>
                      <button
                        className="btn-link"
                        onClick={() => {
                          setEditing(s)
                          setEditorOpen(true)
                        }}
                      >
                        edit
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {category === 'nextday' && (
              <>
                <p className="muted">
                  Inserts <strong>tomorrow&apos;s</strong> date. Used for the LOG row that tells Simian
                  to load the next day&apos;s log (Category <code>LOG</code> in the last hour). Note:
                  any date in that row resolves to the next day.
                </p>
                <div className="insert-list">
                  {TOKEN_PRESETS.map((t) => (
                    <button
                      key={t.token}
                      className="insert-item"
                      disabled={disabled}
                      onClick={() => onPick(`${t.token}[NEXT]`)}
                    >
                      <span className="insert-label">{t.label}</span>
                      <code>{t.token}</code>
                      <span className="muted">e.g. {substituteDateTokens(t.token, NEXT_SAMPLE)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <SequentialEditor
        open={editorOpen}
        initial={editing}
        onSaved={setSequentials}
        onDeleted={setSequentials}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
