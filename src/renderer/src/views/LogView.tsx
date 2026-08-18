import { useEffect, useState } from 'react'
import type { AppConfig, MusicSummary, TemplateSummary } from '../../../main/session'
import type { SimianDbSummary } from '../../../preload'
import { LogGrid } from '../components/LogGrid'
import { parseLogText, rowKind, serializeRows, type LogRow } from '../lib/logRows'
import { parseTimeToSeconds, simulateLog, type SimRow } from '../lib/runtime'
import { MusicImportDialog } from './MusicImportDialog'
import { ReplaceDialog } from './ReplaceDialog'
import { toCalendarDate } from '../App'
import { tomorrowISO } from '../lib/dates'

interface Props {
  /** True while the LOG tab is visible (the view itself stays mounted). */
  active: boolean
  templates: TemplateSummary[]
  config: AppConfig | null
  onConfig: (c: AppConfig) => void
  /** App-wide Category → row highlight color map (from Settings). */
  categoryColors?: Record<string, string>
  /** App-wide Category → row text color map (from Settings). */
  categoryTextColors?: Record<string, string>
}

/**
 * The LOG workbench: build a day (or range) from the Grid, edit it in place,
 * and export/save — the old Export and Editor tabs merged into one screen.
 * Center: date range + include-chips + the editable log grid. Right: the day
 * inspector (row count, warnings, audio database, expected legend, save).
 */
export function LogView({
  active,
  templates,
  config,
  onConfig,
  categoryColors,
  categoryTextColors
}: Props): JSX.Element {
  // ---- Range + composition (from the old Export tab) ------------------------
  const [start, setStart] = useState(tomorrowISO)
  const [end, setEnd] = useState(tomorrowISO)
  const [warnings, setWarnings] = useState<string[]>([])
  const [hasFormats, setHasFormats] = useState(false)

  /** Keep the range valid without making the user fix both boxes. */
  function changeStart(v: string): void {
    setStart(v)
    if (v && end && v > end) setEnd(v)
  }
  function changeEnd(v: string): void {
    setEnd(v)
    if (v && start && v < start) setStart(v)
  }

  // Re-checked whenever the tab becomes visible, so it reflects saved Formats.
  useEffect(() => {
    if (active) window.api.hasFormats().then(setHasFormats)
  }, [active])

  // ---- Music Log import ------------------------------------------------------
  const [music, setMusic] = useState<MusicSummary | null>(null)
  const [musicDialogOpen, setMusicDialogOpen] = useState(false)
  useEffect(() => {
    if (active) window.api.getMusicLog().then(setMusic)
  }, [active])

  async function importMusicLog(): Promise<void> {
    const summary = await window.api.openMusicLog()
    setMusic(summary)
    if (summary) {
      onConfig(await window.api.getConfig())
      setStatus(`Imported ${summary.fileName} — ${summary.eventCount} music rows`)
    }
  }

  async function removeMusicLog(): Promise<void> {
    setMusic(await window.api.removeMusicLog())
    onConfig(await window.api.getConfig())
  }

  const ready =
    hasFormats ||
    templates.length > 0 ||
    Boolean(config?.includeAzan) ||
    Boolean(config?.hasPromos) ||
    Boolean(config?.hasMusic)
  const hourly = config?.hourly ?? { enabled: false, startHour: 0, endHour: 23 }

  async function updateHourly(patch: Partial<typeof hourly>): Promise<void> {
    onConfig(await window.api.setHourly({ ...hourly, ...patch }))
  }

  // ---- Editor document (from the old Editor tab) -----------------------------
  const [rows, setRows] = useState<LogRow[]>([])
  const [path, setPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [db, setDb] = useState<SimianDbSummary | null>(null)
  /** Row id → duration seconds (from the DB lookup, or edited by hand). */
  const [durations, setDurations] = useState<Map<number, number>>(new Map())
  const [replaceOpen, setReplaceOpen] = useState(false)
  // Full-screen mode: the grid takes the whole window over a slim control bar.
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  useEffect(() => {
    window.api.getSimianDb().then(setDb)
  }, [])

  const durationOf = (row: LogRow): number => durations.get(row.id) ?? 0

  // The Expected column recomputes ON DEMAND (the ↻ chip), not on every
  // keystroke — a time edit early in a big log would otherwise repaint every
  // row after it, per character.
  const [sim, setSim] = useState<SimRow[]>([])
  const [simStale, setSimStale] = useState(false)
  const [simTick, setSimTick] = useState(0)
  const refreshSim = (): void => setSimTick((t) => t + 1)
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
        rs
          .filter((r) => rowKind(r) === 'event' && r.fields[2].trim())
          .map((r) => r.fields[2].trim())
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
    refreshSim()
  }

  /**
   * Pull Duration AND Description from the audio DB for every row whose file
   * name it knows. Descriptions overwrite the log's text, so this only runs
   * from its button, never automatically, and it marks the log dirty.
   */
  async function fillFromDb(): Promise<void> {
    const names = [
      ...new Set(
        rows
          .filter((r) => rowKind(r) === 'event' && r.fields[2].trim())
          .map((r) => r.fields[2].trim())
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
    refreshSim()
    void fillDurations(parsed)
  }

  // ---- Build / export / open / save -----------------------------------------
  async function buildFromGrid(): Promise<void> {
    const s = toCalendarDate(start)
    const e = toCalendarDate(end)
    if (!s || !e) return
    if (dirty && !confirm('Discard unsaved changes and rebuild the log from the Grid?')) return
    const res = await window.api.preview(s, e)
    loadText(res.text, null, true)
    setWarnings(res.warnings)
    setStatus('Built from Grid — not saved yet')
  }

  async function doExport(): Promise<void> {
    const s = toCalendarDate(start)
    const e = toCalendarDate(end)
    if (!s || !e) return
    const res = await window.api.exportLog(s, e)
    setWarnings(res.warnings)
    setStatus(res.saved ? `Saved to ${res.path}` : 'Export cancelled')
  }

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
    setWarnings([])
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
  const rangeLabel = start === end ? prettyDate(start) : `${prettyDate(start)} → ${prettyDate(end)}`

  return (
    <div className={`logwork ${full ? 'full' : ''}`}>
      <div className="work-main">
        {full ? (
          <div className="full-bar">
            <span className="kick">Log</span>
            <span className="full-title">{rangeLabel}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {rows.length} rows
              {dirty ? ' — unsaved' : ''}
            </span>
            <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
              <button
                className={`chip ${simStale && rows.length > 0 ? 'stale' : ''}`}
                disabled={rows.length === 0}
                title="Recompute the Expected column"
                onClick={refreshSim}
              >
                ↻ EXPECTED{simStale && rows.length > 0 ? ' — OUTDATED' : ''}
              </button>
              <button
                className="chip"
                disabled={rows.length === 0}
                onClick={() => setReplaceOpen(true)}
              >
                SEARCH &amp; REPLACE…
              </button>
              <button
                className="btn primary"
                disabled={rows.length === 0 || (!dirty && Boolean(path))}
                onClick={() => save(false)}
              >
                Save
              </button>
              <button className="btn" title="Exit full screen (Esc)" onClick={() => setFull(false)}>
                ✕ Exit full screen
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="work-head">
              <div>
                <div className="kick">Log for</div>
                <div className="insp-title">{rangeLabel}</div>
              </div>
              <label className="kick">
                From{' '}
                <input type="date" value={start} onChange={(e) => changeStart(e.target.value)} />
              </label>
              <label className="kick">
                To <input type="date" value={end} onChange={(e) => changeEnd(e.target.value)} />
              </label>
              <div className="row" style={{ marginLeft: 'auto' }}>
                <button className="btn" onClick={openLog}>
                  Open .bsi / .txt…
                </button>
                <button
                  className="btn"
                  disabled={!ready}
                  title="Compose the range from the Grid (clocks + booked elements + promos + azan + music log) and load it here for editing"
                  onClick={buildFromGrid}
                >
                  Build from Grid
                </button>
                <button
                  className="btn primary"
                  disabled={!ready}
                  title="Write the composed schedule for the whole range straight to log files (editor edits are not included — use Save for those)"
                  onClick={doExport}
                >
                  Export range…
                </button>
              </div>
            </div>

            <div className="chips-row">
              <span className="kick">Includes</span>
              <button
                className={`chip ${(config?.includeClocks ?? true) ? 'on' : ''}`}
                title="Include the Grid's clock rows (formats week grid)"
                onClick={async () =>
                  onConfig(await window.api.setIncludeClocks(!(config?.includeClocks ?? true)))
                }
              >
                {(config?.includeClocks ?? true) ? '✓ ' : ''}CLOCKS
              </button>
              <button
                className={`chip ${(config?.includeElements ?? true) ? 'on' : ''}`}
                title="Include the Booking elements (Booking tab)"
                onClick={async () =>
                  onConfig(await window.api.setIncludeElements(!(config?.includeElements ?? true)))
                }
              >
                {(config?.includeElements ?? true) ? '✓ ' : ''}
                {templates.length} BOOKING ELEMENTS
              </button>
              <button
                className={`chip ${config?.hasPromos && (config?.includePromos ?? true) ? 'on' : ''}`}
                disabled={!config?.hasPromos}
                title={
                  config?.hasPromos
                    ? 'Include the scheduled promos'
                    : 'No promos file loaded (Grid → Promos)'
                }
                onClick={async () =>
                  onConfig(await window.api.setIncludePromos(!(config?.includePromos ?? true)))
                }
              >
                {config?.hasPromos && (config?.includePromos ?? true) ? '✓ ' : ''}PROMOS
              </button>
              <button
                className={`chip ${config?.hasMusic && (config?.includeMusic ?? true) ? 'on' : ''}`}
                disabled={!config?.hasMusic}
                title={
                  config?.hasMusic
                    ? 'Include the imported Music Log (repeats on every day of the range)'
                    : 'No music log imported (Music log panel →)'
                }
                onClick={async () =>
                  onConfig(await window.api.setIncludeMusic(!(config?.includeMusic ?? true)))
                }
              >
                {config?.hasMusic && (config?.includeMusic ?? true) ? '✓ ' : ''}MUSIC LOG
              </button>
              <button
                className={`chip ${config?.includeAzan ? 'on' : ''}`}
                title="Include the 5 daily azan rows"
                onClick={async () =>
                  onConfig(await window.api.setIncludeAzan(!config?.includeAzan))
                }
              >
                {config?.includeAzan ? '✓ ' : ''}AZAN
              </button>
              <button
                className={`chip ${hourly.enabled ? 'on' : ''}`}
                onClick={() => updateHourly({ enabled: !hourly.enabled })}
              >
                {hourly.enabled ? '✓ ' : ''}HOURLY MARKERS {pad2(hourly.startHour)}–
                {pad2(hourly.endHour)}
              </button>
              {hourly.enabled && (
                <>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hourly.startHour}
                    onChange={(e) => updateHourly({ startHour: +e.target.value })}
                    style={{ width: 52 }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hourly.endHour}
                    onChange={(e) => updateHourly({ endHour: +e.target.value })}
                    style={{ width: 52 }}
                  />
                </>
              )}
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                <label
                  className="kick"
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
                <button
                  className="chip"
                  disabled={rows.length === 0}
                  onClick={() => setReplaceOpen(true)}
                >
                  SEARCH &amp; REPLACE…
                </button>
                <button
                  className={`chip ${simStale && rows.length > 0 ? 'stale' : ''}`}
                  disabled={rows.length === 0}
                  title="Recompute the Expected column from the current order, cues and durations"
                  onClick={refreshSim}
                >
                  ↻ EXPECTED{simStale && rows.length > 0 ? ' — OUTDATED' : ''}
                </button>
                <button
                  className="chip"
                  disabled={rows.length === 0}
                  title="Show only the log grid, full screen (Esc exits)"
                  onClick={() => setFull(true)}
                >
                  ⛶ FULL SCREEN
                </button>
              </div>
            </div>
          </>
        )}

        <div className="work-body">
          {rows.length === 0 ? (
            <p className="empty">
              {ready
                ? 'No log open. Build the range from the Grid, or open a .bsi/.txt log.'
                : 'Nothing to build yet — paint clocks on the Grid or add Booking elements first (or turn on AZAN).'}
            </p>
          ) : (
            <LogGrid
              rows={rows}
              onRows={updateRows}
              sim={sim}
              durationOf={durationOf}
              onDuration={setDuration}
              categoryColors={categoryColors}
              categoryTextColors={categoryTextColors}
            />
          )}
        </div>
      </div>

      {!full && (
        <div className="work-insp">
          <div>
            <div className="kick">Log</div>
            <div className="insp-title">{rows.length} rows</div>
            <div className="muted" style={{ fontSize: 12 }} title={path ?? undefined}>
              {rows.length > 0 ? (fileName ?? '(unsaved log)') : 'nothing open'}
              {dirty ? ' — unsaved changes' : ''}
            </div>
            {status && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {status}
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="attn">
              <div className="attn-title">NEEDS ATTENTION · {warnings.length}</div>
              {warnings.map((w, i) => (
                <div key={i} className="attn-line">
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="insp-sec">
            <div className="kick">Audio database</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {db ? (
                <span title={db.path}>
                  {dbName} — {db.trackCount} tracks (table “{db.table}”). Durations and descriptions
                  are real, so Expected simulates the deck.
                </span>
              ) : (
                'No audio database loaded — durations default to 0, so Expected assumes instant rows.'
              )}
            </div>
            <div className="row">
              <button className="btn" onClick={openDb}>
                {db ? 'Replace DB…' : 'Load Simian DB…'}
              </button>
              {db && rows.length > 0 && (
                <button className="btn-link" onClick={() => fillDurations(rows)}>
                  refresh durations
                </button>
              )}
            </div>
            {db && rows.length > 0 && (
              <button
                className="btn"
                title="Fill Duration and overwrite Description from the audio database for every row whose file name it knows"
                onClick={fillFromDb}
              >
                Update Dur &amp; Desc from DB
              </button>
            )}
          </div>

          <div className="insp-sec">
            <div className="kick">Music log</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {music ? (
                <span>
                  {music.fileName} — {music.eventCount} music rows, {music.commentCount} markers.
                  Included as its own layer on every day of the built range.
                </span>
              ) : (
                'No music log imported. Import the fixed-width log your music scheduler writes for Simian.'
              )}
            </div>
            <div className="row">
              <button className="btn" onClick={importMusicLog}>
                {music ? 'Replace…' : 'Import Music Log…'}
              </button>
              <button
                className="btn-link"
                title="Field positions (START/LENGTH), like Simian's Log Import settings"
                onClick={() => setMusicDialogOpen(true)}
              >
                import settings
              </button>
              {music && (
                <button className="btn-link" onClick={removeMusicLog}>
                  remove
                </button>
              )}
            </div>
          </div>

          <div className="insp-sec">
            <div className="kick">Expected legend</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <div>
                <span style={{ fontWeight: 800, color: 'var(--danger)' }}>red</span> — cut short by
                a timed row
              </div>
              <div>
                <span style={{ fontWeight: 800, color: 'var(--warn)' }}>skipped</span> — never
                reached
              </div>
              <div>
                <span style={{ fontWeight: 800 }}>@ # +</span> — timed · timed-next · sequential
              </div>
            </div>
          </div>

          <div className="insp-foot">
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Logs are written as ANSI (Windows-1256) for Simian → Tools → Log Import.
            </div>
            <div className="row">
              <button
                className="btn primary"
                disabled={rows.length === 0 || (!dirty && Boolean(path))}
                onClick={() => save(false)}
              >
                Save log
              </button>
              <button className="btn" disabled={rows.length === 0} onClick={() => save(true)}>
                Save as…
              </button>
            </div>
          </div>
        </div>
      )}

      <MusicImportDialog
        open={musicDialogOpen}
        musicFileName={music?.fileName ?? null}
        onSaved={() => window.api.getMusicLog().then(setMusic)}
        onClose={() => setMusicDialogOpen(false)}
      />

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

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** `2026-07-30` → `30 JUL 2026` (falls back to the raw value). */
function prettyDate(iso: string): string {
  const d = toCalendarDate(iso)
  if (!d) return iso
  return new Date(Date.UTC(d.year, d.month - 1, d.day))
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    })
    .toUpperCase()
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
