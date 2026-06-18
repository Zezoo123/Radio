import type { AzanSummary, GridSummary, TemplateSummary } from '../../../main/session'

interface Props {
  grid: GridSummary | null
  templates: TemplateSummary[]
  azan: AzanSummary | null
  onGrid: (g: GridSummary | null) => void
  onTemplates: (t: TemplateSummary[]) => void
  onAzan: (a: AzanSummary | null) => void
}

export function ImportView({
  grid,
  templates,
  azan,
  onGrid,
  onTemplates,
  onAzan
}: Props): JSX.Element {
  async function openGrid(): Promise<void> {
    const summary = await window.api.openGrid()
    if (summary) onGrid(summary)
  }

  async function selectSheet(sheet: string): Promise<void> {
    onGrid(await window.api.selectGridSheet(sheet))
  }

  async function addTemplates(): Promise<void> {
    onTemplates(await window.api.addTemplates())
  }

  async function removeTemplate(index: number): Promise<void> {
    onTemplates(await window.api.removeTemplate(index))
  }

  async function openAzan(): Promise<void> {
    const summary = await window.api.openAzan()
    if (summary) onAzan(summary)
  }

  return (
    <div className="view">
      <h1>Import</h1>
      <p className="muted">Load the station grid and the element templates for this schedule.</p>

      <section className="card">
        <div className="card-head">
          <h2>Station grid</h2>
          <button className="btn" onClick={openGrid}>
            {grid ? 'Replace…' : 'Open grid…'}
          </button>
        </div>
        {grid ? (
          <div className="grid-info">
            <div>
              <span className="k">File</span> {grid.fileName}
            </div>
            <div>
              <span className="k">Title</span> {grid.title || '—'}
            </div>
            <div>
              <span className="k">Segments</span> {grid.segmentCount}
            </div>
            <div>
              <span className="k">Programs</span> {grid.programTitles.length}
            </div>
            {grid.sheets.length > 1 && (
              <div>
                <span className="k">Sheet</span>
                <select value={grid.sheet} onChange={(e) => selectSheet(e.target.value)}>
                  {grid.sheets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <p className="empty">No grid loaded.</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Element templates</h2>
          <button className="btn" onClick={addTemplates}>
            Add templates…
          </button>
        </div>
        {templates.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Group</th>
                <th>Code</th>
                <th>Times</th>
                <th>File</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr key={`${t.code}-${i}`}>
                  <td>{t.group}</td>
                  <td>{t.code}</td>
                  <td>{t.timeCount}</td>
                  <td className="muted">{t.fileName}</td>
                  <td>
                    <button className="btn-link" onClick={() => removeTemplate(i)}>
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No templates added.</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Athan (AZAN file)</h2>
          <button className="btn" onClick={openAzan}>
            {azan ? 'Replace…' : 'Open AZAN month…'}
          </button>
        </div>
        {azan ? (
          <div className="grid-info">
            <div>
              <span className="k">File</span> {azan.fileName}
            </div>
            <div>
              <span className="k">Months</span> {azan.months.join(', ')}
            </div>
            <div>
              <span className="k">Days</span> {azan.dayCount}
            </div>
          </div>
        ) : (
          <p className="empty">
            No athan file. Load the AZAN month file for exact official prayer times.
          </p>
        )}
      </section>
    </div>
  )
}
