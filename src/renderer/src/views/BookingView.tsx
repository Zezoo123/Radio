import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, PromoSummary, TemplateGrid, TemplateSummary } from '../../../main/session'
import { DEFAULT_CATEGORIES } from '../../../main/core/format/types'
import { toCalendarDate } from '../App'
import { clampISO, tomorrowISO } from '../lib/dates'

interface Props {
  templates: TemplateSummary[]
  onTemplates: (t: TemplateSummary[]) => void
  onConfig: (c: AppConfig) => void
  /** Jump to the Grid tab (the promos-sheet row lives there). */
  onOpenGrid: () => void
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

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

/** `2026-07-01` → `Wed 01 Jul 2026` (the day it starts/ends, for the inspector). */
function fullDate(iso: string | null): string {
  const d = iso ? toCalendarDate(iso) : null
  if (!d) return '—'
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

/** Seconds → `MM:SS` (empty when unknown). */
function mmss(seconds?: number): string {
  if (seconds == null) return ''
  const s = Math.round(seconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** `2026-07-01`, `2026-12-31` → `Jul–Dec 26` (design-style covers label). */
function coversLabel(first: string | null, last: string | null): string {
  if (!first || !last) return '—'
  const f = toCalendarDate(first)
  const l = toCalendarDate(last)
  if (!f || !l) return '—'
  const fm = MONTH_NAMES[f.month - 1]
  const lm = MONTH_NAMES[l.month - 1]
  const fy = String(f.year).slice(2)
  const ly = String(l.year).slice(2)
  if (f.year !== l.year) return `${fm} ${fy}–${lm} ${ly}`
  if (f.month !== l.month) return `${fm}–${lm} ${ly}`
  return `${fm} ${ly}`
}

/**
 * The BOOKING workbench: every imported audio element in one table, the
 * selected element's whole plan (dates × hours) always in view below it, and a
 * right-hand inspector for the element's code, category and range.
 */
export function BookingView({ templates, onTemplates, onConfig, onOpenGrid }: Props): JSX.Element {
  const [sel, setSel] = useState<number | null>(null)
  const [planMode, setPlanMode] = useState<'grid' | 'text'>('grid')
  const [planGrid, setPlanGrid] = useState<TemplateGrid | null>(null)
  const [planDate, setPlanDate] = useState('')
  const [planText, setPlanText] = useState('')
  const [note, setNote] = useState('')
  const [promos, setPromos] = useState<PromoSummary | null>(null)

  useEffect(() => {
    window.api.getPromos().then(setPromos)
  }, [])

  // Keep the selection valid as elements come and go; default to the first.
  useEffect(() => {
    if (templates.length === 0) {
      if (sel !== null) setSel(null)
      return
    }
    if (sel === null || sel >= templates.length) setSel(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length])

  // (Re)load the selected element's plan grid + text preview.
  useEffect(() => {
    if (sel === null || !templates[sel]) {
      setPlanGrid(null)
      setPlanText('')
      return
    }
    let gone = false
    const t = templates[sel]
    const date = t.firstDate ? clampISO(tomorrowISO(), t.firstDate, t.lastDate) : ''
    setPlanDate(date)
    window.api.templateGrid(sel).then((g) => {
      if (!gone) setPlanGrid(g)
    })
    const d = toCalendarDate(date)
    if (d) {
      window.api.previewTemplate(sel, d, d).then((res) => {
        if (!gone) setPlanText(res.text)
      })
    } else {
      setPlanText('')
    }
    return () => {
      gone = true
    }
  }, [sel, templates])

  async function changePlanDate(date: string): Promise<void> {
    setPlanDate(date)
    if (sel === null) return
    const d = toCalendarDate(date)
    if (!d) {
      setPlanText('')
      return
    }
    const res = await window.api.previewTemplate(sel, d, d)
    setPlanText(res.text)
  }

  // --- Add / remove -----------------------------------------------------------
  async function addFiles(): Promise<void> {
    setNote('')
    onTemplates(await window.api.addTemplates())
  }

  async function addFolder(): Promise<void> {
    const res = await window.api.addTemplatesFolder()
    if (!res) return
    const added = res.templates.length - templates.length
    onTemplates(res.templates)
    setNote(
      added === 0 && res.skipped.length === 0
        ? 'No Excel templates found in that folder'
        : `Imported ${added} template${added === 1 ? '' : 's'} from the folder` +
            (res.skipped.length > 0 ? ` — skipped ${res.skipped.join(', ')}` : '')
    )
  }

  async function addPromosSheet(): Promise<void> {
    const res = await window.api.openPromos()
    if (res) {
      setPromos(res)
      onConfig(await window.api.getConfig())
    }
  }

  async function removeElement(index: number): Promise<void> {
    onTemplates(await window.api.removeTemplate(index))
  }

  // --- Edit code / category ---------------------------------------------------
  async function changeCategory(index: number, category: string): Promise<void> {
    onTemplates(await window.api.setTemplateCategory(index, category))
  }

  /** Commit an edited element code; every exported file name derives from it. */
  async function commitCode(index: number, input: HTMLInputElement): Promise<void> {
    const code = input.value.trim()
    if (!code || code === templates[index].code) {
      input.value = templates[index].code // snap back on empty/unchanged
      return
    }
    onTemplates(await window.api.setTemplateCode(index, code))
    if (sel === index) setPlanGrid(await window.api.templateGrid(index))
  }

  const selected = sel !== null ? (templates[sel] ?? null) : null

  // Show only the span the element actually plays — the sheet may pad a short
  // campaign with months of empty day columns on both sides. Empty days
  // BETWEEN plays stay visible (real gaps in the campaign).
  const shownGrid = useMemo(() => {
    if (!planGrid) return null
    const first = planGrid.totals.findIndex((n) => n > 0)
    if (first === -1) return planGrid // nothing played — show the sheet as-is
    let last = planGrid.totals.length - 1
    while (last > first && planGrid.totals[last] === 0) last--
    if (first === 0 && last === planGrid.totals.length - 1) return planGrid
    return {
      ...planGrid,
      days: planGrid.days.slice(first, last + 1),
      rows: planGrid.rows.map((r) => ({ ...r, cells: r.cells.slice(first, last + 1) })),
      totals: planGrid.totals.slice(first, last + 1)
    }
  }, [planGrid])

  // Tracks used anywhere in the plan. Letters play as `CODE-A`, `CODE-B`…;
  // the special cell value `1` (or a plan with no letters at all) is the
  // element playing as itself — the bare CODE, listed with code "1".
  const tracks = useMemo(() => {
    if (!selected) return []
    const letters = new Set<string>()
    let self = false
    if (planGrid)
      for (const r of planGrid.rows)
        for (const c of r.cells) {
          if (!c) continue
          for (const ch of c) {
            if (/[A-Za-z]/.test(ch)) letters.add(ch.toUpperCase())
            else if (ch === '1') self = true
          }
        }
    const list = [...letters].sort().map((l) => ({ code: l, name: `${selected.code}-${l}` }))
    if (self || list.length === 0) list.unshift({ code: '1', name: selected.code })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planGrid, selected?.code])

  // Durations + descriptions from the app-wide Simian audio database (loads on
  // startup once a path has been saved; LOG's Audio database panel sets it).
  const [dbLoaded, setDbLoaded] = useState(false)
  const [trackInfo, setTrackInfo] = useState<
    Record<string, { duration?: number; description?: string }>
  >({})

  useEffect(() => {
    window.api.getSimianDb().then((s) => setDbLoaded(Boolean(s)))
  }, [])

  useEffect(() => {
    if (!dbLoaded || tracks.length === 0) {
      setTrackInfo({})
      return
    }
    let gone = false
    window.api.simianTracks(tracks.map((t) => t.name)).then((r) => {
      if (!gone) setTrackInfo(r)
    })
    return () => {
      gone = true
    }
  }, [dbLoaded, tracks])

  return (
    <div className="bookwork">
      <div className="work-main">
        <div className="work-head">
          <div>
            <div className="kick">Booking</div>
            <div className="insp-title">
              {templates.length} element{templates.length === 1 ? '' : 's'} booked
            </div>
          </div>
          {note && (
            <span className="muted" style={{ fontSize: 12 }}>
              {note}
            </span>
          )}
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn" title="Pick one or more element templates" onClick={addFiles}>
              + Add file
            </button>
            <button
              className="btn"
              title="Every Excel template inside a directory"
              onClick={addFolder}
            >
              + Add folder
            </button>
            <button
              className="btn primary"
              title="Promo spreadsheet — placement is managed on the Grid tab"
              onClick={addPromosSheet}
            >
              + Promos sheet
            </button>
          </div>
        </div>

        <div className="work-body">
          {templates.length === 0 && !promos ? (
            <p className="empty">Nothing booked yet. Add element templates or the promos sheet.</p>
          ) : (
            <table className="tbl dense-book">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Name</th>
                  <th>Client</th>
                  <th style={{ width: 120 }}>Category</th>
                  <th style={{ width: 60 }}>Spots</th>
                  <th style={{ width: 110 }}>Covers</th>
                  <th>Source file</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <tr
                    key={`${t.code}-${i}`}
                    className={`book-row ${sel === i ? 'sel' : ''}`}
                    onClick={() => setSel(i)}
                  >
                    <td className="mono-sm" style={{ fontWeight: 700 }}>
                      {t.code}
                    </td>
                    <td dir="auto">{t.group}</td>
                    <td>{t.category || '—'}</td>
                    <td>{t.timeCount}</td>
                    <td className="muted">{coversLabel(t.firstDate, t.lastDate)}</td>
                    <td className="muted">{t.fileName}</td>
                  </tr>
                ))}
                {promos && (
                  <>
                    <tr className="book-sep">
                      <td colSpan={6} className="kick">
                        Promos sheet · {promos.programCount} programs
                      </td>
                    </tr>
                    <tr
                      className="book-row"
                      onClick={onOpenGrid}
                      title="Placement is managed on the Grid tab"
                    >
                      <td className="mono-sm">PROMOS</td>
                      <td>{promos.programCount} programs</td>
                      <td>PROMO</td>
                      <td>—</td>
                      <td className="muted">weekly</td>
                      <td className="muted">{promos.fileName}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          )}

          {selected && (
            <div className="plan-block">
              <div className="row" style={{ alignItems: 'baseline', gap: 14 }}>
                <span className="plan-title">{selected.code} — plan</span>
                <span className="kick">
                  One column per day, one row per hour · AAB = A twice and B once
                </span>
                <div className="seg" style={{ marginLeft: 'auto' }}>
                  <button
                    className={`seg-btn ${planMode === 'grid' ? 'on' : ''}`}
                    onClick={() => setPlanMode('grid')}
                  >
                    Grid
                  </button>
                  <button
                    className={`seg-btn ${planMode === 'text' ? 'on' : ''}`}
                    onClick={() => setPlanMode('text')}
                  >
                    Simian text
                  </button>
                </div>
                {planMode === 'text' && (
                  <label className="kick">
                    Date{' '}
                    <input
                      type="date"
                      value={planDate}
                      min={selected.firstDate ?? undefined}
                      max={selected.lastDate ?? undefined}
                      onChange={(e) => changePlanDate(e.target.value)}
                    />
                  </label>
                )}
              </div>

              {planMode === 'grid' && shownGrid && (
                <div className="tpl-grid-scroll">
                  <table className="tgrid">
                    <thead>
                      <tr className="t-month-row">
                        <th className="t-time" />
                        {monthGroups(shownGrid.days).map((g) => (
                          <th key={g.label} colSpan={g.span} className="t-month">
                            <span className="t-mlabel">{g.label}</span>
                          </th>
                        ))}
                        <th className="t-count" />
                      </tr>
                      <tr>
                        <th className="t-time">Time</th>
                        {shownGrid.days.map((d) => (
                          <th key={d.iso} title={d.iso}>
                            {d.day}
                            <span className="t-wd">{d.weekday}</span>
                          </th>
                        ))}
                        <th className="t-count">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownGrid.rows.map((r) => (
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
                        {shownGrid.totals.map((n, ti) => (
                          <td key={ti} className="t-total">
                            {n || ''}
                          </td>
                        ))}
                        <td className="t-count">{shownGrid.totals.reduce((a, b) => a + b, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {planMode === 'text' && (
                <textarea
                  className="preview"
                  readOnly
                  value={planText || '(no rows for this date)'}
                  spellCheck={false}
                  dir="auto"
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="work-insp">
        {!selected ? (
          <p className="empty">Select an element to inspect it.</p>
        ) : (
          <>
            <div>
              <div className="kick">Selected element</div>
              <div className="insp-title">{selected.code}</div>
            </div>

            <div className="insp-field">
              <span className="kick">Element name — export file names follow it</span>
              <input
                key={`${selected.code}-${sel}`}
                defaultValue={selected.code}
                spellCheck={false}
                title="Edit and press Enter — exported files are named CODE, CODE-A, …"
                onBlur={(e) => sel !== null && commitCode(sel, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </div>
            <div className="insp-field">
              <span className="kick">Category</span>
              <select
                value={selected.category}
                onChange={(e) => sel !== null && changeCategory(sel, e.target.value)}
              >
                {(DEFAULT_CATEGORIES.includes(selected.category)
                  ? DEFAULT_CATEGORIES
                  : [selected.category, ...DEFAULT_CATEGORIES]
                ).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="insp-sec">
              <div className="kick">This plan</div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div>
                  <span className="muted">Client</span> <span dir="auto">{selected.group}</span>
                </div>
                <div>
                  <span className="muted">Spots</span> {selected.timeCount}
                </div>
                <div>
                  <span className="muted">Covers</span>{' '}
                  {coversLabel(selected.firstDate, selected.lastDate)}
                </div>
                <div>
                  <span className="muted">Starts</span> {fullDate(selected.firstDate)}
                </div>
                <div>
                  <span className="muted">Ends</span> {fullDate(selected.lastDate)}
                </div>
              </div>
              <div className="kick" style={{ marginTop: 4 }}>
                Tracks in this plan
              </div>
              <table className="tbl insp-tbl track-tbl">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Dur</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((t) => (
                    <tr key={t.code} title={t.name}>
                      <td className="mono-sm">{t.code}</td>
                      <td className="mono-sm">{mmss(trackInfo[t.name]?.duration)}</td>
                      <td dir="auto" title={trackInfo[t.name]?.description ?? t.name}>
                        {trackInfo[t.name]?.description ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dbLoaded && (
                <div className="muted" style={{ fontSize: 12 }}>
                  Duration and description fill in from the audio database (load it once in LOG →
                  Audio database — it stays loaded from then on).
                </div>
              )}
            </div>

            <div className="insp-foot">
              <button
                className="btn"
                onClick={() => sel !== null && removeElement(sel)}
                title="Remove this element from the session (the source file is untouched)"
              >
                Remove element
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
