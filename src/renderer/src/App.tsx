import { useEffect, useState } from 'react'
import type { AppConfig, TemplateSummary } from '../../main/session'
import type { CalendarDate } from '../../main/core/types'
import type { UiSettings } from '../../main/uiSettings'
import { ImportView } from './views/ImportView'
import { ExportView } from './views/ExportView'
import { FormatsView } from './views/FormatsView'
import { PromosView } from './views/PromosView'
import { EditorView } from './views/EditorView'
import { StationPicker, STATION_COLOR } from './views/StationPicker'
import { SettingsView } from './views/SettingsView'
import { THEME_IDS, type ThemeId } from './theme'

type View = 'import' | 'formats' | 'promos' | 'export' | 'editor' | 'settings'
type Contrast = 'normal' | 'high'

/** Outline icons (stroke = currentColor) shown in the collapsed sidebar. */
const NAV_ICONS: Partial<Record<View, JSX.Element>> = {
  import: (
    <svg viewBox="0 0 24 24">
      <path d="M12 3v10m0 0-4-4m4 4 4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  formats: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  promos: (
    <svg viewBox="0 0 24 24">
      <path d="M4 9v6h3l7 4V5L7 9H4z" />
      <path d="M18 8a5 5 0 0 1 0 8" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24">
      <path d="M12 21V11m0 0-4 4m4-4 4 4M4 8V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
    </svg>
  ),
  editor: (
    <svg viewBox="0 0 24 24">
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

const BRAND_MARK = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="2" />
    <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M6 6a9 9 0 0 0 0 12M18 6a9 9 0 0 1 0 12" />
  </svg>
)

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
  const [view, setView] = useState<View>('import')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = readPref<ThemeId>('ui.theme', 'dark')
    return THEME_IDS.includes(saved) ? saved : 'dark'
  })
  const [contrast, setContrast] = useState<Contrast>(() => readPref('ui.contrast', 'normal'))
  const [error, setError] = useState<string | null>(null)
  const [stations, setStations] = useState<string[]>([])
  const [station, setStation] = useState<string | null>(null)
  // A log handed from Export to the Editor ({} wrapper so re-sends always fire).
  const [editorLog, setEditorLog] = useState<{ text: string } | null>(null)
  // App-wide per-category row colors (persisted in Settings, used by the Editor).
  const [uiSettings, setUiSettings] = useState<UiSettings>({
    categoryColors: {},
    categoryTextColors: {}
  })

  useEffect(() => {
    window.api.getUiSettings().then(setUiSettings)
  }, [])

  async function updateUiSettings(next: UiSettings): Promise<void> {
    setUiSettings(next)
    setUiSettings(await window.api.saveUiSettings(next))
  }

  function editLog(text: string): void {
    setEditorLog({ text })
    setView('editor')
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
    setView('import')
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

  // Apply + persist the appearance choice (light/dark, normal/high contrast).
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

  const nav: { id: View; label: string; badge?: number }[] = [
    { id: 'import', label: 'Import' },
    { id: 'formats', label: 'Formats' },
    { id: 'promos', label: 'Promos' },
    { id: 'export', label: 'Export' },
    { id: 'editor', label: 'Editor' }
  ]

  // Nothing loads until a station is chosen.
  if (!station) {
    return <StationPicker stations={stations} onPick={switchStation} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{BRAND_MARK}</span>
          <span className="brand-text">
            Radio Scheduler
            <span className="brand-sub">BSI Simian export</span>
          </span>
        </div>
        <div className="station-switch" title={`Station: ${station}`}>
          <span className="station-dot" style={{ background: STATION_COLOR[station] ?? 'var(--accent)' }} />
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
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
              title={n.label}
            >
              <span className="nav-ico">{NAV_ICONS[n.id]}</span>
              <span className="nav-label">{n.label}</span>
              {n.badge ? <span className="badge">{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-link ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
            title="Settings"
          >
            <span className="nav-ico">{GEAR_ICON}</span>
            <span className="nav-label">Settings</span>
          </button>
          <div className="sidebar-foot">
            <div className={`dot ${templates.length ? 'on' : ''}`} /> {templates.length} template(s)
          </div>
        </div>
      </aside>

      <main className="content" key={station}>
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-banner-text">{error}</span>
            <button className="error-banner-close" onClick={() => setError(null)} title="Dismiss">
              ✕
            </button>
          </div>
        )}
        {view === 'import' && (
          <ImportView templates={templates} onTemplates={setTemplates} onConfig={setConfig} />
        )}
        {view === 'formats' && <FormatsView />}
        {view === 'promos' && <PromosView />}
        {view === 'export' && (
          <ExportView templates={templates} config={config} onConfig={setConfig} onEdit={editLog} />
        )}
        {/* The Editor stays mounted so its unsaved document survives tab switches. */}
        <div style={{ display: view === 'editor' ? undefined : 'none' }}>
          <EditorView
            incoming={editorLog}
            onConsumed={() => setEditorLog(null)}
            categoryColors={uiSettings.categoryColors}
            categoryTextColors={uiSettings.categoryTextColors}
          />
        </div>
        {view === 'settings' && (
          <SettingsView
            settings={uiSettings}
            onSettings={updateUiSettings}
            theme={theme}
            onTheme={setTheme}
            highContrast={contrast === 'high'}
            onHighContrast={(on) => setContrast(on ? 'high' : 'normal')}
          />
        )}
      </main>
    </div>
  )
}

/** Shared: convert an <input type="date"> value to a CalendarDate. */
export function toCalendarDate(value: string): CalendarDate | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { year: +m[1], month: +m[2], day: +m[3] }
}
