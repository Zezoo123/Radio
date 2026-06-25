import type { AppConfig, AthanMode, AzanSummary, TemplateSummary } from '../../../main/session'

interface Props {
  templates: TemplateSummary[]
  azan: AzanSummary | null
  config: AppConfig | null
  onTemplates: (t: TemplateSummary[]) => void
  onAzan: (a: AzanSummary | null) => void
  onConfig: (c: AppConfig) => void
}

export function ImportView({
  templates,
  azan,
  config,
  onTemplates,
  onAzan,
  onConfig
}: Props): JSX.Element {
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

  async function setAthanMode(mode: AthanMode): Promise<void> {
    onConfig(await window.api.setAthanMode(mode))
  }

  const athanMode = config?.athanMode ?? 'off'

  return (
    <div className="view">
      <h1>Import</h1>
      <p className="muted">Load the element templates for this schedule.</p>

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
          <h2>Athan</h2>
          <div className="row seg">
            <button
              className={`seg-btn ${athanMode === 'import' ? 'on' : ''}`}
              onClick={() => setAthanMode('import')}
            >
              Import file
            </button>
            <button
              className={`seg-btn ${athanMode === 'calculate' ? 'on' : ''}`}
              onClick={() => setAthanMode('calculate')}
            >
              Calculate
            </button>
            <button
              className={`seg-btn ${athanMode === 'off' ? 'on' : ''}`}
              onClick={() => setAthanMode('off')}
            >
              Off
            </button>
          </div>
        </div>

        {athanMode === 'calculate' && (
          <p className="muted">
            Computed for Cairo (Egyptian General Authority of Survey). Approximate — about a minute
            off the official timetable. Use “Import file” for exact times.
          </p>
        )}

        {athanMode === 'import' && (
          <>
            <div className="row">
              <button className="btn" onClick={openAzan}>
                {azan ? 'Replace AZAN file…' : 'Open AZAN month…'}
              </button>
            </div>
            {azan ? (
              <div className="grid-info" style={{ marginTop: 10 }}>
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
              <p className="empty">No athan file loaded yet.</p>
            )}
          </>
        )}

        {athanMode === 'off' && <p className="empty">Athan rows will not be included.</p>}
      </section>
    </div>
  )
}
