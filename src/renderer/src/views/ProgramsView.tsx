import { useEffect, useState } from 'react'
import type { GridSummary } from '../../../main/session'
import type { ProgramMap } from '../../../main/core/programMap'

interface Props {
  grid: GridSummary | null
  programMap: ProgramMap
  onSaved: (m: ProgramMap) => void
}

export function ProgramsView({ grid, programMap, onSaved }: Props): JSX.Element {
  const [draft, setDraft] = useState<ProgramMap>(programMap)
  const [savedNote, setSavedNote] = useState('')

  useEffect(() => setDraft(programMap), [programMap])

  if (!grid) {
    return (
      <div className="view">
        <h1>Programs</h1>
        <p className="empty">Load a station grid first to map program file names.</p>
      </div>
    )
  }

  async function save(): Promise<void> {
    // Drop empty entries so they stay "unmapped".
    const clean: ProgramMap = {}
    for (const [k, v] of Object.entries(draft)) if (v.trim()) clean[k] = v.trim()
    await window.api.saveProgramMap(clean)
    onSaved(clean)
    setSavedNote('Saved')
    setTimeout(() => setSavedNote(''), 1500)
  }

  const mapped = grid.programTitles.filter((t) => draft[t]?.trim()).length

  return (
    <div className="view">
      <div className="card-head">
        <h1>Programs</h1>
        <div className="row">
          <span className="muted">
            {mapped}/{grid.programTitles.length} mapped
          </span>
          <button className="btn" onClick={save}>
            Save
          </button>
          {savedNote && <span className="ok">{savedNote}</span>}
        </div>
      </div>
      <p className="muted">
        Give each program the Simian file name to emit. Simian fills the rest from its database.
      </p>

      <table className="tbl">
        <thead>
          <tr>
            <th>Program (from grid)</th>
            <th>Simian file name</th>
          </tr>
        </thead>
        <tbody>
          {grid.programTitles.map((title) => (
            <tr key={title} className={draft[title]?.trim() ? '' : 'unmapped'}>
              <td dir="auto">{title}</td>
              <td>
                <input
                  value={draft[title] ?? ''}
                  placeholder="e.g. PRG_MORNING"
                  onChange={(e) => setDraft({ ...draft, [title]: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
