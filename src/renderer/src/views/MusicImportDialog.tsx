import { useEffect, useState } from 'react'
import type { FieldPos, MusicImportSettings, MusicRow } from '../../../main/core/parsers/musicLog'

interface Props {
  open: boolean
  /** Name of the loaded music log, if any — enables the Test table. */
  musicFileName: string | null
  /** Fired after Save Changes so the caller can refresh the parsed summary. */
  onSaved: () => void
  onClose: () => void
}

/** The dialog's rows, in the same order as Simian's Log Import dialog. */
const FIELDS: { key: keyof MusicImportSettings; label: string }[] = [
  { key: 'cue', label: 'Cue' },
  { key: 'time', label: 'Time' },
  { key: 'name', label: 'Name' },
  { key: 'length', label: 'Length' },
  { key: 'category', label: 'Category' },
  { key: 'desc', label: 'Desc.' }
]

const TEST_ROWS = 30

/**
 * The Music Log import settings — a mirror of Simian's Tools → Program
 * Options → Log Import (Music, Position Dependent): each field is located by
 * a 1-based START column and a LENGTH. Test parses the first rows of the
 * loaded music log with the edited (unsaved) positions, like Simian's Test
 * button; Save Changes persists them for every later import and rebuild.
 */
export function MusicImportDialog({
  open,
  musicFileName,
  onSaved,
  onClose
}: Props): JSX.Element | null {
  const [settings, setSettings] = useState<MusicImportSettings | null>(null)
  const [rows, setRows] = useState<MusicRow[] | null>(null)
  const [status, setStatus] = useState('')

  // Fresh persisted settings (and a fresh test run) each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setRows(null)
    setStatus('')
    window.api.getMusicImportSettings().then((s) => {
      setSettings(s)
      if (musicFileName) window.api.musicPreviewRows(TEST_ROWS, s).then(setRows)
    })
  }, [open, musicFileName])

  // Escape closes the dialog, like every overlay in the app.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !settings) return null

  function setPos(key: keyof MusicImportSettings, patch: Partial<FieldPos>): void {
    setSettings((s) => (s ? { ...s, [key]: { ...s[key], ...patch } } : s))
    setStatus('')
  }

  async function test(): Promise<void> {
    if (!settings) return
    setRows(await window.api.musicPreviewRows(TEST_ROWS, settings))
  }

  async function save(): Promise<void> {
    if (!settings) return
    setSettings(await window.api.saveMusicImportSettings(settings))
    setStatus('Saved — applies to the loaded log and every later import')
    onSaved()
  }

  const posInput = (key: keyof MusicImportSettings, prop: keyof FieldPos): JSX.Element => (
    <input
      type="number"
      min={0}
      value={settings[key][prop]}
      onChange={(e) => setPos(key, { [prop]: Math.max(0, Math.trunc(+e.target.value || 0)) })}
      style={{ width: 64 }}
    />
  )

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal wide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Music Log import settings</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
          Position dependent, like Simian&apos;s Log Import: each field starts at column START (the
          first character of a line is column 1) and is LENGTH characters long. START 0 disables a
          field. Rows without a valid Time become comment rows.
        </p>

        <table className="tbl" style={{ width: 'auto' }}>
          <thead>
            <tr>
              <th />
              <th>Start</th>
              <th>Length</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => (
              <tr key={f.key}>
                <td style={{ fontWeight: 600 }}>{f.label}</td>
                <td>{posInput(f.key, 'start')}</td>
                <td>{posInput(f.key, 'length')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="row">
            <button className="btn" disabled={!musicFileName} onClick={test}>
              Test
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              {musicFileName
                ? `parses the first ${TEST_ROWS} lines of ${musicFileName}`
                : 'import a music log to test against'}
            </span>
          </span>
          <span className="row">
            <button className="btn" onClick={onClose}>
              Close
            </button>
            <button className="btn primary" onClick={save}>
              Save Changes
            </button>
          </span>
        </div>
        {status && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {status}
          </div>
        )}

        {rows && (
          <div style={{ marginTop: 12, maxHeight: 260, overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Name</th>
                  <th>Length</th>
                  <th>Category</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) =>
                  r.kind === 'comment' ? (
                    <tr key={i}>
                      <td className="muted">comment</td>
                      <td className="muted" colSpan={4} dir="auto">
                        {r.text}
                      </td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td>{r.time}</td>
                      <td>{r.name}</td>
                      <td>{r.lengthSec != null ? formatLength(r.lengthSec) : ''}</td>
                      <td dir="auto">{r.category}</td>
                      <td dir="auto">{r.description}</td>
                    </tr>
                  )
                )}
                {rows.length === 0 && (
                  <tr>
                    <td className="muted" colSpan={5}>
                      Nothing parsed — check the field positions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Seconds → `M:SS` for the test table's Length column. */
function formatLength(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
