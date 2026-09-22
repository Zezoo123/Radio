import { Fragment, useEffect, useMemo, useState } from 'react'
import type { AppConfig, PromoSummary, TemplateGrid, TemplateSummary } from '../../../main/session'
import { toCalendarDate } from '../App'
import { AiredCheckDialog } from './AiredCheckDialog'

interface Props {
  templates: TemplateSummary[]
  onTemplates: (t: TemplateSummary[]) => void
  onConfig: (c: AppConfig) => void
  /** THE app-wide category list (Settings → Categories). */
  categories: string[]
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

/** Seconds → `MM:SS` (empty when unknown). */
function mmss(seconds?: number): string {
  if (seconds == null) return ''
  const s = Math.round(seconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The BOOKING workbench: every imported Booking element in one table, the
 * selected element's whole plan (dates × hours) always in view below it, and a
 * right-hand inspector for the element's code, category and range.
 */
export function BookingView({ templates, onTemplates, onConfig, categories }: Props): JSX.Element {
  const [sel, setSel] = useState<number | null>(null)
  const [planMode, setPlanMode] = useState<'grid' | 'text'>('grid')
  const [planGrid, setPlanGrid] = useState<TemplateGrid | null>(null)
  // Simian-text preview range — defaults to the plan's full played span.
  const [planStart, setPlanStart] = useState('')
  const [planEnd, setPlanEnd] = useState('')
  const [planText, setPlanText] = useState('')
  const [note, setNote] = useState('')
  const [promos, setPromos] = useState<PromoSummary | null>(null)
  const [airedOpen, setAiredOpen] = useState(false)
  /** Plan rows expanded to show their per-track breakdown (by row index). */
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  function toggleExpanded(i: number): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

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
    if (sel === null || !templates[sel] || templates[sel].status === 'missing') {
      setPlanGrid(null)
      setPlanText('')
      return
    }
    let gone = false
    const t = templates[sel]
    setPlanStart(t.firstDate ?? '')
    setPlanEnd(t.lastDate ?? '')
    window.api.templateGrid(sel).then((g) => {
      if (!gone) setPlanGrid(g)
    })
    const s = toCalendarDate(t.firstDate ?? '')
    const e = toCalendarDate(t.lastDate ?? '')
    if (s && e) {
      window.api.previewTemplate(sel, s, e).then((res) => {
        if (!gone) setPlanText(res.text)
      })
    } else {
      setPlanText('')
    }
    return () => {
      gone = true
    }
  }, [sel, templates])

  /** Re-preview the Simian text for an edited range (bounds keep each other valid). */
  async function changePlanRange(startISO: string, endISO: string): Promise<void> {
    let a = startISO
    let b = endISO
    if (a && b && a > b) {
      if (startISO !== planStart) b = a
      else a = b
    }
    setPlanStart(a)
    setPlanEnd(b)
    if (sel === null) return
    const s = toCalendarDate(a)
    const e = toCalendarDate(b)
    if (!s || !e) {
      setPlanText('')
      return
    }
    const res = await window.api.previewTemplate(sel, s, e)
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

  /** Pick a new source file for a missing row — the code/category edits are kept. */
  async function relinkElement(index: number): Promise<void> {
    onTemplates(await window.api.relinkTemplate(index))
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

  // Tracks used anywhere in the plan, from the parser's real token list —
  // tokens can be multi-character (`F01`), so they are never derived from the
  // condensed display cells. A token plays as `CODE-<TRACK>`; the `1` sentinel
  // (or a plan with no tokens at all) is the element playing as itself — the
  // bare CODE, listed with code "1".
  const tracks = useMemo(() => {
    if (!selected) return []
    const tokens = planGrid?.tracks ?? []
    const list = tokens
      .filter((t) => t !== '1')
      .map((t) => ({ code: t, name: `${selected.code}-${t}` }))
    if (tokens.includes('1') || list.length === 0) list.unshift({ code: '1', name: selected.code })
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

  // Track durations for EVERY booked element (the table's Dur / Total Dur
  // columns) — one batch lookup across all plans.
  const allTrackNames = useMemo(
    () => [...new Set(templates.flatMap((t) => (t.tracks ?? []).map((tr) => tr.name)))],
    [templates]
  )
  const [allDur, setAllDur] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!dbLoaded || allTrackNames.length === 0) {
      setAllDur({})
      return
    }
    let gone = false
    window.api.simianDurations(allTrackNames).then((r) => {
      if (!gone) setAllDur(r)
    })
    return () => {
      gone = true
    }
  }, [dbLoaded, allTrackNames])

  /** Per-track second lengths for a row (rounded; null = not in the DB). */
  const rowDurations = (t: TemplateSummary): (number | null)[] =>
    (t.tracks ?? []).map((tr) => {
      const d = allDur[tr.name]
      return d != null ? Math.round(d) : null
    })

  /** The Dur cell: one shared length, `Mixed`, or unknown. */
  const durLabel = (t: TemplateSummary): string => {
    const known = rowDurations(t).filter((d): d is number => d != null)
    if (known.length === 0) return '—'
    const unique = [...new Set(known)]
    return unique.length === 1 && known.length === (t.tracks ?? []).length
      ? String(unique[0])
      : 'Mixed'
  }

  /** Total airtime = Σ spots × track length (null while any track is unknown). */
  const totalDuration = (t: TemplateSummary): number | null => {
    const tracks = t.tracks ?? []
    if (tracks.length === 0) return null
    let sum = 0
    for (const tr of tracks) {
      const d = allDur[tr.name]
      if (d == null) return null
      sum += tr.spots * Math.round(d)
    }
    return sum
  }

  /** Seconds → `H:MM:SS` / `MM:SS`. */
  const airtime = (s: number | null): string => {
    if (s == null) return '—'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const p = (n: number): string => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
  }

  /** `2026-09-01` → `01-09-2026` (the station's plan-table date style). */
  const ddmmyyyy = (iso: string | null): string => (iso ? iso.split('-').reverse().join('-') : '—')

  const footer = templates.reduce(
    (f, t) => ({
      tracks: f.tracks + (t.tracks?.length ?? 0),
      spots: f.spots + (t.spotCount ?? 0)
    }),
    { tracks: 0, spots: 0 }
  )

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
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
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
            <button
              className="btn"
              title="Compare booked spots against Simian's aired lists (YYMMDD.lst) for a date range"
              onClick={() => setAiredOpen(true)}
            >
              Aired check…
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
                  <th style={{ width: 120 }}>Name</th>
                  <th style={{ width: 180 }}>Client</th>
                  <th style={{ width: 100 }}>Category</th>
                  <th style={{ width: 100 }}>Start</th>
                  <th style={{ width: 100 }}>End</th>
                  <th title="Distinct track files in the plan">Tracks</th>
                  <th title="Track length in seconds (from the audio DB)">Dur</th>
                  <th title="Total booked spots across the whole plan">T. Spots</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <Fragment key={`${t.code}-${i}`}>
                    <tr
                      className={`book-row ${sel === i ? 'sel' : ''} ${
                        t.status === 'missing' ? 'missing' : ''
                      }`}
                      onClick={() => setSel(i)}
                    >
                      <td
                        className="mono-sm"
                        style={{ fontWeight: 700 }}
                        title={`${t.fileName} — ${t.path}`}
                      >
                        {t.tracks.length > 1 && (
                          <button
                            className={`row-expand ${expanded.has(i) ? 'open' : ''}`}
                            title={
                              expanded.has(i)
                                ? 'Hide the plan’s tracks'
                                : 'Show each track’s spots and airtime'
                            }
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpanded(i)
                            }}
                          >
                            ▸
                          </button>
                        )}
                        {t.code || '—'}
                        {t.status === 'missing' && <span className="src-tag missing">MISSING</span>}
                        {t.status === 'changed' && (
                          <span
                            className="src-tag changed"
                            title="The spreadsheet changed on disk since the last import — its current contents were re-read automatically"
                          >
                            UPDATED
                          </span>
                        )}
                      </td>
                      <td dir="auto">{t.group || '—'}</td>
                      <td>{t.category || '—'}</td>
                      <td className="muted num-cell">{ddmmyyyy(t.firstDate)}</td>
                      <td className="muted num-cell">{ddmmyyyy(t.lastDate)}</td>
                      <td className="num-cell">{t.status === 'missing' ? '—' : t.tracks.length}</td>
                      <td className="num-cell">{t.status === 'missing' ? '—' : durLabel(t)}</td>
                      <td className="num-cell">{t.status === 'missing' ? '—' : t.spotCount}</td>
                    </tr>
                    {expanded.has(i) &&
                      t.tracks.map((tr) => {
                        const d = allDur[tr.name]
                        const sec = d != null ? Math.round(d) : null
                        return (
                          <tr key={tr.name} className="track-row">
                            <td className="mono-sm track-name" colSpan={5}>
                              └ {tr.name}
                            </td>
                            <td />
                            <td className="num-cell">{sec ?? '—'}</td>
                            <td className="num-cell">{tr.spots}</td>
                          </tr>
                        )
                      })}
                  </Fragment>
                ))}
              </tbody>
              {templates.length > 1 && (
                <tfoot>
                  <tr className="book-total">
                    <td colSpan={5}>
                      {templates.length} plan{templates.length === 1 ? '' : 's'}
                    </td>
                    <td className="num-cell">{footer.tracks}</td>
                    <td />
                    <td className="num-cell">{footer.spots}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {selected && selected.status !== 'missing' && (
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
                  <>
                    <label className="kick">
                      From{' '}
                      <input
                        type="date"
                        value={planStart}
                        min={selected.firstDate ?? undefined}
                        max={selected.lastDate ?? undefined}
                        onChange={(e) => changePlanRange(e.target.value, planEnd)}
                      />
                    </label>
                    <label className="kick">
                      To{' '}
                      <input
                        type="date"
                        value={planEnd}
                        min={selected.firstDate ?? undefined}
                        max={selected.lastDate ?? undefined}
                        onChange={(e) => changePlanRange(planStart, e.target.value)}
                      />
                    </label>
                  </>
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
                  value={planText || '(no rows in this range)'}
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
        ) : selected.status === 'missing' ? (
          <>
            <div>
              <div className="kick">Selected element</div>
              <div className="insp-title">{selected.code || selected.fileName}</div>
            </div>
            <div className="insp-sec">
              <div className="kick">Source file missing</div>
              <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
                <span className="mono-sm" title={selected.path}>
                  {selected.fileName}
                </span>{' '}
                can’t be read right now — moved, renamed, or not synced yet. Its plan is left out of
                previews and exports until it’s back; your edits (name, category) are kept.
              </div>
              <div
                className="muted mono-sm"
                style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-all' }}
              >
                {selected.path}
              </div>
            </div>
            <div className="insp-foot">
              <div className="row">
                <button
                  className="btn primary"
                  onClick={() => sel !== null && relinkElement(sel)}
                  title="Pick the spreadsheet's new location — your edits are kept"
                >
                  Re-link…
                </button>
                <button
                  className="btn"
                  onClick={() => sel !== null && removeElement(sel)}
                  title="Forget this element and its edits (no file is touched)"
                >
                  Remove
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="insp-field">
              <span className="kick">Client</span>
              <input dir="auto" readOnly value={selected.group || '—'} />
            </div>

            <div className="insp-field">
              <span className="kick">Name</span>
              <input
                key={`${selected.code}-${sel}`}
                defaultValue={selected.code}
                spellCheck={false}
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
                {(categories.includes(selected.category)
                  ? categories
                  : [selected.category, ...categories]
                ).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="insp-field">
              <span className="kick">Duration</span>
              <input readOnly value={airtime(totalDuration(selected))} />
            </div>

            <div className="insp-sec">
              <div className="kick">Tracks</div>
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
                <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
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

      <AiredCheckDialog open={airedOpen} onClose={() => setAiredOpen(false)} />
    </div>
  )
}
