import { useEffect, useRef, useState } from 'react'
import type { AppConfig, MusicSummary, TemplateSummary } from '../../../main/session'
import type { SimianDbSummary } from '../../../preload'
import { LogGrid } from '../components/LogGrid'
import { checkLog, logDate } from '../lib/logCheck'
import { checkBookingElements } from '../../../main/core/schedule/bookingCheck'
import { parseLogText, rowKind, serializeRows, type LogRow } from '../lib/logRows'
import { isMod, overlayOpen } from '../lib/shortcuts'
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
  // ---- Editor document (from the old Editor tab) -----------------------------
  const [rows, setRows] = useState<LogRow[]>([])
  const [path, setPath] = useState<string | null>(null)
  /** File the log was opened from (kept for .bsi too, unlike `path`) — F5 reloads it. */
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [db, setDb] = useState<SimianDbSummary | null>(null)
  /** Row id → duration seconds (from the DB lookup, or edited by hand). */
  const [durations, setDurations] = useState<Map<number, number>>(new Map())
  const [replaceOpen, setReplaceOpen] = useState(false)
  /** Pending discard-unsaved-changes question (in-app; see guardDirty). */
  const [discard, setDiscard] = useState<{ message: string; go: () => void } | null>(null)
  // Full-screen mode: the grid takes the whole window over a slim control bar.
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent): void => {
      // A dialog on top gets Escape first (it closes itself); the next press exits.
      if (e.key === 'Escape' && !overlayOpen()) setFull(false)
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
  /** Log-check findings from the last ↻ run (empty cues, macro traps, clashes). */
  const [checks, setChecks] = useState<string[]>([])

  useEffect(() => {
    setSimStale(true)
  }, [rows, durations])

  useEffect(() => {
    setSim(simulateLog(rows, (r) => durations.get(r.id) ?? 0, parseTimeToSeconds(simStart) ?? 0))
    setChecks(checkLog(rows))
    setSimStale(false)
    void runBookingCheck(rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTick])

  /**
   * Pre-air booking check (runs with the ↻ pass): every element spot booked
   * for the log's date must still be IN the log after human editing, and no
   * element-named row may exceed its booked count. Errors only, per the spec.
   */
  const [bookingChecks, setBookingChecks] = useState<string[]>([])
  async function runBookingCheck(rs: LogRow[]): Promise<void> {
    const date = logDate(rs)
    if (!date) {
      setBookingChecks([])
      return
    }
    const { planned, codes } = await window.api.expectedElements(date)
    if (planned.length === 0 && codes.length === 0) {
      setBookingChecks([])
      return
    }
    const names = rs.filter((r) => rowKind(r) === 'event').map((r) => r.fields[2])
    const issues = checkBookingElements(
      planned.map((p) => p.name),
      names,
      codes
    )
    setBookingChecks(
      issues.map((i) =>
        i.status === 'not-inserted'
          ? `Booking · ${i.name} — NOT INSERTED (booked ${i.booked}, in log ${i.inLog})`
          : `Booking · ${i.name} — EXTRA (booked ${i.booked}, in log ${i.inLog})`
      )
    )
  }

  /** All ↻ findings together — the panel, its count and the report share it. */
  const allChecks = [...checks, ...bookingChecks]

  async function saveCheckReport(): Promise<void> {
    const date = logDate(rows)
    const iso = date
      ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
      : 'unknown-date'
    const text =
      `LOG CHECK REPORT — ${iso}\r\n` +
      `Log: ${fileName ?? '(built from Grid, unsaved)'} · ${rows.length} rows\r\n\r\n` +
      (allChecks.length === 0 ? 'No issues found.\r\n' : allChecks.join('\r\n') + '\r\n')
    const res = await window.api.saveReport(text, `log-check-${iso}.txt`)
    if (res.saved) setStatus(`Report saved to ${res.path}`)
  }

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
   * Pull Duration, Description AND Category from the audio DB for every row
   * whose file name it knows. Descriptions/categories overwrite the log's
   * text, so this only runs from its button ("Update Data"), never
   * automatically, and it marks the log dirty.
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
    let descChanged = 0
    let catChanged = 0
    const next = rows.map((r) => {
      if (rowKind(r) !== 'event') return r
      const hit = found[r.fields[2].trim()]
      const desc = hit?.description
      const cat = hit?.category
      const newDesc = desc && desc !== r.fields[4]
      const newCat = cat && cat !== r.fields[3].trim().toUpperCase()
      if (!newDesc && !newCat) return r
      if (newDesc) descChanged++
      if (newCat) catChanged++
      const fields = [...r.fields] as LogRow['fields']
      if (newDesc) fields[4] = desc
      if (newCat) fields[3] = cat
      return { ...r, fields }
    })
    if (descChanged + catChanged > 0) updateRows(next)
    refreshSim()
    const matched = Object.keys(found).length
    setStatus(
      `Updated from DB: ${matched} of ${names.length} names matched — ` +
        `${descChanged} description${descChanged === 1 ? '' : 's'}, ` +
        `${catChanged} categor${catChanged === 1 ? 'y' : 'ies'} changed`
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
  /**
   * Ask before discarding unsaved changes — with an in-app dialog, never
   * window.confirm(): Electron's native confirm breaks input focus after it
   * closes (electron/electron#41603), which left a freshly rebuilt log's grid
   * uneditable until a file dialog (Save) cycled window focus.
   */
  function guardDirty(message: string, go: () => void): void {
    if (dirty) setDiscard({ message, go })
    else go()
  }

  function buildFromGrid(): void {
    guardDirty('Discard unsaved changes and rebuild the log from the Grid?', () => void rebuild())
  }

  async function rebuild(): Promise<void> {
    const s = toCalendarDate(start)
    const e = toCalendarDate(end)
    if (!s || !e) return
    const res = await window.api.preview(s, e)
    loadText(res.text, null, true)
    setSourcePath(null)
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

  function openLog(): void {
    guardDirty('Discard unsaved changes and open another log?', () => void doOpenLog())
  }

  async function doOpenLog(): Promise<void> {
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
    setSourcePath(res.path)
    setWarnings([])
  }

  /** F5: re-read the opened file from disk — same flow as opening it again. */
  function reloadLog(): void {
    if (!sourcePath) return
    guardDirty('Discard unsaved changes and reload the file from disk?', () => void doReload())
  }

  async function doReload(): Promise<void> {
    if (!sourcePath) return
    const res = await window.api.reloadLog(sourcePath)
    if (res.bsi) loadText(res.text, null, false, res.rowDurations)
    else loadText(res.text, res.path, false)
    setStatus(`Reloaded ${res.path.split(/[\\/]/).pop()}`)
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

  // ---- Keyboard shortcuts ---------------------------------------------------
  // One window listener while the LOG tab is showing. It reads the current
  // actions/state through this ref (same pattern as LogGrid's `live`), so the
  // listener itself only re-registers when the tab's visibility flips.
  const shortcut = useRef({
    openLog,
    buildFromGrid,
    save,
    refreshSim,
    reloadLog,
    canReload: sourcePath !== null,
    openReplace: () => setReplaceOpen(true),
    canBuild: ready,
    // Mirrors the Save buttons' disabled condition.
    canSave: rows.length > 0 && (dirty || !path),
    hasRows: rows.length > 0
  })
  shortcut.current = {
    openLog,
    buildFromGrid,
    save,
    refreshSim,
    reloadLog,
    canReload: sourcePath !== null,
    openReplace: () => setReplaceOpen(true),
    canBuild: ready,
    canSave: rows.length > 0 && (dirty || !path),
    hasRows: rows.length > 0
  }

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      const s = shortcut.current
      if (e.repeat) return
      if (e.key === 'F5' && !isMod(e) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        if (overlayOpen()) return
        // F5 = reload the opened file from disk; a built (unopened) log has no
        // file, so F5 falls back to refreshing the Expected column.
        if (s.canReload) s.reloadLog()
        else if (s.hasRows) s.refreshSim()
        return
      }
      if (!isMod(e) || e.altKey || e.shiftKey) return
      switch (e.key.toLowerCase()) {
        case 'o':
          e.preventDefault()
          if (!overlayOpen()) void s.openLog()
          break
        case 's':
          e.preventDefault()
          if (s.canSave && !overlayOpen()) void s.save(false)
          break
        case 'b':
          e.preventDefault()
          if (s.canBuild && !overlayOpen()) void s.buildFromGrid()
          break
        case 'f':
          e.preventDefault()
          if (s.hasRows && !overlayOpen()) s.openReplace()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

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
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              {rows.length} rows
              {dirty ? ' — unsaved' : ''}
            </span>
            <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
              <button
                className={`chip ${simStale && rows.length > 0 ? 'stale' : ''}`}
                disabled={rows.length === 0}
                title="Recompute the Expected column and re-run the log check"
                onClick={refreshSim}
              >
                ↻ EXPECTED{simStale && rows.length > 0 ? ' — OUTDATED' : ''}
              </button>
              <button
                className="chip"
                disabled={rows.length === 0}
                title="Find and replace across the log (Ctrl+F)"
                onClick={() => setReplaceOpen(true)}
              >
                SEARCH &amp; REPLACE…
              </button>
              <button
                className="btn primary"
                disabled={rows.length === 0 || (!dirty && Boolean(path))}
                title="Save the log (Ctrl+S)"
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
                <button
                  className="btn"
                  title="Open a .bsi or .txt log file (Ctrl+O) — F5 reloads the open file from disk"
                  onClick={openLog}
                >
                  Open…
                </button>
                <button
                  className="btn"
                  disabled={!ready}
                  title="Compose the range from the Grid (clocks + booked elements + promos + azan + music log) and load it here for editing (Ctrl+B)"
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
                  title="Find and replace across the log (Ctrl+F)"
                  onClick={() => setReplaceOpen(true)}
                >
                  SEARCH &amp; REPLACE…
                </button>
                <button
                  className={`chip ${simStale && rows.length > 0 ? 'stale' : ''}`}
                  disabled={rows.length === 0}
                  title="Recompute the Expected column from the current order, cues and durations, and re-run the log check"
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
              active={active}
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
            <div className="muted" style={{ fontSize: 'var(--fs-xs)' }} title={path ?? undefined}>
              {rows.length > 0 ? (fileName ?? '(unsaved log)') : 'nothing open'}
              {dirty ? ' — unsaved changes' : ''}
            </div>
            {status && (
              <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 4 }}>
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

          {rows.length > 0 &&
            (allChecks.length > 0 ? (
              <div className="attn">
                <div className="attn-title">
                  LOG CHECK · {allChecks.length}
                  {simStale ? ' — OUTDATED' : ''}
                </div>
                {allChecks.map((c, i) => (
                  <div key={i} className="attn-line">
                    {c}
                  </div>
                ))}
                <button
                  className="btn-link"
                  title="Save these findings as a .txt report"
                  onClick={saveCheckReport}
                >
                  Save report…
                </button>
              </div>
            ) : (
              <div className="insp-sec">
                <div className="kick">Log check</div>
                <div className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
                  No issues found{simStale ? ' — outdated, hit ↻ EXPECTED to re-check' : ''}. Checks
                  cues, MACRO placement, timed-row clashes and booked-element presence.
                </div>
              </div>
            ))}

          <div className="insp-sec">
            <div className="kick">Audio database</div>
            <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
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
                title="Fill Duration and overwrite Description and Category from the audio database for every row whose file name it knows"
                onClick={fillFromDb}
              >
                Update Data
              </button>
            )}
          </div>

          <div className="insp-sec">
            <div className="kick">Music log</div>
            <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
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
            <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
              <div>
                <span style={{ fontWeight: 800, color: 'var(--danger)' }}>red</span> — cut short by
                a timed row
              </div>
              <div>
                <span style={{ fontWeight: 800, color: 'var(--warn)' }}>yellow</span> — never
                reached (Expected left empty)
              </div>
              <div>
                <span style={{ fontWeight: 800 }}>@ # +</span> — timed · timed-next · sequential
              </div>
            </div>
          </div>

          <div className="insp-foot">
            <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 8 }}>
              Logs are written as ANSI (Windows-1256) for Simian → Tools → Log Import.
            </div>
            <div className="row">
              <button
                className="btn primary"
                disabled={rows.length === 0 || (!dirty && Boolean(path))}
                title="Save the log (Ctrl+S)"
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

      {discard && (
        <div className="modal-overlay" onMouseDown={() => setDiscard(null)}>
          <div
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDiscard(null)
            }}
          >
            <div className="modal-head">
              <h2>Unsaved changes</h2>
              <button className="btn-link" onClick={() => setDiscard(null)}>
                ✕
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
              {discard.message}
            </p>
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDiscard(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                autoFocus
                onClick={() => {
                  setDiscard(null)
                  discard.go()
                }}
              >
                Discard
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
