import { useState } from 'react'
import type { AiredCheckResult } from '../../../preload'
import { toCalendarDate } from '../App'

/**
 * After-air check: every booked element spot in a date range is reconciled
 * against Simian's aired lists — the `<YYMMDD>.lst` files the station keeps
 * in a "List" folder. Per the client's spec only errors are itemized:
 * MISSED (never went to air), PARTIAL (cut before its full length) and
 * EXTRA (aired but not booked); fully played spots are only counted.
 */

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_LABEL = { missed: 'MISSED', partial: 'PARTIALLY PLAYED', extra: 'EXTRA' } as const

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
      issues: t.issues + d.issues.length,
      unchecked: t.unchecked + (d.error ? 1 : 0)
    }),
    { planned: 0, played: 0, issues: 0, unchecked: 0 }
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
          Compares every booked element spot in the range against Simian&apos;s aired lists (
          <code>YYMMDD.lst</code>) — played in full, cut, missed, or aired without a booking.
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
          <div className="aired-results">
            <div className="kick" style={{ margin: '12px 0 6px' }}>
              {totals.planned} booked · {totals.played} fully played · {totals.issues} issue
              {totals.issues === 1 ? '' : 's'}
              {totals.unchecked > 0 ? ` · ${totals.unchecked} day(s) not checked` : ''}
              {!result.dbLoaded ? ' · no audio DB — cut check skipped' : ''}
            </div>
            {result.days.map((day) => (
              <div key={day.date} className="aired-day">
                <div className={day.error || day.issues.length > 0 ? 'attn-title' : 'muted'}>
                  {day.date} —{' '}
                  {day.error
                    ? `not checked: ${day.error}`
                    : `booked ${day.planned}, fully played ${day.played}` +
                      (day.issues.length > 0 ? `, ${day.issues.length} issue(s)` : ' ✓')}
                </div>
                {day.issues.map((i, k) => (
                  <div key={k} className="attn-line">
                    {i.time} · <b>{i.name}</b> — {STATUS_LABEL[i.status]} ({i.detail})
                  </div>
                ))}
              </div>
            ))}
          </div>
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
