import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_CATEGORIES,
  emptyDayDefaults,
  emptyFormatSet,
  FORMAT_COLORS,
  type FormatSet,
  type HourFormat
} from '../../../main/core/format/types'
import { weekday } from '../../../main/core/dates'
import { ClockEditor } from './ClockEditor'
import { WeekGrid } from './WeekGrid'
import { toCalendarDate } from '../App'

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Tomorrow (system date + 1) as YYYY-MM-DD — the default export date. */
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

type Tab = 'clocks' | 'default' | 'grid'

export function FormatsView(): JSX.Element {
  const [set, setSet] = useState<FormatSet>(emptyFormatSet())
  const [tab, setTab] = useState<Tab>('clocks')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDefaultId, setSelectedDefaultId] = useState<string | null>(null)
  const [erasing, setErasing] = useState(false)
  const [exportDate, setExportDate] = useState(tomorrowISO)
  const [status, setStatus] = useState('')
  const loaded = useRef(false)
  const dateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.loadFormats().then((s) => {
      setSet(s)
      if (s.formats[0]) setSelectedId(s.formats[0].id)
      loaded.current = true
    })
  }, [])

  // Auto-save after the initial load.
  useEffect(() => {
    if (!loaded.current) return
    window.api.saveFormats(set)
  }, [set])

  const date = toCalendarDate(exportDate)
  const [preview, setPreview] = useState('')

  // Preview is a dry-run resolve in main (date + sequential tokens), so it does
  // not advance the rotation queues.
  useEffect(() => {
    if (!date) {
      setPreview('')
      return
    }
    let cancelled = false
    window.api.previewFormatForDate(set, date).then((t) => {
      if (!cancelled) setPreview(t)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, exportDate])

  function addFormat(): void {
    const format: HourFormat = {
      id: crypto.randomUUID(),
      name: `Format ${set.formats.length + 1}`,
      color: FORMAT_COLORS[set.formats.length % FORMAT_COLORS.length],
      rows: []
    }
    setSet((s) => ({ ...s, formats: [...s.formats, format] }))
    setSelectedId(format.id)
    setErasing(false)
  }

  function addCategory(cat: string): void {
    setSet((s) => {
      const cur = s.categories ?? DEFAULT_CATEGORIES
      if (cur.includes(cat)) return s
      return { ...s, categories: [...cur, cat] }
    })
  }

  function changeFormat(format: HourFormat): void {
    setSet((s) => ({
      ...s,
      formats: s.formats.map((f) => (f.id === format.id ? format : f))
    }))
  }

  function deleteFormat(id: string): void {
    setSet((s) => ({
      ...s,
      formats: s.formats.filter((f) => f.id !== id),
      grid: { cells: s.grid.cells.map((row) => row.map((c) => (c === id ? null : c))) }
    }))
    if (selectedId === id) setSelectedId(null)
  }

  function assign(weekday: number, hour: number, id: string | null): void {
    setSet((s) => {
      const cells = s.grid.cells.map((row) => row.slice())
      cells[weekday][hour] = id
      return { ...s, grid: { cells } }
    })
  }

  // --- Default clocks (separate list; applied to whole days) ---
  function addDefaultClock(): void {
    const clocks = set.defaultClocks ?? []
    const clock: HourFormat = {
      id: crypto.randomUUID(),
      name: `Default ${clocks.length + 1}`,
      color: FORMAT_COLORS[clocks.length % FORMAT_COLORS.length],
      rows: []
    }
    setSet((s) => ({ ...s, defaultClocks: [...(s.defaultClocks ?? []), clock] }))
    setSelectedDefaultId(clock.id)
  }

  function changeDefaultClock(clock: HourFormat): void {
    setSet((s) => ({
      ...s,
      defaultClocks: (s.defaultClocks ?? []).map((c) => (c.id === clock.id ? clock : c))
    }))
  }

  function deleteDefaultClock(id: string): void {
    setSet((s) => ({
      ...s,
      defaultClocks: (s.defaultClocks ?? []).filter((c) => c.id !== id),
      dayDefaults: (s.dayDefaults ?? emptyDayDefaults()).map((d) => (d === id ? null : d))
    }))
    if (selectedDefaultId === id) setSelectedDefaultId(null)
  }

  function setDayDefault(wd: number, id: string | null): void {
    setSet((s) => {
      const dd = (s.dayDefaults ?? emptyDayDefaults()).slice()
      dd[wd] = id
      return { ...s, dayDefaults: dd }
    })
  }

  async function doExportWeek(): Promise<void> {
    const res = await window.api.exportFormatWeek(set)
    setStatus(res.saved ? `Saved ${res.path}` : 'Export cancelled')
  }

  async function doExportForDate(): Promise<void> {
    if (!date) return
    const res = await window.api.exportFormatForDate(set, date)
    setStatus(res.saved ? `Saved ${res.path}` : 'Export cancelled')
  }

  return (
    <div className="view wide">
      <div className="card-head">
        <h1>Formats</h1>
        <div className="row">
          <div className="row seg">
            <button
              className={`seg-btn ${tab === 'clocks' ? 'on' : ''}`}
              onClick={() => setTab('clocks')}
            >
              Clocks
            </button>
            <button
              className={`seg-btn ${tab === 'default' ? 'on' : ''}`}
              onClick={() => setTab('default')}
            >
              Default clocks
            </button>
            <button
              className={`seg-btn ${tab === 'grid' ? 'on' : ''}`}
              onClick={() => setTab('grid')}
            >
              Week grid
            </button>
          </div>
        </div>
      </div>
      <p className="muted">
        Build reusable hour formats (clocks), then paint them onto the week grid. Each cell is one
        hour; export a Simian skeleton for a day or the whole week.
      </p>

      {tab === 'clocks' && (
        <ClockEditor
          formats={set.formats}
          categories={set.categories ?? DEFAULT_CATEGORIES}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddFormat={addFormat}
          onChangeFormat={changeFormat}
          onDeleteFormat={deleteFormat}
          onAddCategory={addCategory}
        />
      )}

      {tab === 'default' && (
        <>
          <p className="muted">
            A <strong>default clock</strong> applies to <strong>every hour</strong> of a day (a base
            clock). Create one or more here, then choose which one each day uses in the Week grid.
            Default clocks are not painted onto the grid.
          </p>
          <ClockEditor
            formats={set.defaultClocks ?? []}
            categories={set.categories ?? DEFAULT_CATEGORIES}
            selectedId={selectedDefaultId}
            onSelect={setSelectedDefaultId}
            onAddFormat={addDefaultClock}
            onChangeFormat={changeDefaultClock}
            onDeleteFormat={deleteDefaultClock}
            onAddCategory={addCategory}
          />
        </>
      )}

      {tab === 'grid' && (
        <>
          <div className="palette">
            {set.formats.map((f) => (
              <button
                key={f.id}
                className={`pal-item ${!erasing && selectedId === f.id ? 'on' : ''}`}
                onClick={() => {
                  setSelectedId(f.id)
                  setErasing(false)
                }}
              >
                <span className="swatch" style={{ background: f.color }} />
                {f.name || '(unnamed)'}
              </button>
            ))}
            <button
              className={`pal-item ${erasing ? 'on' : ''}`}
              onClick={() => setErasing(true)}
            >
              ⌫ Eraser
            </button>
            {set.formats.length === 0 && (
              <span className="muted">Create a clock first (Clocks tab).</span>
            )}
          </div>

          <p className="muted" style={{ margin: '0 0 8px' }}>
            Paint clocks onto the hours. The <strong>Default</strong> row picks a default clock per
            day (or none) — it's applied to every hour, layered under what you paint.
          </p>
          <WeekGrid
            grid={set.grid}
            formats={set.formats}
            defaultClocks={set.defaultClocks ?? []}
            dayDefaults={set.dayDefaults ?? emptyDayDefaults()}
            paintId={erasing ? null : selectedId}
            onAssign={assign}
            onSetDayDefault={setDayDefault}
          />
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Export</h2>
          <div className="row">
            <label>
              Date{' '}
              <input
                ref={dateRef}
                type="date"
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
              />
            </label>
            <button
              className="btn"
              title="Open calendar"
              onClick={() => dateRef.current?.showPicker?.()}
            >
              📅
            </button>
            <span className="muted">{date ? WEEKDAY_FULL[weekday(date)] : '—'}</span>
            <button className="btn primary" disabled={!date} onClick={doExportForDate}>
              Export for date…
            </button>
            <button className="btn" onClick={doExportWeek}>
              Export week template…
            </button>
            {status && <span className="muted">{status}</span>}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Pick any date — the program finds the weekday and exports that day's schedule, with date
          tokens (e.g. <code>[yymmdd]</code>) filled in. Preview below reflects the selected date.
        </p>
        <textarea className="preview" readOnly value={preview} spellCheck={false} dir="auto" />
      </div>
    </div>
  )
}
