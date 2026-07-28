import { useEffect, useState } from 'react'
import type { SimianDbSummary } from '../../../preload'
import { LogGrid } from '../components/LogGrid'
import PageHelp from '../components/PageHelp'
import { parseLogText, rowKind, serializeRows, type LogRow } from '../lib/logRows'
import { parseTimeToSeconds, simulateLog, type SimRow } from '../lib/runtime'
import { ReplaceDialog } from './ReplaceDialog'

interface Props {
  /** A log handed over from the Export tab (not yet written to any file). */
  incoming?: { text: string } | null
  onConsumed?: () => void
  /** App-wide Category → row highlight color map (from Settings). */
  categoryColors?: Record<string, string>
  /** App-wide Category → row text color map (from Settings). */
  categoryTextColors?: Record<string, string>
}

/**
 * Standalone Simian-style log editor: open any exported log — or take the
 * composed log straight from the Export tab — edit every line, reorder with
 * drag & drop, insert/delete rows, then save back to a file.
 *
 * With a Simian audio database (.mdb) loaded, each row's Duration is looked up
 * by file name, and the Expected column shows the real air time implied by the
 * order and the cue rules (`@` fires at its stated time; `+` plays after the
 * current item finishes; `#` waits for the current item but not before its
 * stated time).
 */
export function EditorView({
  incoming,
  onConsumed,
  categoryColors,
  categoryTextColors
}: Props): JSX.Element {
  const [rows, setRows] = useState<LogRow[]>([])
  const [path, setPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [db, setDb] = useState<SimianDbSummary | null>(null)
  /** Row id → duration seconds (from the DB lookup, or edited by hand). */
  const [durations, setDurations] = useState<Map<number, number>>(new Map())
  const [replaceOpen, setReplaceOpen] = useState(false)

  useEffect(() => {
    window.api.getSimianDb().then(setDb)
  }, [])

  const durationOf = (row: LogRow): number => durations.get(row.id) ?? 0

  // The Expected column recomputes ON DEMAND (the ↻ button), not on every
  // keystroke — a time edit early in a big log would otherwise repaint every
  // row after it, per character. `simTick` bumps trigger a recompute; any
  // other rows/durations change just flags the column as outdated.
  const [sim, setSim] = useState<SimRow[]>([])
  const [simStale, setSimStale] = useState(false)
  const [simTick, setSimTick] = useState(0)
  const refreshSim = (): void => setSimTick((t) => t + 1)
  // Clock the Expected simulation starts at — 00:00:00 unless the user picks
  // another start (for logs that begin mid-day).
  const [simStart, setSimStart] = useState('00:00:00')

  useEffect(() => {
    setSimStale(true)
  }, [rows, durations])

  useEffect(() => {
    setSim(simulateLog(rows, (r) => durations.get(r.id) ?? 0, parseTimeToSeconds(simStart) ?? 0))
    setSimStale(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTick])


  /** Look up every audio row's file name in the Simian DB (comments stay 0). */
  async function fillDurations(rs: LogRow[]): Promise<void> {
    const names = [
      ...new Set(
        rs.filter((r) => rowKind(r) === 'event' && r.fields[2].trim()).map((r) => r.fields[2].trim())
      )
    ]
    if (names.length === 0) return
    const found = await window.api.simianDurations(names)
    setDurations((prev) => {
      const next = new Map(prev)
      for (const r of rs) {
        const d = found[r.fields[2].trim()]
        if (d != null) next.set(r.id, Math.round(d))
      }
      return next
    })
    refreshSim() // new durations → recompute the Expected column right away
  }

  /**
   * Pull Duration AND Description from the audio DB for every row whose file
   * name it knows. Descriptions overwrite the log's text (that's the point —
   * the library is the source of truth), so this only runs from its button,
   * never automatically, and it marks the log dirty.
   */
  async function fillFromDb(): Promise<void> {
    const names = [
      ...new Set(
        rows.filter((r) => rowKind(r) === 'event' && r.fields[2].trim()).map((r) => r.fields[2].trim())
      )
    ]
    if (names.length === 0) return
    const found = await window.api.simianTracks(names)
    setDurations((prev) => {
      const next = new Map(prev)
      for (const r of rows) {
        const d = found[r.fields[2].trim()]?.duration
        if (d != null) next.set(r.id, Math.round(d))
      }
      return next
    })
    let changed = 0
    const next = rows.map((r) => {
      if (rowKind(r) !== 'event') return r
      const desc = found[r.fields[2].trim()]?.description
      if (!desc || desc === r.fields[4]) return r
      changed++
      const fields = [...r.fields] as LogRow['fields']
      fields[4] = desc
      return { ...r, fields }
    })
    if (changed > 0) updateRows(next)
    refreshSim()
    const matched = Object.keys(found).length
    setStatus(
      `Updated from DB: ${matched} of ${names.length} names matched, ${changed} description${
        changed === 1 ? '' : 's'
      } changed`
    )
  }

  function loadText(
    text: string,
    newPath: string | null,
    isDirty: boolean,
    rowDurations?: number[]
  ): void {
    const parsed = parseLogText(text)
    setRows(parsed)
    setPath(newPath)
    setDirty(isDirty)
    // Seed per-row durations when the source carries them (.bsi logs, or the
    // Length field of a Simian-saved text log); the audio-database lookup then
    // refines whatever it can match.
    const seeded = new Map<number, number>()
    if (rowDurations) {
      parsed.forEach((r, i) => {
        const d = rowDurations[i]
        if (d != null && d > 0) seeded.set(r.id, Math.round(d))
      })
    }
    parsed.forEach((r) => {
      if (r.srcDuration != null && r.srcDuration > 0) seeded.set(r.id, Math.round(r.srcDuration))
    })
    setDurations(seeded)
    refreshSim() // compute the freshly loaded log immediately
    void fillDurations(parsed)
  }

  // Take over a log sent from Export: no backing file yet, so it starts dirty
  // and Save behaves like Save as….
  useEffect(() => {
    if (incoming == null) return
    if (dirty && !confirm('Discard unsaved changes and load the log from Export?')) {
      onConsumed?.()
      return
    }
    loadText(incoming.text, null, true)
    setStatus('Loaded from Export — not saved yet')
    onConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming])

  async function openLog(): Promise<void> {
    if (dirty && !confirm('Discard unsaved changes and open another log?')) return
    const res = await window.api.openLog()
    if (!res) return
    if (res.bsi) {
      // Native .bsi is an Access database we can read but not write — drop the
      // path so Save can't clobber the binary; saving produces a text log.
      loadText(res.text, null, false, res.rowDurations)
      setStatus(`Opened ${res.path.split(/[\\/]/).pop()} (BSI) — saving writes a text log`)
    } else {
      loadText(res.text, res.path, false)
      setStatus('')
    }
  }

  async function openDb(): Promise<void> {
    const summary = await window.api.openSimianDb()
    if (!summary) return
    setDb(summary)
    await fillDurations(rows)
  }

  function updateRows(next: LogRow[]): void {
    setRows(next)
    setDirty(true)
    setStatus('')
  }

  function setDuration(id: number, seconds: number): void {
    setDurations((prev) => new Map(prev).set(id, seconds))
  }

  async function save(as: boolean): Promise<void> {
    // Rows with a known duration save in Simian's six-column shape (Length
    // between Name and Category); rows without one stay five-column.
    const res = await window.api.saveLog(
      serializeRows(rows, durationOf),
      as ? undefined : (path ?? undefined)
    )
    if (!res.saved) {
      setStatus('Save cancelled')
      return
    }
    if (res.path) setPath(res.path)
    setDirty(false)
    setStatus(`Saved to ${res.path}`)
  }

  const fileName = path?.split(/[\\/]/).pop()
  const dbName = db?.path.split(/[\\/]/).pop()

  return (
    <div className="view">
      <div className="card-head">
        <h1>
          Editor
          <PageHelp>
            Open an exported log (or send one over from Export) and edit it right here. The
            Expected column shows the real air time each row will start at, computed from the
            order, the cue rules and the file durations from your Simian audio database.
          </PageHelp>
        </h1>
        <div className="row">
          {rows.length > 0 && (
            <span className="muted" title={path ?? undefined}>
              {fileName ?? '(unsaved log)'}
              {dirty ? ' — unsaved changes' : ''}
            </span>
          )}
          <button className="btn" onClick={openLog}>
            Open log…
          </button>
          <label
            className="muted"
            title="The clock the Expected column starts counting from — leave 00:00:00 unless the log starts mid-day"
          >
            Start{' '}
            <TimeField
              value={simStart}
              onCommit={(v) => {
                setSimStart(v)
                refreshSim()
              }}
            />
          </label>
          {rows.length > 0 && (
            <>
              <button
                className="btn primary"
                disabled={!dirty && Boolean(path)}
                onClick={() => save(false)}
              >
                Save
              </button>
              <button className="btn" onClick={() => save(true)}>
                Save as…
              </button>
            </>
          )}
          {status && <span className="muted">{status}</span>}
        </div>
      </div>
      <section className="card">
        <div className="row">
          <button className="btn" onClick={openDb}>
            {db ? 'Replace Simian DB…' : 'Load Simian DB…'}
          </button>
          {db ? (
            <span className="muted" title={db.path}>
              {dbName} — {db.trackCount} tracks (table “{db.table}”)
            </span>
          ) : (
            <span className="muted">
              No audio database loaded — durations default to 0, so Expected assumes instant rows.
            </span>
          )}
          {db && rows.length > 0 && (
            <>
              <button className="btn-link" onClick={() => fillDurations(rows)}>
                refresh durations
              </button>
              <button
                className="btn"
                title="Fill Duration and overwrite Description from the audio database for every row whose file name it knows"
                onClick={fillFromDb}
              >
                Update Dur &amp; Desc from DB
              </button>
            </>
          )}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="empty" style={{ marginTop: 18 }}>
          No log open. Export a schedule (or use “Edit in Editor” on the Export tab), or open a
          .txt log here.
        </p>
      ) : (
        <section className="card log-card">
          <div className="row" style={{ padding: '2px 8px 8px' }}>
            <span className="muted">{rows.length} rows</span>
            <button
              className="btn"
              title="Recompute the Expected column from the current order, cues and durations"
              onClick={refreshSim}
            >
              ↻ Refresh expected
            </button>
            <button
              className="btn"
              title="Find and replace text across the log's cells, optionally in a single column"
              onClick={() => setReplaceOpen(true)}
            >
              Search &amp; replace…
            </button>
            {simStale && (
              <span className="pill warn-pill" title="Rows changed since the last refresh">
                expected outdated
              </span>
            )}
          </div>
          <LogGrid
            rows={rows}
            onRows={updateRows}
            sim={sim}
            durationOf={durationOf}
            onDuration={setDuration}
            categoryColors={categoryColors}
            categoryTextColors={categoryTextColors}
          />
        </section>
      )}

      <ReplaceDialog
        open={replaceOpen}
        rows={rows}
        onApply={(next, summary) => {
          updateRows(next)
          setStatus(summary)
        }}
        onClose={() => setReplaceOpen(false)}
      />
    </div>
  )
}

/** Digit slots of the `HH:MM:SS` mask and each slot's maximum first digit. */
function replaceDigit(value: string, pos: number, digit: string): string | null {
  const limits: Record<number, number> = {
    0: 2,
    1: value[0] === '2' ? 3 : 9, // 20-23 only once the hour starts with 2
    3: 5,
    4: 9,
    6: 5,
    7: 9
  }
  const max = limits[pos]
  if (max == null || Number(digit) > max) return null
  let next = value.slice(0, pos) + digit + value.slice(pos + 1)
  // Typing a leading 2 clamps an existing 4-9 second hour digit to 3 (max 23).
  if (pos === 0 && digit === '2' && Number(next[1]) > 3) next = '2' + '3' + next.slice(2)
  return next
}

/**
 * Strict `HH:MM:SS` field: the mask never changes shape — a digit key
 * overwrites the digit under the caret (skipping the colons, hours capped at
 * 23, minutes/seconds at 59), Backspace zeroes the digit before the caret,
 * and nothing else can be typed, inserted or pasted. Commits on Enter/blur.
 */
function TimeField({
  value,
  onCommit
}: {
  value: string
  onCommit: (v: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    const el = e.currentTarget
    if (e.key === 'Enter') {
      el.blur()
      return
    }
    // Leave caret movement and focus keys alone.
    if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') return
    e.preventDefault()

    let pos = el.selectionStart ?? 0
    const place = (p: number): void => {
      requestAnimationFrame(() => el.setSelectionRange(p, p))
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (e.key === 'Backspace') pos = Math.max(0, pos - 1)
      if (draft[pos] === ':') pos = e.key === 'Backspace' ? pos - 1 : pos + 1
      if (pos < 0 || pos > 7) return
      setDraft(draft.slice(0, pos) + '0' + draft.slice(pos + 1))
      place(pos)
      return
    }

    if (!/^\d$/.test(e.key)) return
    if (pos >= 8) pos = 7 // typing at the very end edits the last digit
    if (draft[pos] === ':') pos++
    const next = replaceDigit(draft, pos, e.key)
    if (!next) return
    setDraft(next)
    let np = pos + 1
    if (next[np] === ':') np++
    place(np)
  }

  return (
    <input
      value={draft}
      spellCheck={false}
      style={{ width: 78, textAlign: 'center' }}
      onChange={() => {}} // all editing goes through the mask in onKeyDown
      onKeyDown={handleKey}
      onPaste={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      onBlur={() => onCommit(draft)}
    />
  )
}
