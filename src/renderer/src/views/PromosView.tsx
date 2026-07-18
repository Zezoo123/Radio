import { useCallback, useEffect, useState } from 'react'
import type { PromoSummary } from '../../../main/session'
import type { PromoEntry } from '../../../main/core/parsers/promosFile'
import type { PromoDayPlacement, PromoWeekRow } from '../../../main/core/promos/schedule'
import { toCalendarDate } from '../App'
import PageHelp from '../components/PageHelp'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** 0 = Sun … 6 = Sat for a `YYYY-MM-DD` value (UTC, to match the main process). */
function weekdayOf(value: string): number | null {
  const d = toCalendarDate(value)
  if (!d) return null
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

export function PromosView(): JSX.Element {
  const [summary, setSummary] = useState<PromoSummary | null>(null)
  const [entries, setEntries] = useState<PromoEntry[]>([])
  const [anchor, setAnchor] = useState('2026-06-07')
  const [week, setWeek] = useState<PromoWeekRow[]>([])
  const [previewDate, setPreviewDate] = useState('2026-06-07')
  const [previewText, setPreviewText] = useState('')

  const refreshInfo = useCallback(async () => {
    setSummary(await window.api.getPromos())
    setEntries(await window.api.listPromoEntries())
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

  // Refresh the day preview when the chosen date changes, the file (re)loads, or
  // any exclusion edit advances `week`.
  useEffect(() => {
    const d = toCalendarDate(previewDate)
    if (!d || entries.length === 0) {
      setPreviewText('')
      return
    }
    window.api.promoPreviewForDate(d).then(setPreviewText)
  }, [previewDate, week, entries.length])

  async function loadFile(): Promise<void> {
    const res = await window.api.openPromos()
    if (res) {
      setSummary(res)
      await refreshInfo()
    }
  }

  async function removeFile(): Promise<void> {
    setSummary(await window.api.removePromos())
    setEntries([])
    setWeek([])
  }

  async function toggleExclude(
    row: PromoWeekRow,
    day: PromoDayPlacement,
    hour: number
  ): Promise<void> {
    const d = toCalendarDate(anchor)
    if (!d) return
    const next = new Set(day.excludedHours)
    if (next.has(hour)) next.delete(hour)
    else next.add(hour)
    setWeek(
      await window.api.setPromoExcludedHours(
        row.fileName,
        day.weekday,
        [...next].sort((a, b) => a - b),
        d
      )
    )
  }

  const wd = weekdayOf(anchor)
  const loaded = entries.length > 0
  const range = week[0] ? `${week[0].days[0].date} → ${week[0].days[6].date}` : ''

  return (
    <div className="view">
      <div className="card-head">
        <h1>
          Promos
          <PageHelp>
            Promos are distributed across the day: never during a program or for two hours after
            it ends, at most one per hour, and a different spread each day. For each program, set
            the hours you don’t want a promo per day of the week — the export applies each date’s
            weekday rules.
          </PageHelp>
        </h1>
        <div className="row">
          {loaded && <span className="muted">{summary?.fileName}</span>}
          <button className="btn" onClick={loadFile}>
            {loaded ? 'Replace file…' : 'Load promos…'}
          </button>
          {loaded && (
            <button className="btn-link" onClick={removeFile}>
              remove
            </button>
          )}
        </div>
      </div>

      {!loaded && (
        <p className="empty">
          No promos loaded. Use “Load promos…” (or the Import tab) to open the promos spreadsheet.
        </p>
      )}

      {loaded && (
        <>
          <section className="card">
            <h2>Programs</h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Presenter</th>
                  <th>File</th>
                  <th>Airtime</th>
                  <th style={{ textAlign: 'center' }}>Rec</th>
                  {DAY_LETTERS.map((d, i) => (
                    <th
                      key={i}
                      title={`${DAY_NAMES[i]} — promos/day`}
                      style={{ textAlign: 'center', width: 30 }}
                      className={wd === i ? 'col-today' : ''}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.fileName}>
                    <td dir="auto">{e.program}</td>
                    <td dir="auto" className="muted">
                      {e.presenter}
                    </td>
                    <td className="muted">{e.fileName}</td>
                    <td className="muted">{e.airStart ? `${e.airStart}–${e.airEnd}` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {e.recorded ? '✓' : <span className="warn-text">✗</span>}
                    </td>
                    {e.promoCounts.map((c, i) => (
                      <td
                        key={i}
                        style={{ textAlign: 'center' }}
                        className={`${wd === i ? 'col-today' : ''} ${c === 0 ? 'muted' : ''}`}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
                Weekly placement{range && <span className="pill">{range}</span>}
              </h2>
              <label>
                Week of{' '}
                <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
              </label>
            </div>

            <div className="hour-legend">
              <span>
                <i className="swatch blocked" /> blackout (on-air + 2h)
              </span>
              <span>
                <i className="swatch excluded" /> excluded — click to toggle
              </span>
              <span>
                <i className="swatch placed" /> placed
              </span>
            </div>

            {week.length === 0 ? (
              <p className="empty">No promos scheduled this week.</p>
            ) : (
              <div className="promo-list">
                {week.map((row) => (
                  <WeekRow
                    key={row.fileName}
                    row={row}
                    onToggleHour={(day, h) => toggleExclude(row, day, h)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Day preview</h2>
              <label>
                Date{' '}
                <input
                  type="date"
                  value={previewDate}
                  onChange={(e) => setPreviewDate(e.target.value)}
                />
              </label>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              The promo rows generated for this date across all promo files, in Simian log order.
            </p>
            <textarea
              className="preview"
              readOnly
              dir="auto"
              spellCheck={false}
              value={previewText || '(no promos for this date)'}
            />
          </section>
        </>
      )}
    </div>
  )
}

function WeekRow({
  row,
  onToggleHour
}: {
  row: PromoWeekRow
  onToggleHour: (day: PromoDayPlacement, hour: number) => void
}): JSX.Element {
  return (
    <div className="promo-item">
      <div className="promo-head">
        <div className="promo-title">
          <strong dir="auto">{row.program}</strong>
          <span className="muted"> · {row.fileName}</span>
        </div>
      </div>

      <table className="week-table">
        <thead>
          <tr>
            <th className="wd-col" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="hour-h">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row.days.map((day) => (
            <DayRow key={day.weekday} day={day} onToggle={(h) => onToggleHour(day, h)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DayRow({
  day,
  onToggle
}: {
  day: PromoDayPlacement
  onToggle: (hour: number) => void
}): JSX.Element {
  const placed = new Set(day.times.map((t) => parseInt(t.slice(0, 2), 10)))
  const blocked = new Set(day.blockedHours)
  const excluded = new Set(day.excludedHours)
  return (
    <tr className={day.count === 0 ? 'inactive' : ''}>
      <th className="wd-col" scope="row">
        <strong>{DAY_NAMES[day.weekday]}</strong>{' '}
        <span className="muted">
          {day.airs ? 'on air' : 'off air'} · {day.count}/day
          {day.capped && <span className="warn-text"> · only {day.allowedHours.length} free</span>}
        </span>
      </th>
      {Array.from({ length: 24 }, (_, h) => {
        let cls = 'free'
        if (blocked.has(h)) cls = 'blocked'
        else if (excluded.has(h)) cls = 'excluded'
        else if (placed.has(h)) cls = 'placed'
        const isBlocked = blocked.has(h)
        const label = `${String(h).padStart(2, '0')}:00`
        return (
          <td
            key={h}
            className={`hour ${cls}`}
            title={
              isBlocked
                ? `${label} — blackout`
                : excluded.has(h)
                  ? `${label} — excluded (click to allow)`
                  : `${label} — click to exclude`
            }
            onClick={isBlocked ? undefined : () => onToggle(h)}
          />
        )
      })}
    </tr>
  )
}
