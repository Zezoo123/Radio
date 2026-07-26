import PageHelp from '../components/PageHelp'

interface Props {
  stations: string[]
  current?: string | null
  onPick: (station: string) => void
}

/** Accent color per station, for the swatch/initial. */
const STATION_COLOR: Record<string, string> = {
  MegaFM: '#4f8cff',
  NaghamFM: '#49c281',
  RadioHitsFM: '#e0a23c',
  Sha3byFM: '#c264e0'
}

/** Full-screen station chooser shown on load (and when switching from scratch). */
export function StationPicker({ stations, current, onPick }: Props): JSX.Element {
  return (
    <div className="station-picker">
      <div className="station-picker-inner">
        <h1>
          Choose a station
          <PageHelp>
            Each station keeps its own formats, promos and imports. You can switch any time from
            the sidebar.
          </PageHelp>
        </h1>
        <div className="station-grid">
          {stations.map((s) => (
            <button
              key={s}
              className={`station-card ${current === s ? 'on' : ''}`}
              onClick={() => onPick(s)}
            >
              <span
                className="station-badge"
                style={{ background: STATION_COLOR[s] ?? 'var(--accent)' }}
              >
                {s.replace(/FM$/, '').slice(0, 2).toUpperCase()}
              </span>
              <span className="station-name">{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export { STATION_COLOR }
