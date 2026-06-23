import { TOKEN_PRESETS, substituteDateTokens } from '../../../main/core/format/tokens'

interface Props {
  open: boolean
  /** Where the insert will land, e.g. "Row 2 · Name", or null if nothing focused. */
  targetLabel: string | null
  onPick: (text: string) => void
  onClose: () => void
}

// A fixed sample date just for the preview column (Thu 2026-06-18).
const SAMPLE = { year: 2026, month: 6, day: 18 }

/**
 * Popup for inserting items into a clock field. Currently offers date tokens;
 * structured as groups so more insert types (time tokens, counters, custom
 * snippets) can be added later.
 */
export function InsertDialog({ open, targetLabel, onPick, onClose }: Props): JSX.Element | null {
  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
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

        <div className="insert-group">
          <h3>Date tokens</h3>
          <p className="muted">Filled in with the export date when you export.</p>
          <div className="insert-list">
            {TOKEN_PRESETS.map((t) => (
              <button
                key={t.token}
                className="insert-item"
                disabled={!targetLabel}
                onClick={() => onPick(t.token)}
              >
                <span className="insert-label">{t.label}</span>
                <code>{t.token}</code>
                <span className="muted">e.g. {substituteDateTokens(t.token, SAMPLE)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
