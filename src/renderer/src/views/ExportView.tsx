import { useEffect, useState } from 'react'
import type { AppConfig, TemplateSummary } from '../../../main/session'
import { toCalendarDate } from '../App'
import PageHelp from '../components/PageHelp'

interface Props {
  templates: TemplateSummary[]
  config: AppConfig | null
  onConfig: (c: AppConfig) => void
  /** Hand the current grid to the Editor tab (no file round-trip needed). */
  onEdit: (text: string) => void
}

export function ExportView({ templates, config, onConfig, onEdit }: Props): JSX.Element {
  const [start, setStart] = useState('2026-06-01')
  const [end, setEnd] = useState('2026-06-01')
  const [preview, setPreview] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [hasFormats, setHasFormats] = useState(false)

  // Re-checked each time the tab mounts, so it reflects the latest saved Formats.
  useEffect(() => {
    window.api.hasFormats().then(setHasFormats)
  }, [])

  const ready =
    hasFormats ||
    templates.length > 0 ||
    Boolean(config?.includeAzan) ||
    Boolean(config?.hasPromos)
  const hourly = config?.hourly ?? { enabled: false, startHour: 0, endHour: 23 }

  async function updateHourly(patch: Partial<typeof hourly>): Promise<void> {
    onConfig(await window.api.setHourly({ ...hourly, ...patch }))
  }

  async function toggleAzan(include: boolean): Promise<void> {
    onConfig(await window.api.setIncludeAzan(include))
  }

  async function togglePromos(include: boolean): Promise<void> {
    onConfig(await window.api.setIncludePromos(include))
  }
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
      <h1>
        Export
        <PageHelp>
          Pick a single day or a date range, preview the Simian log, then export. Each day combines
          the Formats week-grid schedule with the imported audio templates and AZAN. A single day is
          just the same start and end date.
        </PageHelp>
      </h1>

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
          <button
            className="btn"
            disabled={!preview}
            title="Send the previewed log to the Editor tab without exporting first"
            onClick={() => onEdit(preview)}
          >
            Edit in Editor
          </button>
          {status && <span className="muted">{status}</span>}
        </div>
        {!ready && (
          <p className="empty">
            Paint a Formats week grid, or import audio templates first (or tick “Include AZAN”).
          </p>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={config?.includeAzan ?? false}
              onChange={(e) => toggleAzan(e.target.checked)}
            />
            Include AZAN
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hourly.enabled}
              onChange={(e) => updateHourly({ enabled: e.target.checked })}
            />
            Hourly comment markers
          </label>
          {hourly.enabled && (
            <>
              <label>
                Hours{' '}
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hourly.startHour}
                  onChange={(e) => updateHourly({ startHour: +e.target.value })}
                  style={{ width: 56 }}
                />
              </label>
              <label>
                to{' '}
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hourly.endHour}
                  onChange={(e) => updateHourly({ endHour: +e.target.value })}
                  style={{ width: 56 }}
                />
              </label>
            </>
          )}
          {config?.hasPromos && (
            <label className="check">
              <input
                type="checkbox"
                checked={config?.includePromos ?? true}
                onChange={(e) => togglePromos(e.target.checked)}
              />
              Include promos
            </label>
          )}
        </div>
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
