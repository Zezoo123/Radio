import { useMemo, useState } from 'react'
import type { AiredCheckResult } from '../../../preload'
import { canonicalName } from '../../../main/core/schedule/bookingCheck'
import { toCalendarDate } from '../App'

/**
 * After-air check: every booked element spot in a date range is reconciled
 * against Simian's aired lists — the `<YYMMDD>.lst` files the station keeps
 * in a "List" folder.
 *
 * Two views over the same result: BY DAY (one strip per day, a chip per
 * booked spot in time order) and BY BOOKING (one block per element — how many
 * of the campaign's spots played, were cut, or were dropped, and when). The
 * saved .txt report carries both: the client's errors-only day list plus the
 * per-booking summary.
 */

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_LABEL = { missed: 'MISSED', partial: 'CUT SHORT', extra: 'EXTRA' } as const

type SpotStatus = 'played' | 'partial' | 'missed' | 'extra'

/** One spot occurrence with its date — the unit of the by-booking view. */
interface AdEntry {
  date: string
  time: string
  name: string
  status: SpotStatus
  detail?: string
}

interface AdSummary {
  code: string
  booked: number
  played: number
  partial: number
  missed: number
  extra: number
  entries: AdEntry[]
}

/** Local YYYY-MM-DD, `delta` days from today. */
function isoDaysAgo(delta: number): string {
  const d = new Date()
  d.setDate(d.getDate() - delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const readSavedFolder = (): string => {
  try {
    return localStorage.getItem('aired.folder') ?? ''
  } catch {
    return ''
  }
}

/** The element code a spot name belongs to (longest canonical prefix wins). */
function elementOf(name: string, codes: string[]): string {
  const key = canonicalName(name)
  let best = ''
  for (const code of codes) {
    const c = canonicalName(code)
    if ((key === c || key.startsWith(c + '_')) && c.length > best.length) best = code
  }
  return best || name
}

/** Group the day results into one summary per booking element. */
function groupByAd(result: AiredCheckResult): AdSummary[] {
  const byCode = new Map<string, AdSummary>()
  const get = (code: string): AdSummary => {
    let s = byCode.get(code)
    if (!s) {
      s = { code, booked: 0, played: 0, partial: 0, missed: 0, extra: 0, entries: [] }
      byCode.set(code, s)
    }
    return s
  }
  for (const day of result.days) {
    for (const spot of day.spots ?? []) {
      const s = get(elementOf(spot.name, result.codes ?? []))
      s.booked++
      s[spot.status]++
      s.entries.push({ date: day.date, ...spot })
    }
    for (const i of day.issues) {
      if (i.status !== 'extra') continue
      const s = get(elementOf(i.name, result.codes ?? []))
      s.extra++
      s.entries.push({
        date: day.date,
        time: i.time,
        name: i.name,
        status: 'extra',
        detail: i.detail
      })
    }
  }
  for (const s of byCode.values()) {
    s.entries.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export function AiredCheckDialog({ open, onClose }: Props): JSX.Element | null {
  const [folder, setFolder] = useState(readSavedFolder)
  const [start, setStart] = useState(() => isoDaysAgo(7))
  const [end, setEnd] = useState(() => isoDaysAgo(1))
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AiredCheckResult | null>(null)
  const [view, setView] = useState<'days' | 'ads'>('days')
  const [note, setNote] = useState('')

  const ads = useMemo(() => (result ? groupByAd(result) : []), [result])

  if (!open) return null

  async function pickFolder(): Promise<void> {
    const path = await window.api.pickAiredFolder()
    if (!path) return
    setFolder(path)
    setResult(null)
    try {
      localStorage.setItem('aired.folder', path)
    } catch {
      /* storage unavailable — keep for this session */
    }
  }

  async function run(): Promise<void> {
    const s = toCalendarDate(start)
    const e = toCalendarDate(end)
    if (!folder || !s || !e) return
    setRunning(true)
    setNote('')
    try {
      setResult(await window.api.checkAired(folder, s, e))
    } finally {
      setRunning(false)
    }
  }

  function reportText(res: AiredCheckResult): string {
    const lines = [`AIRED CHECK — ${start} → ${end}`, `List folder: ${folder}`]
    if (!res.dbLoaded) lines.push('No audio database loaded — cut-duration check skipped.')
    for (const day of res.days) {
      lines.push('')
      if (day.error) {
        lines.push(`${day.date} — NOT CHECKED: ${day.error}`)
        continue
      }
      lines.push(`${day.date} — booked ${day.planned}, fully played ${day.played}`)
      for (const i of day.issues)
        lines.push(`  ${i.time}  ${i.name}  ${STATUS_LABEL[i.status]} — ${i.detail}`)
    }
    lines.push('', '='.repeat(60), 'BY BOOKING')
    for (const ad of groupByAd(res)) {
      lines.push(
        '',
        `${ad.code} — booked ${ad.booked}: ${ad.played} played, ${ad.partial} cut short, ` +
          `${ad.missed} missed${ad.extra > 0 ? `, ${ad.extra} extra` : ''}`
      )
      for (const e of ad.entries) {
        if (e.status === 'played') continue
        lines.push(`  ${e.date}  ${e.time}  ${e.name}  ${STATUS_LABEL[e.status]} — ${e.detail}`)
      }
    }
    return lines.join('\r\n') + '\r\n'
  }

  async function saveReport(): Promise<void> {
    if (!result) return
    const res = await window.api.saveReport(reportText(result), `aired-check-${start}_${end}.txt`)
    setNote(res.saved ? `Report saved to ${res.path}` : '')
  }

  const totals = result?.days.reduce(
    (t, d) => ({
      planned: t.planned + d.planned,
      played: t.played + d.played,
      partial: t.partial + d.issues.filter((i) => i.status === 'partial').length,
      missed: t.missed + d.issues.filter((i) => i.status === 'missed').length,
      extra: t.extra + d.issues.filter((i) => i.status === 'extra').length,
      unchecked: t.unchecked + (d.error ? 1 : 0)
    }),
    { planned: 0, played: 0, partial: 0, missed: 0, extra: 0, unchecked: 0 }
  )

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal aired-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="modal-head">
          <h2>Aired check</h2>
          <button className="btn-link" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Every booked element spot in the range, reconciled against Simian&apos;s aired lists (
          <code>YYMMDD.lst</code>).
        </p>

        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn" onClick={pickFolder}>
            {folder ? 'Change List folder…' : 'Choose List folder…'}
          </button>
          <span className="muted mono-sm" style={{ wordBreak: 'break-all' }} title={folder}>
            {folder || 'no folder chosen'}
          </span>
        </div>

        <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
          <label className="kick">
            From <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="kick">
            To <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button
            className="btn primary"
            disabled={!folder || running || !start || !end || start > end}
            onClick={run}
          >
            {running ? 'Checking…' : 'Run check'}
          </button>
          {result && (
            <div className="seg" style={{ marginLeft: 'auto' }}>
              <button
                className={`seg-btn ${view === 'days' ? 'on' : ''}`}
                onClick={() => setView('days')}
              >
                By day
              </button>
              <button
                className={`seg-btn ${view === 'ads' ? 'on' : ''}`}
                onClick={() => setView('ads')}
              >
                By booking
              </button>
            </div>
          )}
          {result && result.days.some((d) => d.issues.length > 0 || d.error) && (
            <button className="btn" onClick={saveReport}>
              Save report…
            </button>
          )}
        </div>

        {result && totals && (
          <>
            <div className="aired-stats">
              <div className="aired-stat">
                <div className="n">{totals.planned}</div>
                <div className="l">Booked</div>
              </div>
              <div className="aired-stat ok">
                <div className="n">{totals.played}</div>
                <div className="l">Fully played</div>
              </div>
              <div className="aired-stat warn">
                <div className="n">{totals.partial}</div>
                <div className="l">Cut short</div>
              </div>
              <div className="aired-stat danger">
                <div className="n">{totals.missed}</div>
                <div className="l">Missed</div>
              </div>
              <div className="aired-stat extra">
                <div className="n">{totals.extra}</div>
                <div className="l">Extra</div>
              </div>
              {totals.unchecked > 0 && (
                <div className="aired-stat mutedstat">
                  <div className="n">{totals.unchecked}</div>
                  <div className="l">Days without list</div>
                </div>
              )}
            </div>
            {!result.dbLoaded && (
              <div className="muted" style={{ marginBottom: 6 }}>
                No audio database loaded — the cut-duration check was skipped.
              </div>
            )}

            {view === 'days' ? (
              <div className="aired-results">
                {result.days.map((day) => (
                  <div key={day.date} className="aired-day">
                    <div className="aired-day-head">
                      <span className="aired-day-date">{day.date}</span>
                      {day.error ? (
                        <span className="aired-nofile">{day.error}</span>
                      ) : (
                        <span className="muted">
                          {day.played}/{day.planned} played
                          {day.issues.length > 0 ? ` · ${day.issues.length} issue(s)` : ''}
                        </span>
                      )}
                      {!day.error && day.issues.length === 0 && day.planned > 0 && (
                        <span className="aired-allok">✓ all played</span>
                      )}
                    </div>
                    {!day.error && (
                      <div className="spot-strip">
                        {(day.spots ?? []).map((s, k) => (
                          <span
                            key={k}
                            className={`spot-chip ${s.status}`}
                            title={`${s.time.slice(0, 5)} ${s.name}${s.detail ? ` — ${s.detail}` : ' — played'}`}
                          />
                        ))}
                        {day.issues
                          .filter((i) => i.status === 'extra')
                          .map((i, k) => (
                            <span
                              key={`x${k}`}
                              className="spot-chip extra"
                              title={`${i.time.slice(0, 5)} ${i.name} — ${i.detail}`}
                            />
                          ))}
                      </div>
                    )}
                    {day.issues.length > 0 && (
                      <div className="aired-issues">
                        {day.issues.map((i, k) => (
                          <div key={k} className="aired-issue">
                            <span className={`st-pill ${i.status}`}>{STATUS_LABEL[i.status]}</span>
                            <span className="mono-sm">{i.time.slice(0, 5)}</span>
                            <b>{i.name}</b>
                            <span className="muted">{i.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="aired-results">
                {ads.map((ad) => (
                  <div key={ad.code} className="aired-day">
                    <div className="aired-day-head">
                      <span className="aired-day-date">{ad.code}</span>
                      <span className="muted">
                        booked {ad.booked} · <span className="ok-text">{ad.played} played</span>
                        {ad.partial > 0 && (
                          <>
                            {' · '}
                            <span className="warn-text">{ad.partial} cut short</span>
                          </>
                        )}
                        {ad.missed > 0 && (
                          <>
                            {' · '}
                            <span className="danger-text">{ad.missed} missed</span>
                          </>
                        )}
                        {ad.extra > 0 && ` · ${ad.extra} extra`}
                      </span>
                      {ad.booked > 0 && ad.played === ad.booked && ad.extra === 0 && (
                        <span className="aired-allok">✓ all played</span>
                      )}
                    </div>
                    <div className="spot-strip">
                      {ad.entries.map((e, k) => (
                        <span
                          key={k}
                          className={`spot-chip ${e.status}`}
                          title={`${e.date} ${e.time.slice(0, 5)} ${e.name}${
                            e.detail ? ` — ${e.detail}` : ' — played'
                          }`}
                        />
                      ))}
                    </div>
                    {ad.entries.some((e) => e.status !== 'played') && (
                      <div className="aired-issues">
                        {ad.entries
                          .filter((e) => e.status !== 'played')
                          .map((e, k) => (
                            <div key={k} className="aired-issue">
                              <span className={`st-pill ${e.status}`}>
                                {STATUS_LABEL[e.status as keyof typeof STATUS_LABEL]}
                              </span>
                              <span className="mono-sm">
                                {e.date} {e.time.slice(0, 5)}
                              </span>
                              <b>{e.name}</b>
                              <span className="muted">{e.detail}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {note && (
          <div className="muted" style={{ marginTop: 8 }}>
            {note}
          </div>
        )}
      </div>
    </div>
  )
}
