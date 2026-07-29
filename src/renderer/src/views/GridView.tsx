import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_CATEGORIES,
  emptyDayDefaults,
  emptyFormatSet,
  FORMAT_COLORS,
  WEEKDAY_LABELS,
  type FormatSet,
  type HourFormat
} from '../../../main/core/format/types'
import type { AzanTimes } from '../../../main/core/prayer/azan'
import type { CalendarDate } from '../../../main/core/types'
import type { AppConfig, PromoSummary } from '../../../main/session'
import type { PromoRules } from '../../../preload'
import type { PromoEntry } from '../../../main/core/parsers/promosFile'
import type { PromoWeekRow } from '../../../main/core/promos/schedule'
import { ClockEditor } from './ClockEditor'
import { toCalendarDate } from '../App'
import { tomorrowISO } from '../lib/dates'

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad2 = (n: number): string => String(n).padStart(2, '0')
const abbreviate = (name: string): string => (name.length <= 8 ? name : name.slice(0, 7) + '…')

const PRAYERS: { key: keyof AzanTimes; label: string }[] = [
  { key: 'fajr', label: 'FAGR' },
  { key: 'dhuhr', label: 'DUHR' },
  { key: 'asr', label: 'ASR' },
  { key: 'maghrib', label: 'MAGHRIB' },
  { key: 'isha', label: 'ISHA' }
]

type Layer = 'clocks' | 'promos' | 'blocked'
type Mode = 'grid' | 'clock' | 'default'

const LAYER_HINTS: Record<Layer, string> = {
  clocks: 'Paint the selected clock onto hours · the DEF row fills whole days',
  promos: 'Pick a program, then click or drag hours to exclude them',
  blocked: 'Click or drag to block hours — blocked hours never receive a promo'
}

const emptyBlockedGrid = (): number[][] => Array.from({ length: 7 }, () => [])

/** Calendar date of `wd` (0=Sun…6=Sat) within the week containing `anchorISO`. */
function dateForWeekday(anchorISO: string, wd: number): CalendarDate | null {
  const d = toCalendarDate(anchorISO)
  if (!d) return null
  const t = Date.UTC(d.year, d.month - 1, d.day)
  const start = t - new Date(t).getUTCDay() * 86400000
  const day = new Date(start + wd * 86400000)
  return { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() }
}

/** The clock rows that fire at `hour` (no `hours` restriction = every hour). */
function rowsAtHour(clock: HourFormat, hour: number): HourFormat['rows'] {
  return clock.rows
    .filter((r) => {
      const hs = r.hours ?? (r.hour != null ? [r.hour] : [])
      return hs.length === 0 || hs.includes(hour)
    })
    .slice()
    .sort((a, b) => a.minute - b.minute || a.second - b.second)
}

interface Props {
  onOpenLog: () => void
  onOpenSettings: () => void
}

export function GridView({ onOpenLog, onOpenSettings }: Props): JSX.Element {
  // ---- Formats document (identical persistence contract to the old view:
  // load once, debounce saves 350 ms, flush on unmount) ----------------------
  const [set, setSet] = useState<FormatSet>(emptyFormatSet())
  const loaded = useRef(false)
  const pendingSave = useRef<FormatSet | null>(null)

  useEffect(() => {
    window.api.loadFormats().then((s) => {
      setSet(s)
      if (s.formats[0]) setSelectedId(s.formats[0].id)
      loaded.current = true
    })
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    pendingSave.current = set
    const t = setTimeout(() => {
      pendingSave.current = null
      window.api.saveFormats(set)
    }, 350)
    return () => clearTimeout(t)
  }, [set])
  useEffect(
    () => () => {
      if (pendingSave.current) window.api.saveFormats(pendingSave.current)
    },
    []
  )

  // ---- Workbench state ------------------------------------------------------
  const [layer, setLayer] = useState<Layer>('clocks')
  const [mode, setMode] = useState<Mode>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDefaultId, setSelectedDefaultId] = useState<string | null>(null)
  const [erasing, setErasing] = useState(false)
  const [sel, setSel] = useState<{ wd: number; hour: number } | null>(null)
  // Editing a clock clears the hour selection so the inspector goes quiet and
  // the row editor has the reader's full attention.
  useEffect(() => {
    if (mode !== 'grid') setSel(null)
  }, [mode])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  useEffect(() => {
    if (!confirmDeleteId) return
    const t = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(t)
  }, [confirmDeleteId])

  // ---- Promos data ----------------------------------------------------------
  const [summary, setSummary] = useState<PromoSummary | null>(null)
  const [entries, setEntries] = useState<PromoEntry[]>([])
  const [week, setWeek] = useState<PromoWeekRow[]>([])
  const [rules, setRules] = useState<PromoRules>({ blockedHours: emptyBlockedGrid(), breaks: [] })
  const [anchor, setAnchor] = useState(tomorrowISO)
  const [selProgram, setSelProgram] = useState<string | null>(null)
  const [newBreak, setNewBreak] = useState('')

  const refreshInfo = useCallback(async () => {
    setSummary(await window.api.getPromos())
    setEntries(await window.api.listPromoEntries())
    setRules(await window.api.getPromoRules())
  }, [])

  const refreshWeek = useCallback(async (value: string) => {
    const d = toCalendarDate(value)
    if (!d) return
    setWeek(await window.api.promoWeek(d))
  }, [])

  useEffect(() => {
    refreshInfo()
  }, [refreshInfo])

  useEffect(() => {
    refreshWeek(anchor)
  }, [anchor, refreshWeek, summary])

  // Station rules save: instant UI, debounced write (dragging paints per cell).
  const pendingRules = useRef<PromoRules | null>(null)
  const rulesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const anchorRef = useRef(anchor)
  useEffect(() => {
    anchorRef.current = anchor
  }, [anchor])

  const flushRules = useCallback(async () => {
    const next = pendingRules.current
    if (!next) return
    pendingRules.current = null
    await window.api.setPromoRules(next)
    await refreshWeek(anchorRef.current)
  }, [refreshWeek])

  function saveRules(next: PromoRules): void {
    setRules(next)
    pendingRules.current = next
    clearTimeout(rulesTimer.current)
    rulesTimer.current = setTimeout(() => void flushRules(), 300)
  }

  useEffect(
    () => () => {
      clearTimeout(rulesTimer.current)
      if (pendingRules.current) void window.api.setPromoRules(pendingRules.current)
    },
    []
  )

  // ---- Azan (inspector) -----------------------------------------------------
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [azan, setAzan] = useState<AzanTimes | null>(null)

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  useEffect(() => {
    if (!sel) return
    const d = dateForWeekday(anchor, sel.wd)
    if (!d) return
    let gone = false
    window.api.azanTimesForDate(d).then((t) => {
      if (!gone) setAzan(t)
    })
    return () => {
      gone = true
    }
  }, [sel, anchor])

  // ---- Format mutators (lifted unchanged from the old Formats view) ---------
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
    setMode('clock')
  }

  function addCategory(cat: string): void {
    setSet((s) => {
      const cur = s.categories ?? DEFAULT_CATEGORIES
      if (cur.includes(cat)) return s
      return { ...s, categories: [...cur, cat] }
    })
  }

  function changeFormat(format: HourFormat): void {
    setSet((s) => ({ ...s, formats: s.formats.map((f) => (f.id === format.id ? format : f)) }))
  }

  function duplicateClock(format: HourFormat): HourFormat {
    return {
      ...format,
      id: crypto.randomUUID(),
      name: `${format.name} copy`,
      rows: format.rows.map((r) => ({ ...r }))
    }
  }

  function duplicateFormat(id: string): void {
    const orig = set.formats.find((f) => f.id === id)
    if (!orig) return
    const copy = duplicateClock(orig)
    setSet((s) => ({ ...s, formats: [...s.formats, copy] }))
    setSelectedId(copy.id)
  }

  function deleteFormat(id: string): void {
    setSet((s) => ({
      ...s,
      formats: s.formats.filter((f) => f.id !== id),
      grid: { cells: s.grid.cells.map((row) => row.map((c) => (c === id ? null : c))) }
    }))
    if (selectedId === id) setSelectedId(null)
  }

  function assign(wd: number, hour: number, id: string | null): void {
    setSet((s) => {
      const cells = s.grid.cells.map((row) => row.slice())
      cells[wd][hour] = id
      return { ...s, grid: { cells } }
    })
  }

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
    setMode('default')
  }

  function changeDefaultClock(clock: HourFormat): void {
    setSet((s) => ({
      ...s,
      defaultClocks: (s.defaultClocks ?? []).map((c) => (c.id === clock.id ? clock : c))
    }))
  }

  function duplicateDefaultClock(id: string): void {
    const orig = (set.defaultClocks ?? []).find((c) => c.id === id)
    if (!orig) return
    const copy = duplicateClock(orig)
    setSet((s) => ({ ...s, defaultClocks: [...(s.defaultClocks ?? []), copy] }))
    setSelectedDefaultId(copy.id)
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

  // ---- Format set save/load + skeleton export -------------------------------
  const [exportDate, setExportDate] = useState(tomorrowISO)
  const [status, setStatus] = useState('')
  const date = toCalendarDate(exportDate)

  async function doSaveFormatFile(): Promise<void> {
    const res = await window.api.saveFormatFile(set)
    setStatus(res.saved ? `Format saved to ${res.path}` : 'Save cancelled')
  }

  async function doLoadFormatFile(): Promise<void> {
    const res = await window.api.loadFormatFile()
    if (res.status === 'loaded' && res.set) {
      setSet(res.set)
      setSelectedId(res.set.formats[0]?.id ?? null)
      setSelectedDefaultId(res.set.defaultClocks?.[0]?.id ?? null)
      setStatus(
        res.sequentials
          ? `Format file loaded — ${res.sequentials} sequential${
              res.sequentials === 1 ? '' : 's'
            } imported with their counters`
          : 'Format file loaded'
      )
    } else if (res.status === 'invalid') {
      setStatus('Not a valid format file')
    }
  }

  async function doExportForDate(): Promise<void> {
    if (!date) return
    const res = await window.api.exportFormatForDate(set, date)
    setStatus(res.saved ? `Saved ${res.path}` : 'Export cancelled')
  }

  async function doExportWeek(): Promise<void> {
    const res = await window.api.exportFormatWeek(set)
    setStatus(res.saved ? `Saved ${res.path}` : 'Export cancelled')
  }

  // ---- Promos file + breaks -------------------------------------------------
  async function loadPromosFile(): Promise<void> {
    const res = await window.api.openPromos()
    if (res) {
      setSummary(res)
      await refreshInfo()
    }
  }

  async function removePromosFile(): Promise<void> {
    setSummary(await window.api.removePromos())
    setEntries([])
    setWeek([])
    setSelProgram(null)
  }

  function addBreak(): void {
    const m = parseInt(newBreak, 10)
    if (!Number.isInteger(m) || m < 0 || m > 59 || rules.breaks.includes(m)) return
    setNewBreak('')
    saveRules({ ...rules, breaks: [...rules.breaks, m].sort((a, b) => a - b) })
  }

  function removeBreak(m: number): void {
    saveRules({ ...rules, breaks: rules.breaks.filter((b) => b !== m) })
  }

  // ---- Painting -------------------------------------------------------------
  const [painting, setPainting] = useState(false)
  const clockDrag = useRef(false)
  const blockedDrag = useRef<'block' | 'clear' | null>(null)
  const excludeDrag = useRef<'exclude' | 'include' | null>(null)
  const touched = useRef(
    new Map<string, { fileName: string; weekday: number; hours: Set<number> }>()
  )

  const isBlocked = (wd: number, hour: number): boolean =>
    (rules.blockedHours[wd] ?? []).includes(hour)

  function paintBlocked(wd: number, hour: number, start: boolean): void {
    if (start) blockedDrag.current = isBlocked(wd, hour) ? 'clear' : 'block'
    const dir = blockedDrag.current
    if (!dir) return
    if (isBlocked(wd, hour) === (dir === 'block')) return
    const grid = rules.blockedHours.map((hs, i) =>
      i !== wd
        ? hs
        : dir === 'block'
          ? [...hs, hour].sort((a, b) => a - b)
          : hs.filter((h) => h !== hour)
    )
    saveRules({ ...rules, blockedHours: grid })
  }

  function paintExclude(wd: number, hour: number, start: boolean): void {
    const row = week.find((r) => r.fileName === selProgram)
    const day = row?.days.find((d) => d.weekday === wd)
    if (!row || !day) return
    // Blackout + station-blocked hours are immovable from this layer.
    if (day.blockedHours.includes(hour) || isBlocked(wd, hour)) return
    if (start) excludeDrag.current = day.excludedHours.includes(hour) ? 'include' : 'exclude'
    const dir = excludeDrag.current
    if (!dir) return
    const key = `${row.fileName}|${wd}`
    let entry = touched.current.get(key)
    if (!entry) {
      entry = { fileName: row.fileName, weekday: wd, hours: new Set(day.excludedHours) }
      touched.current.set(key, entry)
    }
    const exclude = dir === 'exclude'
    if (entry.hours.has(hour) === exclude) return
    if (exclude) entry.hours.add(hour)
    else entry.hours.delete(hour)
    const hours = [...entry.hours].sort((a, b) => a - b)
    setWeek((prev) =>
      prev.map((r) =>
        r.fileName !== row.fileName
          ? r
          : { ...r, days: r.days.map((d) => (d.weekday !== wd ? d : { ...d, excludedHours: hours })) }
      )
    )
  }

  function cellDown(wd: number, hour: number): void {
    setSel({ wd, hour })
    setPainting(true)
    if (mode !== 'grid') return
    if (layer === 'clocks') {
      if (!erasing && !selectedId) return
      clockDrag.current = true
      assign(wd, hour, erasing ? null : selectedId)
    } else if (layer === 'blocked') {
      paintBlocked(wd, hour, true)
    } else if (layer === 'promos' && selProgram) {
      paintExclude(wd, hour, true)
    }
  }

  function cellEnter(wd: number, hour: number): void {
    if (clockDrag.current) assign(wd, hour, erasing ? null : selectedId)
    else if (blockedDrag.current) paintBlocked(wd, hour, false)
    else if (excludeDrag.current) paintExclude(wd, hour, false)
  }

  // Mouse-up anywhere ends every drag; accumulated exclusions persist once.
  useEffect(() => {
    const up = (): void => {
      clockDrag.current = false
      blockedDrag.current = null
      setPainting(false)
      if (!excludeDrag.current) return
      excludeDrag.current = null
      const edits = [...touched.current.values()]
      touched.current.clear()
      const d = toCalendarDate(anchor)
      if (!d || edits.length === 0) return
      void (async () => {
        let latest: PromoWeekRow[] | null = null
        for (const e of edits) {
          latest = await window.api.setPromoExcludedHours(
            e.fileName,
            e.weekday,
            [...e.hours].sort((a, b) => a - b),
            d
          )
        }
        if (latest) setWeek(latest)
      })()
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [anchor])

  // ---- Cell rendering -------------------------------------------------------
  const byId = (id: string | null): HourFormat | undefined =>
    id ? set.formats.find((f) => f.id === id) : undefined

  const promoCountAt = (wd: number, hour: number): number =>
    week.reduce((n, r) => {
      const d = r.days.find((x) => x.weekday === wd)
      return n + (d ? d.times.filter((t) => parseInt(t.slice(0, 2), 10) === hour).length : 0)
    }, 0)

  function cellProps(
    wd: number,
    hour: number
  ): { cls: string; style?: React.CSSProperties; label: string; title: string } {
    if (layer === 'clocks') {
      const fmt = byId(set.grid.cells[wd]?.[hour] ?? null)
      return {
        cls: '',
        style: fmt ? { background: fmt.color, color: '#0b0d11' } : undefined,
        label: fmt ? abbreviate(fmt.name) : '',
        title: fmt?.name ?? ''
      }
    }
    if (layer === 'blocked') {
      const on = isBlocked(wd, hour)
      return {
        cls: on ? 'cell-gblocked' : '',
        label: '',
        title: on ? 'Blocked — no promo may use this hour' : 'Click or drag to block'
      }
    }
    // Promos layer
    if (isBlocked(wd, hour))
      return { cls: 'cell-gblocked', label: '', title: 'Blocked for all promos (station rule)' }
    if (selProgram) {
      const day = week.find((r) => r.fileName === selProgram)?.days.find((d) => d.weekday === wd)
      if (!day) return { cls: '', label: '', title: '' }
      if (day.blockedHours.includes(hour))
        return { cls: 'cell-blackout', label: '', title: 'Blackout — on-air + 2h after' }
      if (day.excludedHours.includes(hour))
        return { cls: 'cell-excluded', label: '', title: 'Excluded — click to allow' }
      const mins = day.times.filter((t) => +t.slice(0, 2) === hour).map((t) => ':' + t.slice(3, 5))
      if (mins.length)
        return { cls: 'cell-placed', label: mins.join(' '), title: `Placed at ${mins.join(', ')}` }
      return { cls: '', label: '', title: 'Click or drag to exclude' }
    }
    const n = promoCountAt(wd, hour)
    return {
      cls: n > 0 ? 'cell-placed' : '',
      label: n > 0 ? String(n) : '',
      title: n > 0 ? `${n} promo${n === 1 ? '' : 's'} this hour` : ''
    }
  }

  // ---- Inspector data -------------------------------------------------------
  const paintedClock = sel ? byId(set.grid.cells[sel.wd]?.[sel.hour] ?? null) : undefined
  const dayDefaultClock = sel
    ? (set.defaultClocks ?? []).find((c) => c.id === (set.dayDefaults ?? [])[sel.wd])
    : undefined
  const inspClock = paintedClock ?? dayDefaultClock
  const inspRows = sel && inspClock ? rowsAtHour(inspClock, sel.hour) : []

  const placementsAt = (wd: number, hour: number): { time: string; name: string }[] =>
    week
      .flatMap((r) => {
        const d = r.days.find((x) => x.weekday === wd)
        if (!d) return []
        return d.times.filter((t) => +t.slice(0, 2) === hour).map((time) => ({ time, name: r.fileName }))
      })
      .sort((a, b) => a.time.localeCompare(b.time))

  const editingDefaults = mode === 'default'
  const promosLayer = layer === 'promos'

  return (
    <div className={`gridwork ${mode !== 'grid' ? 'no-insp' : ''}`}>
      {/* ---- Left rail: library (or programs on the promos layer) ---- */}
      <div className="work-side">
        {!promosLayer ? (
          <>
            <div>
              <div className="kick">Clock library</div>
              <div className="side-num">{set.formats.length} clocks</div>
            </div>
            <div className="lib-list">
              {set.formats.map((f) => (
                <div key={f.id} className={`lib-item ${!erasing && selectedId === f.id ? 'on' : ''}`}>
                  <button
                    className="lib-main"
                    title="Select as paint brush"
                    onClick={() => {
                      setSelectedId(f.id)
                      setErasing(false)
                      if (mode === 'default') setMode('clock')
                    }}
                  >
                    <span className="swatch" style={{ background: f.color }} />
                    <span className="lib-name">{f.name || '(unnamed)'}</span>
                    <span className="muted mono-sm">{f.rows.length}</span>
                  </button>
                  <button
                    className="btn-link"
                    title="Edit this clock's rows"
                    onClick={() => {
                      setSelectedId(f.id)
                      setErasing(false)
                      setMode('clock')
                    }}
                  >
                    ✎
                  </button>
                  {confirmDeleteId === f.id ? (
                    <button
                      className="btn-link danger"
                      title="Click again to delete"
                      onClick={() => {
                        deleteFormat(f.id)
                        setConfirmDeleteId(null)
                      }}
                    >
                      Delete?
                    </button>
                  ) : (
                    <button className="btn-link" title="Delete clock" onClick={() => setConfirmDeleteId(f.id)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div className={`lib-item ${erasing ? 'on' : ''}`}>
                <button className="lib-main" onClick={() => setErasing((e) => !e)}>
                  <span className="swatch swatch-eraser" />
                  <span className="lib-name">Eraser</span>
                </button>
              </div>
            </div>
            <button className="btn" onClick={addFormat}>
              + New clock
            </button>

            <div style={{ marginTop: 6 }}>
              <div className="kick" title="A default clock fills every hour of a day; pick one per day in the DEF row">
                Day defaults
              </div>
            </div>
            <div className="lib-list">
              {(set.defaultClocks ?? []).map((c) => (
                <div key={c.id} className={`lib-item ${editingDefaults && selectedDefaultId === c.id ? 'on' : ''}`}>
                  <button
                    className="lib-main"
                    title="Edit this default clock"
                    onClick={() => {
                      setSelectedDefaultId(c.id)
                      setMode('default')
                    }}
                  >
                    <span className="swatch" style={{ background: c.color }} />
                    <span className="lib-name">{c.name || '(unnamed)'}</span>
                    <span className="muted mono-sm">{c.rows.length}</span>
                  </button>
                  {confirmDeleteId === c.id ? (
                    <button
                      className="btn-link danger"
                      title="Click again to delete"
                      onClick={() => {
                        deleteDefaultClock(c.id)
                        setConfirmDeleteId(null)
                      }}
                    >
                      Delete?
                    </button>
                  ) : (
                    <button className="btn-link" title="Delete default clock" onClick={() => setConfirmDeleteId(c.id)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn" onClick={addDefaultClock}>
              + New default
            </button>
          </>
        ) : (
          <>
            <div>
              <div className="kick">Promos file</div>
              <div className="side-num">{entries.length ? `${entries.length} programs` : 'none'}</div>
              {summary?.fileName && <div className="muted mono-sm">{summary.fileName}</div>}
            </div>
            <div className="row">
              <button className="btn" onClick={loadPromosFile}>
                {entries.length ? 'Replace…' : 'Load promos…'}
              </button>
              {entries.length > 0 && (
                <button className="btn-link" onClick={removePromosFile}>
                  remove
                </button>
              )}
            </div>
            <div className="lib-list">
              <div className={`lib-item ${selProgram === null ? 'on' : ''}`}>
                <button className="lib-main" onClick={() => setSelProgram(null)}>
                  <span className="lib-name">All programs</span>
                </button>
              </div>
              {entries.map((e) => (
                <div key={e.fileName} className={`lib-item ${selProgram === e.fileName ? 'on' : ''}`}>
                  <button className="lib-main" onClick={() => setSelProgram(e.fileName)} title={e.fileName}>
                    <span className="lib-name" dir="auto">
                      {e.program}
                    </span>
                    {!e.recorded && (
                      <span className="warn-text" title="Promo not recorded yet">
                        ✗
                      </span>
                    )}
                    <span className="muted mono-sm">{e.promoCounts.reduce((a, b) => a + b, 0)}/wk</span>
                  </button>
                </div>
              ))}
            </div>
            <div className="side-foot">
              <div className="kick">Breaks — minutes promos land on</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {rules.breaks.length === 0 && <span className="muted">none (random minute)</span>}
                {rules.breaks.map((m) => (
                  <span key={m} className="pill break-pill">
                    :{pad2(m)}
                    <button className="btn-link" title="Remove this break" onClick={() => removeBreak(m)}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="row">
                <input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="min"
                  value={newBreak}
                  style={{ width: 64 }}
                  onChange={(e) => setNewBreak(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addBreak()
                  }}
                />
                <button className="btn" onClick={addBreak}>
                  + Add break
                </button>
              </div>
            </div>
          </>
        )}

        {!promosLayer && (
          <div className="side-foot">
            <div className="kick">Format set</div>
            <div className="row">
              <button className="btn" title="Save this whole setup to a file" onClick={doSaveFormatFile}>
                Save set…
              </button>
              <button className="btn" title="Load a saved format file" onClick={doLoadFormatFile}>
                Load set…
              </button>
            </div>
            <div className="kick">Skeleton export</div>
            <input type="date" value={exportDate} onChange={(e) => setExportDate(e.target.value)} />
            <div className="row">
              <button
                className="btn"
                disabled={!date}
                title={date ? WEEKDAY_FULL[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] : ''}
                onClick={doExportForDate}
              >
                Export day…
              </button>
              <button className="btn" onClick={doExportWeek}>
                Week…
              </button>
            </div>
            {status && <div className="muted" style={{ fontSize: 12 }}>{status}</div>}
          </div>
        )}
      </div>

      {/* ---- Center: layered week grid, or the clock row editor ---- */}
      {mode === 'grid' ? (
        <div className="work-main">
          <div className="work-head">
            <div className="seg">
              <button className={`seg-btn ${layer === 'clocks' ? 'on' : ''}`} onClick={() => setLayer('clocks')}>
                Clocks
              </button>
              <button className={`seg-btn ${layer === 'promos' ? 'on' : ''}`} onClick={() => setLayer('promos')}>
                Promos
              </button>
              <button className={`seg-btn ${layer === 'blocked' ? 'on' : ''}`} onClick={() => setLayer('blocked')}>
                Blocked hours
              </button>
            </div>
            <span className="kick">{LAYER_HINTS[layer]}</span>
            {promosLayer && (
              <label className="kick" style={{ marginLeft: 'auto' }}>
                Week of{' '}
                <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
              </label>
            )}
          </div>
          <div className="work-body">
            <div className={`week-grid ${painting ? 'painting' : ''}`}>
              <table className="grid-tbl">
                <thead>
                  <tr>
                    <th className="corner" />
                    {WEEKDAY_LABELS.map((d) => (
                      <th key={d}>{d}</th>
                    ))}
                  </tr>
                  {layer === 'clocks' && (
                    <tr className="default-row">
                      <th className="hour-label" title="Default clock applied to every hour of the day">
                        DEF
                      </th>
                      {WEEKDAY_LABELS.map((_, wd) => (
                        <th key={wd}>
                          <select
                            value={(set.dayDefaults ?? [])[wd] ?? ''}
                            onChange={(e) => setDayDefault(wd, e.target.value || null)}
                            disabled={(set.defaultClocks ?? []).length === 0}
                            title="Default clock for this day"
                          >
                            <option value="">none</option>
                            {(set.defaultClocks ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name || '(unnamed)'}
                              </option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {HOURS.map((hour) => (
                    <tr key={hour}>
                      <th className="hour-label">{pad2(hour)}</th>
                      {WEEKDAY_LABELS.map((_, wd) => {
                        const c = cellProps(wd, hour)
                        const isSel = sel?.wd === wd && sel?.hour === hour
                        return (
                          <td
                            key={wd}
                            className={`grid-cell ${c.cls} ${isSel ? 'sel' : ''}`}
                            style={c.style}
                            title={c.title}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              cellDown(wd, hour)
                            }}
                            onMouseEnter={() => cellEnter(wd, hour)}
                          >
                            {c.label}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="work-main">
          <div className="work-head">
            <button className="btn" onClick={() => setMode('grid')}>
              ← Back to grid
            </button>
            <span className="kick">
              {editingDefaults
                ? 'Day default clock — fills every hour of its day; rows can be limited to specific hours'
                : 'Clock — edit rows here, then paint it onto grid hours'}
            </span>
          </div>
          <div className="work-body">
            <ClockEditor
              hideList
              formats={editingDefaults ? (set.defaultClocks ?? []) : set.formats}
              categories={set.categories ?? DEFAULT_CATEGORIES}
              selectedId={editingDefaults ? selectedDefaultId : selectedId}
              onSelect={editingDefaults ? setSelectedDefaultId : setSelectedId}
              onAddFormat={editingDefaults ? addDefaultClock : addFormat}
              onChangeFormat={editingDefaults ? changeDefaultClock : changeFormat}
              onDeleteFormat={editingDefaults ? deleteDefaultClock : deleteFormat}
              onDuplicateFormat={editingDefaults ? duplicateDefaultClock : duplicateFormat}
              onAddCategory={addCategory}
              showHour={editingDefaults}
            />
          </div>
        </div>
      )}

      {/* ---- Right: per-hour inspector (hidden while editing a clock so the
           row editor gets the full width) ---- */}
      {mode === 'grid' && (
      <div className="work-insp">
        {!sel ? (
          <p className="empty">Click an hour in the grid to inspect it.</p>
        ) : (
          <>
            <div>
              <div className="kick">Selected hour</div>
              <div className="insp-title">
                {WEEKDAY_LABELS[sel.wd].toUpperCase()} {pad2(sel.hour)}:00
              </div>
            </div>

            <div className="insp-sec">
              <div className="kick">
                Clock — {paintedClock ? paintedClock.name : dayDefaultClock ? `${dayDefaultClock.name} (default)` : 'none'}
              </div>
              {inspClock && inspRows.length > 0 ? (
                <table className="tbl insp-tbl mono-sm">
                  <thead>
                    <tr>
                      <th>Min</th>
                      <th>Sec</th>
                      <th>Cue</th>
                      <th>Name</th>
                      <th>Cat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspRows.map((r, i) => (
                      <tr key={i}>
                        <td>{pad2(r.minute)}</td>
                        <td>{pad2(r.second)}</td>
                        <td>{r.cue}</td>
                        <td dir="auto">{r.name || '—'}</td>
                        <td>{r.category ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {inspClock ? 'No rows fire at this hour.' : 'No clock covers this hour.'}
                </p>
              )}
              {inspClock && (
                <button
                  className="btn"
                  onClick={() => {
                    if (paintedClock) {
                      setSelectedId(paintedClock.id)
                      setMode('clock')
                    } else if (dayDefaultClock) {
                      setSelectedDefaultId(dayDefaultClock.id)
                      setMode('default')
                    }
                  }}
                >
                  Edit clock rows
                </button>
              )}
            </div>

            <div className="insp-sec">
              <div className="kick">Promos this hour — {placementsAt(sel.wd, sel.hour).length}</div>
              {entries.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No promos file loaded.
                </p>
              ) : (
                <>
                  <div className="mono-sm insp-lines">
                    {placementsAt(sel.wd, sel.hour).map((p, i) => (
                      <div key={i}>
                        {p.time} {p.name}
                      </div>
                    ))}
                    {placementsAt(sel.wd, sel.hour).length === 0 && <span className="muted">none</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {isBlocked(sel.wd, sel.hour)
                      ? 'This hour is blocked for all promos.'
                      : rules.breaks.length
                        ? `Breaks ${rules.breaks.map((m) => ':' + pad2(m)).join(' ')}`
                        : 'No breaks set — promos get a random minute.'}
                  </div>
                </>
              )}
            </div>

            <div className="insp-sec">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="kick">
                  Azan — {WEEKDAY_FULL[sel.wd]}
                </span>
                <button
                  className={`chip ${config?.includeAzan ? 'on' : ''}`}
                  title="Include the 5 daily azan rows in exported logs"
                  onClick={async () => {
                    if (config) setConfig(await window.api.setIncludeAzan(!config.includeAzan))
                  }}
                >
                  {config?.includeAzan ? '✓ ON' : 'OFF'}
                </button>
              </div>
              {azan && (
                <div className="mono-sm insp-lines">
                  {PRAYERS.map((p) => (
                    <div key={p.key}>
                      {azan[p.key].slice(0, 5)} {p.label}
                    </div>
                  ))}
                </div>
              )}
              <button className="btn" title="The azan format is edited in Settings" onClick={onOpenSettings}>
                Edit azan format
              </button>
            </div>

            <div className="insp-foot">
              <button className="btn primary" onClick={onOpenLog}>
                Open in LOG →
              </button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  )
}
