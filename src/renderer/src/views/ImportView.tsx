import { useState } from 'react'
import type { AppConfig, AzanSummary, TemplateSummary } from '../../../main/session'
import { DEFAULT_CATEGORIES } from '../../../main/core/format/types'
import { toCalendarDate } from '../App'

interface Props {
  templates: TemplateSummary[]
  azan: AzanSummary | null
  config: AppConfig | null
  onTemplates: (t: TemplateSummary[]) => void
  onAzan: (a: AzanSummary | null) => void
  onConfig: (c: AppConfig) => void
}

export function ImportView({
  templates,
  azan,
  config,
  onTemplates,
  onAzan,
  onConfig
}: Props): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewDate, setPreviewDate] = useState('')
  const [previewText, setPreviewText] = useState('')
  const athanMode = config?.athanMode ?? 'off'

  // --- Add menu actions ---
  async function addAudio(): Promise<void> {
    setMenuOpen(false)
    onTemplates(await window.api.addTemplates())
  }

  async function addAthanImport(): Promise<void> {
    setMenuOpen(false)
    onConfig(await window.api.setAthanMode('import'))
    const summary = await window.api.openAzan()
    if (summary) onAzan(summary)
  }

  async function addAthanCalculate(): Promise<void> {
    setMenuOpen(false)
    onConfig(await window.api.setAthanMode('calculate'))
  }

  // --- List actions ---
  async function removeTemplate(index: number): Promise<void> {
    if (previewIndex !== null) setPreviewIndex(null)
    onTemplates(await window.api.removeTemplate(index))
  }

  async function runPreview(index: number, date: string): Promise<void> {
    const d = toCalendarDate(date)
    if (!d) {
      setPreviewText('')
      return
    }
    const res = await window.api.previewTemplate(index, d, d)
    setPreviewText(res.text)
  }

  async function togglePreview(index: number): Promise<void> {
    if (previewIndex === index) {
      setPreviewIndex(null)
      return
    }
    const date = templates[index].firstDate ?? ''
    setPreviewIndex(index)
    setPreviewDate(date)
    await runPreview(index, date)
  }

  async function changePreviewDate(date: string): Promise<void> {
    setPreviewDate(date)
    if (previewIndex !== null) await runPreview(previewIndex, date)
  }

  async function changeCategory(index: number, category: string): Promise<void> {
    onTemplates(await window.api.setTemplateCategory(index, category))
    if (previewIndex === index) await runPreview(index, previewDate)
  }

  async function removeAthan(): Promise<void> {
    onConfig(await window.api.setAthanMode('off'))
  }

  async function replaceAzan(): Promise<void> {
    const summary = await window.api.openAzan()
    if (summary) onAzan(summary)
  }

  const hasItems = templates.length > 0 || athanMode !== 'off'

  return (
    <div className="view">
      <div className="card-head">
        <h1>Import</h1>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setMenuOpen((o) => !o)}>
            Add ▾
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu">
                <button className="menu-item" onClick={addAudio}>
                  <strong>Audio</strong>
                  <span className="muted">Element template · category AUDIO</span>
                </button>
                <button className="menu-item" onClick={addAthanImport}>
                  <strong>Athan — import file</strong>
                  <span className="muted">From an AZAN month · category ATHAN</span>
                </button>
                <button className="menu-item" onClick={addAthanCalculate}>
                  <strong>Athan — calculate</strong>
                  <span className="muted">Computed for Cairo · category ATHAN</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="muted">Add audio element templates and the athan to build this schedule.</p>

      {!hasItems && (
        <p className="empty">Nothing added yet. Use “Add” to import audio or the athan.</p>
      )}

      {templates.length > 0 && (
        <section className="card">
          <h2>Audio</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Category</th>
                <th>Group</th>
                <th>Code</th>
                <th>Times</th>
                <th>File</th>
                <th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr key={`${t.code}-${i}`} className={previewIndex === i ? 'row-log' : ''}>
                  <td>
                    <select value={t.category} onChange={(e) => changeCategory(i, e.target.value)}>
                      {(DEFAULT_CATEGORIES.includes(t.category)
                        ? DEFAULT_CATEGORIES
                        : [t.category, ...DEFAULT_CATEGORIES]
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{t.group}</td>
                  <td>{t.code}</td>
                  <td>{t.timeCount}</td>
                  <td className="muted">{t.fileName}</td>
                  <td>
                    <button className="btn-link" onClick={() => togglePreview(i)}>
                      {previewIndex === i ? 'hide' : 'preview'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => removeTemplate(i)}>
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {previewIndex !== null && templates[previewIndex] && (
            <div style={{ marginTop: 12 }}>
              <div className="card-head">
                <h2>
                  Preview — {templates[previewIndex].code}{' '}
                  <span className="pill">{templates[previewIndex].category || '—'}</span>
                </h2>
                <label>
                  Date{' '}
                  <input
                    type="date"
                    value={previewDate}
                    min={templates[previewIndex].firstDate ?? undefined}
                    max={templates[previewIndex].lastDate ?? undefined}
                    onChange={(e) => changePreviewDate(e.target.value)}
                  />
                </label>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Just this template, composed into Simian lines for the chosen date (covers{' '}
                {templates[previewIndex].firstDate ?? '—'} to {templates[previewIndex].lastDate ?? '—'}).
              </p>
              <textarea
                className="preview"
                readOnly
                value={previewText || '(no rows for this date)'}
                spellCheck={false}
                dir="auto"
              />
            </div>
          )}
        </section>
      )}

      {athanMode !== 'off' && (
        <section className="card">
          <div className="card-head">
            <h2>
              Athan <span className="pill">ATHAN</span>
            </h2>
            <button className="btn-link" onClick={removeAthan}>
              remove
            </button>
          </div>

          {athanMode === 'calculate' ? (
            <p className="muted">
              Computed for Cairo (Egyptian General Authority of Survey). Approximate — about a minute
              off the official timetable. Add “Athan — import file” for exact times.
            </p>
          ) : (
            <>
              <div className="row">
                <span className="muted">Imported from an AZAN month file.</span>
                <button className="btn" onClick={replaceAzan}>
                  {azan ? 'Replace AZAN file…' : 'Open AZAN month…'}
                </button>
              </div>
              {azan ? (
                <div className="grid-info" style={{ marginTop: 10 }}>
                  <div>
                    <span className="k">File</span> {azan.fileName}
                  </div>
                  <div>
                    <span className="k">Months</span> {azan.months.join(', ')}
                  </div>
                  <div>
                    <span className="k">Days</span> {azan.dayCount}
                  </div>
                </div>
              ) : (
                <p className="empty">No athan file loaded yet.</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
