import { useEffect, useRef, useState } from 'react'
import type { SimianSearchHit, SimianSearchResult } from '../../../preload'

/** One audio.mdb entry offered by the lookup. */
export type AudioHit = SimianSearchHit

/** Search audio.mdb by file name: at most `limit` hits, best match first. */
export type AudioLookup = (query: string, limit: number) => Promise<SimianSearchResult>

const LIMIT = 100
const PAGE = 8

interface Props {
  /** Text already in the Name cell — the search starts from it. */
  initialQuery: string
  targetLabel: string | null
  lookup: AudioLookup
  onPick: (hit: AudioHit) => void
  onClose: () => void
}

/**
 * "List of values" for the Name / cart cell (F7). Type to filter audio.mdb by
 * file name, ↑/↓ to move, Enter to pick, Esc to cancel. Mounted only while open.
 */
export function LovDialog({
  initialQuery,
  targetLabel,
  lookup,
  onPick,
  onClose
}: Props): JSX.Element {
  const [query, setQuery] = useState(initialQuery)
  const [hits, setHits] = useState<AudioHit[]>([])
  const [active, setActive] = useState(0)
  // null until the first answer; false = no audio database loaded.
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Keep the latest lookup without re-running the search when the parent re-renders.
  const lookupRef = useRef(lookup)
  lookupRef.current = lookup

  // Debounced search; a stale response (older query) is dropped.
  useEffect(() => {
    let stale = false
    const t = setTimeout(() => {
      setBusy(true)
      lookupRef
        .current(query.trim(), LIMIT)
        .then((res) => {
          if (stale) return
          setLoaded(res.loaded)
          setHits(res.hits)
          setActive(0)
          setError(null)
        })
        .catch((err: unknown) => {
          if (stale) return
          setHits([])
          setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!stale) setBusy(false)
        })
    }, 120)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('.lov-item.on')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, hits])

  const move = (to: number): void => setActive(Math.max(0, Math.min(to, hits.length - 1)))

  function onKeyDown(e: React.KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(active + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(active - 1)
        break
      case 'PageDown':
        e.preventDefault()
        move(active + PAGE)
        break
      case 'PageUp':
        e.preventDefault()
        move(active - PAGE)
        break
      case 'Enter':
        e.preventDefault()
        if (hits[active]) onPick(hits[active])
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose()
        break
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal lov-modal"
        role="dialog"
        aria-label="Audio lookup"
        onKeyDown={onKeyDown}
      >
        <div className="card-head">
          <h2>Audio lookup{targetLabel ? ` · ${targetLabel}` : ''}</h2>
          <button className="btn-link" onClick={onClose}>
            close
          </button>
        </div>

        {loaded === false ? (
          <p className="empty">
            No audio database loaded. Open the LOG tab, click “Load Simian DB…” and pick the
            station&apos;s audio.mdb, then try again.
          </p>
        ) : (
          <>
            <input
              autoFocus
              className="lov-input"
              value={query}
              placeholder="Type part of the file name…"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={(e) => {
                const end = e.currentTarget.value.length
                e.currentTarget.setSelectionRange(end, end)
              }}
            />
            <div className="lov-list" ref={listRef}>
              {hits.map((h, i) => (
                <div
                  key={`${h.name}-${i}`}
                  className={`lov-item ${i === active ? 'on' : ''}`}
                  onMouseMove={() => {
                    if (i !== active) setActive(i)
                  }}
                  onClick={() => onPick(h)}
                >
                  <span className="lov-name" title={h.name}>
                    {h.name}
                  </span>
                  <span className="lov-desc" dir="auto" title={h.description}>
                    {h.description}
                  </span>
                  <span className="lov-cat">{h.category}</span>
                </div>
              ))}
              {!busy && !error && loaded && hits.length === 0 && (
                <p className="empty lov-empty">No match.</p>
              )}
              {error && <p className="lov-error">{error}</p>}
            </div>
            <div className="lov-foot">
              <span>
                {busy ? 'Searching…' : `${hits.length}${hits.length >= LIMIT ? '+' : ''} files`}
              </span>
              <span>↑↓ move · Enter select · Esc cancel</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
