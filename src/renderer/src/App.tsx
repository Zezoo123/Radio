import { useEffect, useState } from 'react'
import type { AppConfig, AzanSummary, TemplateSummary } from '../../main/session'
import type { CalendarDate } from '../../main/core/types'
import { ImportView } from './views/ImportView'
import { ExportView } from './views/ExportView'
import { FormatsView } from './views/FormatsView'
import { PromosView } from './views/PromosView'

type View = 'import' | 'formats' | 'promos' | 'export'
type Theme = 'dark' | 'light'
type Contrast = 'normal' | 'high'

/** Outline icons (stroke = currentColor) shown in the collapsed sidebar. */
const NAV_ICONS: Record<View, JSX.Element> = {
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
  )
}

const BRAND_MARK = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="2" />
    <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M6 6a9 9 0 0 0 0 12M18 6a9 9 0 0 1 0 12" />
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

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('import')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [azan, setAzan] = useState<AzanSummary | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [theme, setTheme] = useState<Theme>(() => readPref('ui.theme', 'dark'))
  const [contrast, setContrast] = useState<Contrast>(() => readPref('ui.contrast', 'normal'))

  useEffect(() => {
    window.api.listTemplates().then(setTemplates)
    window.api.getConfig().then(setConfig)
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
    { id: 'export', label: 'Export' }
  ]

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
          <div className="theme-control">
            <div className="theme-label">Appearance</div>
            <div className="row seg">
              <button
                className={`seg-btn ${theme === 'light' ? 'on' : ''}`}
                onClick={() => setTheme('light')}
              >
                Light
              </button>
              <button
                className={`seg-btn ${theme === 'dark' ? 'on' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={contrast === 'high'}
                onChange={(e) => setContrast(e.target.checked ? 'high' : 'normal')}
              />
              High contrast
            </label>
          </div>
          <div className="sidebar-foot">
            <div className={`dot ${templates.length ? 'on' : ''}`} /> {templates.length} template(s)
            <br />
            <div className={`dot ${azan ? 'on' : ''}`} /> Athan {azan ? 'loaded' : 'none'}
          </div>
        </div>
      </aside>

      <main className="content">
        {view === 'import' && (
          <ImportView
            templates={templates}
            azan={azan}
            config={config}
            onTemplates={setTemplates}
            onAzan={setAzan}
            onConfig={setConfig}
          />
        )}
        {view === 'formats' && <FormatsView />}
        {view === 'promos' && <PromosView />}
        {view === 'export' && (
          <ExportView templates={templates} azan={azan} config={config} onConfig={setConfig} />
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
