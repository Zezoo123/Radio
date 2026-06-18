import { useState } from 'react'
import type { AzanSummary, GridSummary, TemplateSummary } from '../../../main/session'
import { toCalendarDate } from '../App'

interface Props {
  grid: GridSummary | null
  templates: TemplateSummary[]
  azan: AzanSummary | null
}

export function ExportView({ grid, templates, azan }: Props): JSX.Element {
  const [start, setStart] = useState('2026-06-01')
  const [end, setEnd] = useState('2026-06-01')
  const [preview, setPreview] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [status, setStatus] = useState('')

  const ready = Boolean(grid) || templates.length > 0 || Boolean(azan)
  const range = (): [ReturnType<typeof toCalendarDate>, ReturnType<typeof toCalendarDate>] => [
    toCalendarDate(start),
    toCalendarDate(end)
  ]

  async function doPreview(): Promise<void> {
    const [s, e] = range()
    if (!s || !e) return
    const res = await window.api.preview(s, e)
    setPreview(res.text)
    setWarnings(res.warnings)
    setStatus(`${res.text.split('\r\n').filter(Boolean).length} rows`)
  }

  async function doExport(): Promise<void> {
    const [s, e] = range()
    if (!s || !e) return
    const res = await window.api.exportLog(s, e)
    setWarnings(res.warnings)
    setStatus(res.saved ? `Saved to ${res.path}` : 'Export cancelled')
  }

  return (
    <div className="view">
      <h1>Export</h1>
      <p className="muted">
        Pick a single day or a date range, preview the Simian log, then export. A single day is just
        the same start and end date.
      </p>

      <section className="card">
        <div className="row">
          <label>
            From <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            To <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button className="btn" disabled={!ready} onClick={doPreview}>
            Preview
          </button>
          <button className="btn primary" disabled={!ready} onClick={doExport}>
            Export…
          </button>
          {status && <span className="muted">{status}</span>}
        </div>
        {!ready && <p className="empty">Load a grid or templates on the Import tab first.</p>}
      </section>

      {warnings.length > 0 && (
        <section className="card warn">
          <h2>Warnings ({warnings.length})</h2>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <textarea className="preview" readOnly value={preview} spellCheck={false} dir="auto" />
    </div>
  )
}
