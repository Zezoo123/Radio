import { useState } from 'react'
import type { AppConfig, TemplateSummary } from '../../../main/session'
import { DEFAULT_CATEGORIES } from '../../../main/core/format/types'
import { toCalendarDate } from '../App'

interface Props {
  templates: TemplateSummary[]
  onTemplates: (t: TemplateSummary[]) => void
  onConfig: (c: AppConfig) => void
}

export function ImportView({ templates, onTemplates, onConfig }: Props): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewDate, setPreviewDate] = useState('')
  const [previewText, setPreviewText] = useState('')

  // --- Add menu actions ---
  async function addAudio(): Promise<void> {
    setMenuOpen(false)
    onTemplates(await window.api.addTemplates())
  }

  async function addPromos(): Promise<void> {
    setMenuOpen(false)
    const res = await window.api.openPromos()
    if (res) onConfig(await window.api.getConfig())
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

  const hasItems = templates.length > 0

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
                <button className="menu-item" onClick={addPromos}>
                  <strong>Promos</strong>
                  <span className="muted">Promo spreadsheet · edit in the Promos tab</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="muted">Add audio element templates and promos to build this schedule.</p>

      {!hasItems && (
        <p className="empty">Nothing added yet. Use “Add” to import audio or promos.</p>
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
    </div>
  )
}
