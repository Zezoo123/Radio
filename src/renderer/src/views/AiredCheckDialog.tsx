import { useState } from 'react'
import type { AiredCheckResult } from '../../../preload'
import { toCalendarDate } from '../App'

/**
 * After-air check: every booked element spot in a date range is reconciled
 * against Simian's aired lists — the `<YYMMDD>.lst` files the station keeps
 * in a "List" folder.
 *
 * The screen is visual: summary tiles, then one strip per day where every
 * booked spot is a chip in time order — green played, amber cut short, red
 * missed, blue aired-without-booking — with the issues itemized underneath.
 * The saved .txt report keeps the client's errors-only format.
 */

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_LABEL = { missed: 'MISSED', partial: 'CUT SHORT', extra: 'EXTRA' } as const

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

export function AiredCheckDialog({ open, onClose }: Props): JSX.Element | null {
  const [folder, setFolder] = useState(readSavedFolder)
  const [start, setStart] = useState(() => isoDaysAgo(7))
  const [end, setEnd] = useState(() => isoDaysAgo(1))
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AiredCheckResult | null>(null)
  const [note, setNote] = useState('')

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
          <code>YYMMDD.lst</code>). One chip per spot, in time order.
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
                      {day.spots.map((s, k) => (
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
