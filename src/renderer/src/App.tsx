import { useEffect, useState } from 'react'
import type { AppConfig, AzanSummary, TemplateSummary } from '../../main/session'
import type { CalendarDate } from '../../main/core/types'
import { ImportView } from './views/ImportView'
import { ExportView } from './views/ExportView'
import { FormatsView } from './views/FormatsView'

type View = 'import' | 'formats' | 'export'
type Theme = 'dark' | 'light'
type Contrast = 'normal' | 'high'

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
    { id: 'export', label: 'Export' }
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Radio Scheduler
          <span className="brand-sub">BSI Simian export</span>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
            >
              {n.label}
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
