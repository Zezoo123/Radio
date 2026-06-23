import { useEffect, useMemo, useRef, useState } from 'react'
import {
  emptyFormatSet,
  FORMAT_COLORS,
  WEEKDAY_LABELS,
  type FormatSet,
  type HourFormat
} from '../../../main/core/format/types'
import { serializeWeek } from '../../../main/core/format/expand'
import { ClockEditor } from './ClockEditor'
import { WeekGrid } from './WeekGrid'

type Tab = 'clocks' | 'grid'

export function FormatsView(): JSX.Element {
  const [set, setSet] = useState<FormatSet>(emptyFormatSet())
  const [tab, setTab] = useState<Tab>('clocks')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [erasing, setErasing] = useState(false)
  const [exportDay, setExportDay] = useState(1)
  const [status, setStatus] = useState('')
  const loaded = useRef(false)

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

  const preview = useMemo(() => serializeWeek(set), [set])

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

  function changeFormat(format: HourFormat): void {
    setSet((s) => ({
      ...s,
      formats: s.formats.map((f) => (f.id === format.id ? format : f))
    }))
  }

  function deleteFormat(id: string): void {
    setSet((s) => ({
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

  async function doExportWeek(): Promise<void> {
    const res = await window.api.exportFormatWeek(set)
    setStatus(res.saved ? `Saved ${res.path}` : 'Export cancelled')
  }

  async function doExportDay(): Promise<void> {
    const res = await window.api.exportFormatDay(set, exportDay, WEEKDAY_LABELS[exportDay])
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
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddFormat={addFormat}
          onChangeFormat={changeFormat}
          onDeleteFormat={deleteFormat}
        />
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

          <WeekGrid
            grid={set.grid}
            formats={set.formats}
            paintId={erasing ? null : selectedId}
            onAssign={assign}
          />
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Export</h2>
          <div className="row">
            <select value={exportDay} onChange={(e) => setExportDay(+e.target.value)}>
              {WEEKDAY_LABELS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <button className="btn" onClick={doExportDay}>
              Export day…
            </button>
            <button className="btn primary" onClick={doExportWeek}>
              Export week…
            </button>
            {status && <span className="muted">{status}</span>}
          </div>
        </div>
        <textarea className="preview" readOnly value={preview} spellCheck={false} dir="auto" />
      </div>
    </div>
  )
}
