import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, TemplateSummary } from '../../main/session'
import type { CalendarDate } from '../../main/core/types'
import type { UiSettings } from '../../main/uiSettings'
import { withOpacity } from './lib/colors'
import { BookingView } from './views/BookingView'
import { GridView } from './views/GridView'
import { LogView } from './views/LogView'
import { StationPicker, STATION_COLOR } from './views/StationPicker'
import { SettingsView } from './views/SettingsView'
import { THEME_IDS, type ThemeId } from './theme'

/** Bake an opacity % into every color of a category map. */
function applyOpacityMap(map: Record<string, string>, pct: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) out[k] = withOpacity(v, pct)
  return out
}

type Section = 'booking' | 'grid' | 'log'
type Contrast = 'normal' | 'high'

/** The Interface-size steps offered in Settings (percent of normal). */
export const UI_SCALES = [80, 90, 100, 110, 120, 130]

/** App-wide font override (Settings → Appearance). Empty family + null size
    + !bold = no override, the active theme's typography applies. */
export interface UiFont {
  family: string
  /** Base size in px (the theme's other sizes scale from it); null = theme size. */
  size: number | null
  bold: boolean
}

export const UI_FONT_DEFAULT: UiFont = { family: '', size: null, bold: false }
export const UI_FONT_MIN = 8
export const UI_FONT_MAX = 24

/** Classic Windows fallbacks for the MS Sans Serif preset; a generic sans
    stack for everything else, so a missing family degrades gracefully. */
function fontStack(family: string): string {
  const generic = /ms sans serif/i.test(family)
    ? "'Microsoft Sans Serif', Tahoma, Geneva, 'Segoe UI', sans-serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  return `'${family.replace(/'/g, '')}', ${generic}`
}

const TABS: { id: Section; label: string; sub: string }[] = [
  { id: 'booking', label: 'BOOKING', sub: 'BOOKING ELEMENTS' },
  { id: 'grid', label: 'GRID', sub: 'CLOCKS · PROMOS · AZAN' },
  { id: 'log', label: 'LOG', sub: 'BUILD · EDIT · EXPORT' }
]

const GEAR_ICON = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/** Read a persisted UI preference, tolerating storage being unavailable. */
function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

/** Strip Electron's "Error invoking remote method 'x': Error: " IPC wrapping. */
function errorMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason)
  const m = raw.match(/Error invoking remote method '([^']+)':\s*(?:Error:\s*)?(.*)/s)
  return m ? `${m[2]} (${m[1]})` : raw
}

export default function App(): JSX.Element {
  const [section, setSection] = useState<Section>('booking')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = readPref<ThemeId>('ui.theme', 'modernist')
    return THEME_IDS.includes(saved) ? saved : 'modernist'
  })
  const [contrast, setContrast] = useState<Contrast>(() => readPref('ui.contrast', 'normal'))
  // Whole-UI scale in percent (Chromium zoom). Persisted like the theme.
  const [uiScale, setUiScale] = useState<number>(() => {
    const saved = parseInt(readPref('ui.scale', '100'), 10)
    return UI_SCALES.includes(saved) ? saved : 100
  })
  // App-wide font override. Persisted like the theme; default = theme fonts.
  const [uiFont, setUiFont] = useState<UiFont>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ui.font') ?? '')
      return {
        family: typeof saved.family === 'string' ? saved.family : '',
        size:
          typeof saved.size === 'number' && saved.size >= UI_FONT_MIN && saved.size <= UI_FONT_MAX
            ? saved.size
            : null,
        bold: saved.bold === true
      }
    } catch {
      return UI_FONT_DEFAULT
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [stations, setStations] = useState<string[]>([])
  const [station, setStation] = useState<string | null>(null)
  // Set once a new version has downloaded; shows the restart chip in the bar.
  const [updateReady, setUpdateReady] = useState<string | null>(null)

  useEffect(() => {
    window.api.onUpdateDownloaded(setUpdateReady)
  }, [])
  // App-wide per-category row colors (persisted in Settings, used by the Editor).
  const [uiSettings, setUiSettings] = useState<UiSettings>({
    categoryColors: {},
    categoryTextColors: {},
    tintOpacity: 35,
    textOpacity: 100
  })

  // The Editor paints with the app-wide opacity already baked into each color,
  // so the grid rows never need to know about the settings.
  const displayColors = useMemo(
    () => applyOpacityMap(uiSettings.categoryColors, uiSettings.tintOpacity),
    [uiSettings.categoryColors, uiSettings.tintOpacity]
  )
  const displayTextColors = useMemo(
    () => applyOpacityMap(uiSettings.categoryTextColors, uiSettings.textOpacity),
    [uiSettings.categoryTextColors, uiSettings.textOpacity]
  )

  useEffect(() => {
    window.api.getUiSettings().then(setUiSettings)
  }, [])

  async function updateUiSettings(next: UiSettings): Promise<void> {
    setUiSettings(next)
    setUiSettings(await window.api.saveUiSettings(next))
  }

  useEffect(() => {
    window.api.listStations().then(setStations)
    window.api.getStation().then(setStation)
  }, [])

  // (Re)load the active station's imports + config whenever the station changes.
  useEffect(() => {
    if (!station) return
    window.api.listTemplates().then(setTemplates)
    window.api.getConfig().then(setConfig)
  }, [station])

  async function switchStation(next: string): Promise<void> {
    if (next === station) return
    await window.api.setStation(next)
    // Clear the previous station's view data; the effect above reloads for `next`.
    setTemplates([])
    setConfig(null)
    setSection('booking')
    setStation(next)
  }

  // No view catches its own IPC errors, so surface any unhandled rejection
  // (failed parse, export, save…) here instead of losing it in devtools.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent): void => {
      e.preventDefault()
      setError(errorMessage(e.reason))
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  // Apply + persist the appearance choice (theme, normal/high contrast).
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.contrast = contrast
    try {
      localStorage.setItem('ui.theme', theme)
      localStorage.setItem('ui.contrast', contrast)
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  }, [theme, contrast])

  // Apply + persist the interface scale (Chromium zoom on this window).
  useEffect(() => {
    window.api.setZoom(uiScale / 100)
    try {
      localStorage.setItem('ui.scale', String(uiScale))
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  }, [uiScale])

  // Apply + persist the font override. Inline custom properties on <html>
  // outrank every theme's token block, so the choice wins on any theme; the
  // theme's own typography returns the moment the override is cleared.
  useEffect(() => {
    const root = document.documentElement
    const { family, size, bold } = uiFont
    if (family) root.style.setProperty('--font-ui', fontStack(family))
    else root.style.removeProperty('--font-ui')
    const sizes: [string, number][] = size
      ? [
          ['--fs-base', size],
          ['--fs-sm', Math.max(UI_FONT_MIN, size - 1)],
          ['--fs-xs', Math.max(UI_FONT_MIN, size - 2)],
          ['--fs-h1', Math.round(size * 1.6)],
          ['--fs-h2', size + 1]
        ]
      : []
    for (const t of ['--fs-base', '--fs-sm', '--fs-xs', '--fs-h1', '--fs-h2'])
      root.style.removeProperty(t)
    for (const [t, px] of sizes) root.style.setProperty(t, `${px}px`)
    // styles.css keys the form-control family + bold rules off this attribute.
    if (family || size || bold) root.dataset.userFont = bold ? 'bold' : 'on'
    else delete root.dataset.userFont
    try {
      localStorage.setItem('ui.font', JSON.stringify(uiFont))
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  }, [uiFont])

  // The settings drawer closes on Escape like any dialog.
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  const today = new Date()
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
    .replace(/,/g, '')
    .toUpperCase()

  // Nothing loads until a station is chosen.
  if (!station) {
    return <StationPicker stations={stations} onPick={switchStation} />
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${section === t.id ? 'active' : ''}`}
            onClick={() => setSection(t.id)}
          >
            {t.label}
            <span className="tab-sub">{t.sub}</span>
          </button>
        ))}
        <div className="chrome">
          <div className="station-switch" title={`Station: ${station}`}>
            <span
              className="station-dot"
              style={{ background: STATION_COLOR[station] ?? 'var(--accent)' }}
            />
            <select
              className="station-select"
              value={station}
              onChange={(e) => switchStation(e.target.value)}
            >
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <span className="chrome-date">{today}</span>
          <span className="chrome-note">{templates.length} booked</span>
          {updateReady && (
            <button
              className="chip on"
              title={`Version ${updateReady} downloaded — restart the app to install (or it installs on next quit)`}
              onClick={() => window.api.installUpdate()}
            >
              ⟳ UPDATE READY
            </button>
          )}
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            {GEAR_ICON}
          </button>
        </div>
      </header>

      <main className="content flush" key={station}>
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-banner-text">{error}</span>
            <button className="error-banner-close" onClick={() => setError(null)} title="Dismiss">
              ✕
            </button>
          </div>
        )}
        {section === 'booking' && (
          <BookingView templates={templates} onTemplates={setTemplates} onConfig={setConfig} />
        )}
        {section === 'grid' && (
          <GridView
            onOpenLog={() => setSection('log')}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        {/* The LOG workbench stays mounted so its unsaved document survives
            tab switches; only its visibility flips. */}
        <div className="logmount" style={{ display: section === 'log' ? undefined : 'none' }}>
          <LogView
            active={section === 'log'}
            templates={templates}
            config={config}
            onConfig={setConfig}
            categoryColors={displayColors}
            categoryTextColors={displayTextColors}
          />
        </div>
      </main>

      {settingsOpen && (
        <div
          className="settings-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false)
          }}
        >
          <div className="settings-drawer" role="dialog" aria-label="Settings">
            <div className="settings-drawer-head">
              <button
                className="icon-btn"
                onClick={() => setSettingsOpen(false)}
                title="Close settings"
              >
                ✕
              </button>
            </div>
            <SettingsView
              settings={uiSettings}
              onSettings={updateUiSettings}
              theme={theme}
              onTheme={setTheme}
              highContrast={contrast === 'high'}
              onHighContrast={(on) => setContrast(on ? 'high' : 'normal')}
              uiScale={uiScale}
              onUiScale={setUiScale}
              uiFont={uiFont}
              onUiFont={setUiFont}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Shared: convert an <input type="date"> value to a CalendarDate. */
export function toCalendarDate(value: string): CalendarDate | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { year: +m[1], month: +m[2], day: +m[3] }
}
