import { useState } from 'react'
import type { AppConfig, TemplateGrid, TemplateSummary } from '../../../main/session'
import { DEFAULT_CATEGORIES } from '../../../main/core/format/types'
import { toCalendarDate } from '../App'
import { clampISO, tomorrowISO } from '../lib/dates'
import PageHelp from '../components/PageHelp'

interface Props {
  templates: TemplateSummary[]
  onTemplates: (t: TemplateSummary[]) => void
  onConfig: (c: AppConfig) => void
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Consecutive same-month day columns collapsed into one labeled span. */
function monthGroups(days: TemplateGrid['days']): { label: string; span: number }[] {
  const groups: { label: string; span: number }[] = []
  for (const d of days) {
    const label = `${MONTH_NAMES[d.month - 1]} ${d.iso.slice(0, 4)}`
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.span++
    else groups.push({ label, span: 1 })
  }
  return groups
}

export function ImportView({ templates, onTemplates, onConfig }: Props): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewMode, setPreviewMode] = useState<'grid' | 'text'>('grid')
  const [previewGrid, setPreviewGrid] = useState<TemplateGrid | null>(null)
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
    // Default to tomorrow (the day being scheduled), clamped into the range
    // the template actually covers.
    const t = templates[index]
    const date = t.firstDate ? clampISO(tomorrowISO(), t.firstDate, t.lastDate) : ''
    setPreviewIndex(index)
    setPreviewDate(date)
    setPreviewGrid(await window.api.templateGrid(index))
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

  /** Commit an edited element code; every exported file name derives from it. */
  async function commitCode(index: number, input: HTMLInputElement): Promise<void> {
    const code = input.value.trim()
    if (!code || code === templates[index].code) {
      input.value = templates[index].code // snap back on empty/unchanged
      return
    }
    onTemplates(await window.api.setTemplateCode(index, code))
    if (previewIndex === index) {
      setPreviewGrid(await window.api.templateGrid(index))
      await runPreview(index, previewDate)
    }
  }

  const hasItems = templates.length > 0

  return (
    <div className="view">
      <div className="card-head">
        <h1>
          Import
          <PageHelp>Add audio element templates and promos to build this schedule.</PageHelp>
        </h1>
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
                  <td>
                    <input
                      key={`${t.code}-${i}`}
                      defaultValue={t.code}
                      spellCheck={false}
                      title="Element code — exported file names derive from it (CODE, CODE-A, …). Edit and press Enter."
                      style={{ width: 110 }}
                      onBlur={(e) => commitCode(i, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                    />
                  </td>
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
                <div className="row">
                  <div className="row seg">
                    <button
                      className={`seg-btn ${previewMode === 'grid' ? 'on' : ''}`}
                      onClick={() => setPreviewMode('grid')}
                    >
                      Grid
                    </button>
                    <button
                      className={`seg-btn ${previewMode === 'text' ? 'on' : ''}`}
                      onClick={() => setPreviewMode('text')}
                    >
                      Simian text
                    </button>
                  </div>
                  {previewMode === 'text' && (
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
                  )}
                </div>
              </div>

              {previewMode === 'grid' && previewGrid && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    The whole plan at a glance: one column per day, one row per hour, each cell
                    every track played that hour, sorted — e.g. AAB = A twice and B once,
                    whatever the minutes ({previewGrid.days[0]?.iso ?? '—'} to{' '}
                    {previewGrid.days[previewGrid.days.length - 1]?.iso ?? '—'}).
                  </p>
                  <div className="tpl-grid-scroll">
                    <table className="tgrid">
                      <thead>
                        <tr className="t-month-row">
                          <th className="t-time" />
                          {monthGroups(previewGrid.days).map((g) => (
                            <th key={g.label} colSpan={g.span} className="t-month">
                              <span className="t-mlabel">{g.label}</span>
                            </th>
                          ))}
                          <th className="t-count" />
                        </tr>
                        <tr>
                          <th className="t-time">Time</th>
                          {previewGrid.days.map((d) => (
                            <th key={d.iso} title={d.iso}>
                              {d.day}
                              <span className="t-wd">{d.weekday}</span>
                            </th>
                          ))}
                          <th className="t-count">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewGrid.rows.map((r) => (
                          <tr key={r.time}>
                            <td className="t-time">{r.time.slice(0, 5)}</td>
                            {r.cells.map((c, ci) => (
                              <td key={ci} className={c ? 't-cell' : ''}>
                                {c ?? ''}
                              </td>
                            ))}
                            <td className="t-count">{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="t-time">Total</td>
                          {previewGrid.totals.map((n, ti) => (
                            <td key={ti} className="t-total">
                              {n || ''}
                            </td>
                          ))}
                          <td className="t-count">
                            {previewGrid.totals.reduce((a, b) => a + b, 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}

              {previewMode === 'text' && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Just this template, composed into Simian lines for the chosen date (covers{' '}
                    {templates[previewIndex].firstDate ?? '—'} to{' '}
                    {templates[previewIndex].lastDate ?? '—'}).
                  </p>
                  <textarea
                    className="preview"
                    readOnly
                    value={previewText || '(no rows for this date)'}
                    spellCheck={false}
                    dir="auto"
                  />
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
