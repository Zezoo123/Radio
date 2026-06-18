import { useEffect, useState } from 'react'
import type { GridSummary, TemplateSummary } from '../../main/session'
import type { ProgramMap } from '../../main/core/programMap'
import type { CalendarDate } from '../../main/core/types'
import { ImportView } from './views/ImportView'
import { ProgramsView } from './views/ProgramsView'
import { ExportView } from './views/ExportView'

type View = 'import' | 'programs' | 'export'

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('import')
  const [grid, setGrid] = useState<GridSummary | null>(null)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [programMap, setProgramMap] = useState<ProgramMap>({})

  useEffect(() => {
    window.api.loadProgramMap().then(setProgramMap)
    window.api.listTemplates().then(setTemplates)
  }, [])

  const unmappedCount = grid
    ? grid.programTitles.filter((t) => !programMap[t]).length
    : 0

  const nav: { id: View; label: string; badge?: number }[] = [
    { id: 'import', label: 'Import' },
    { id: 'programs', label: 'Programs', badge: unmappedCount || undefined },
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
        <div className="sidebar-foot">
          <div className={`dot ${grid ? 'on' : ''}`} /> Grid {grid ? 'loaded' : 'none'}
          <br />
          <div className={`dot ${templates.length ? 'on' : ''}`} /> {templates.length} template(s)
        </div>
      </aside>

      <main className="content">
        {view === 'import' && (
          <ImportView
            grid={grid}
            templates={templates}
            onGrid={setGrid}
            onTemplates={setTemplates}
          />
        )}
        {view === 'programs' && (
          <ProgramsView grid={grid} programMap={programMap} onSaved={setProgramMap} />
        )}
        {view === 'export' && <ExportView grid={grid} templates={templates} />}
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
