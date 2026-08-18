import { useEffect, useState } from 'react'
import type { Cue } from '../../../main/core/types'
import type { AzanFormat, AzanLine } from '../../../main/core/prayer/azanRows'
import type { UiSettings } from '../../../main/uiSettings'
import { DEFAULT_CATEGORIES } from '../../../main/core/format/types'
import { THEMES, type ThemeId } from '../theme'
import { UI_FONT_DEFAULT, UI_FONT_MAX, UI_FONT_MIN, UI_SCALES, type UiFont } from '../App'
import { withOpacity } from '../lib/colors'

const CUES: Cue[] = ['+', '@', '#']
const NO_NAME_CATEGORIES = ['MACRO', 'COMMENT']
// Categories offered for azan lines (the built-in set already includes MACRO).
const CATEGORY_OPTIONS = DEFAULT_CATEGORIES

interface Props {
  /** App-wide category color maps (Editor rows tint / recolor by category). */
  settings: UiSettings
  onSettings: (settings: UiSettings) => void
  /** Active theme + high-contrast toggle (applied live, persisted by App). */
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
  highContrast: boolean
  onHighContrast: (on: boolean) => void
  /** Whole-UI scale in percent (80–130), applied as Chromium zoom by App. */
  uiScale: number
  onUiScale: (pct: number) => void
  /** App-wide font override (family/size/bold), applied as root tokens by App. */
  uiFont: UiFont
  onUiFont: (font: UiFont) => void
}

/** The MS Sans Serif preset: the classic Windows UI font, bold, 8 pt (≈11 px). */
const MS_SANS_PRESET: UiFont = { family: 'MS Sans Serif', size: 11, bold: true }

/** Global Settings: appearance, the AZAN format, and category color maps. */
export function SettingsView({
  settings,
  onSettings,
  theme,
  onTheme,
  highContrast,
  onHighContrast,
  uiScale,
  onUiScale,
  uiFont,
  onUiFont
}: Props): JSX.Element {
  const [format, setFormat] = useState<AzanFormat | null>(null)
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    window.api.getAzanFormat().then(setFormat)
  }, [])

  const { categoryColors, categoryTextColors } = settings

  // Built-in categories plus any custom ones that already have a color.
  const colorRows = [
    ...DEFAULT_CATEGORIES,
    ...Object.keys({ ...categoryColors, ...categoryTextColors }).filter(
      (c) => !DEFAULT_CATEGORIES.includes(c)
    )
  ]

  function setColor(
    map: 'categoryColors' | 'categoryTextColors',
    category: string,
    color: string | null
  ): void {
    const next = { ...settings[map] }
    if (color) next[category.toUpperCase()] = color
    else delete next[category.toUpperCase()]
    onSettings({ ...settings, [map]: next })
  }

  function addCustomCategory(): void {
    const name = newCategory.trim().toUpperCase()
    if (!name || name in categoryColors || name in categoryTextColors) return
    setColor('categoryColors', name, '#4f8cff')
    setNewCategory('')
  }

  // Persist on every change so the setting is durable without an explicit Save.
  function update(next: AzanFormat): void {
    setFormat(next)
    window.api.saveAzanFormat(next)
  }

  function patchLine(i: number, patch: Partial<AzanLine>): void {
    if (!format) return
    update({ ...format, lines: format.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  }

  function addLine(): void {
    if (!format) return
    update({
      ...format,
      lines: [
        ...format.lines,
        { offset: 0, cue: '+', name: '', category: 'AUDIO', description: '' }
      ]
    })
  }

  function removeLine(i: number): void {
    if (!format) return
    update({ ...format, lines: format.lines.filter((_, j) => j !== i) })
  }

  return (
    <div className="view">
      <div className="card-head">
        <h1>Settings</h1>
      </div>

      <section className="card">
        <h2>Appearance</h2>
        <p className="muted">
          Pick a theme for the whole app. Changes apply immediately and persist.
        </p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${theme === t.id ? 'on' : ''}`}
              onClick={() => onTheme(t.id)}
            >
              <span className="theme-thumb" style={{ background: t.preview.bg }}>
                <span className="th-dot" style={{ background: t.preview.accent }} />
                <span className="th-lines">
                  <span className="th-line" style={{ background: t.preview.text, opacity: 0.8 }} />
                  <span className="th-line short" style={{ background: t.preview.accent }} />
                </span>
              </span>
              <span className="theme-name">{t.name}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(e) => onHighContrast(e.target.checked)}
          />
          High contrast
        </label>
        <div style={{ marginTop: 14 }}>
          <div className="kick">Interface size</div>
          <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
            <div className="seg">
              {UI_SCALES.map((pct) => (
                <button
                  key={pct}
                  className={`seg-btn ${uiScale === pct ? 'on' : ''}`}
                  title={pct === 100 ? 'Normal size' : `Everything at ${pct}% size`}
                  onClick={() => onUiScale(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Scales the whole app — text, tables and grids. Applies immediately and persists.
            </span>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="kick">Font</div>
          <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
            <input
              placeholder="Theme default"
              title="Font family for the whole app; leave empty for the theme's own font"
              value={uiFont.family}
              style={{ width: 170 }}
              onChange={(e) => onUiFont({ ...uiFont, family: e.target.value })}
            />
            <label className="pct-ctl" title="Base text size; headings scale with it">
              Size{' '}
              <input
                type="number"
                min={UI_FONT_MIN}
                max={UI_FONT_MAX}
                placeholder="auto"
                value={uiFont.size ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  onUiFont({
                    ...uiFont,
                    size: Number.isInteger(n)
                      ? Math.max(UI_FONT_MIN, Math.min(UI_FONT_MAX, n))
                      : null
                  })
                }}
              />
              px
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={uiFont.bold}
                onChange={(e) => onUiFont({ ...uiFont, bold: e.target.checked })}
              />
              Bold
            </label>
            <button
              className="btn"
              title="Classic Windows look: MS Sans Serif, bold, 8 pt (falls back to a similar sans if not installed)"
              onClick={() => onUiFont(MS_SANS_PRESET)}
            >
              MS Sans Serif 8
            </button>
            {(uiFont.family || uiFont.size || uiFont.bold) && (
              <button
                className="btn-link"
                title="Back to the theme's own typography"
                onClick={() => onUiFont(UI_FONT_DEFAULT)}
              >
                ✕ Reset
              </button>
            )}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Overrides the theme typography everywhere. Missing fonts fall back to a similar
            sans-serif.
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Category colors</h2>
        <p className="muted">
          Give a Simian category a highlight and/or a text color and every row of that category is
          recolored across the app (the log Editor). Applies everywhere, on every station.
          Interrupted (red) and skipped (yellow) rows keep their warning text color.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="pct-ctl" title="How strongly every highlight color fills its rows">
            Highlight opacity{' '}
            <input
              type="number"
              min={1}
              max={100}
              value={settings.tintOpacity}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (Number.isInteger(n))
                  onSettings({ ...settings, tintOpacity: Math.max(1, Math.min(100, n)) })
              }}
            />
            %
          </label>
          <label className="pct-ctl" title="Opacity of every category text color">
            Text opacity{' '}
            <input
              type="number"
              min={1}
              max={100}
              value={settings.textOpacity}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (Number.isInteger(n))
                  onSettings({ ...settings, textOpacity: Math.max(1, Math.min(100, n)) })
              }}
            />
            %
          </label>
          <span className="muted">One setting for all colors — applied when rows paint.</span>
        </div>
        <div className="color-grid">
          {colorRows.map((cat) => {
            const color = categoryColors[cat]
            const textColor = categoryTextColors[cat]
            return (
              <div key={cat} className={`color-item ${color || textColor ? 'on' : ''}`}>
                <span className="color-ctl">
                  <input
                    type="color"
                    value={color ?? '#666666'}
                    title={color ? `Highlight: ${color}` : `Set a highlight color for ${cat}`}
                    onChange={(e) => setColor('categoryColors', cat, e.target.value)}
                  />
                  {color && (
                    <button
                      className="btn-link"
                      title="Remove highlight color"
                      onClick={() => setColor('categoryColors', cat, null)}
                    >
                      ✕
                    </button>
                  )}
                </span>
                <span className="color-ctl">
                  <label
                    className="text-color-pick"
                    style={{ color: textColor }}
                    title={textColor ? `Text: ${textColor}` : `Set a text color for ${cat}`}
                  >
                    A
                    <input
                      type="color"
                      value={textColor ?? '#e6e6e6'}
                      onChange={(e) => setColor('categoryTextColors', cat, e.target.value)}
                    />
                  </label>
                  {textColor && (
                    <button
                      className="btn-link"
                      title="Remove text color"
                      onClick={() => setColor('categoryTextColors', cat, null)}
                    >
                      ✕
                    </button>
                  )}
                </span>
                <span
                  className="color-name"
                  style={{
                    background: color ? withOpacity(color, settings.tintOpacity) : undefined,
                    color: textColor ? withOpacity(textColor, settings.textOpacity) : undefined
                  }}
                >
                  {cat}
                </span>
              </div>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input
            placeholder="Custom category…"
            value={newCategory}
            style={{ width: 160 }}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCustomCategory()
            }}
          />
          <button className="btn" onClick={addCustomCategory}>
            + Add
          </button>
        </div>
      </section>

      <section className="card">
        <h2>AZAN format</h2>
        <p className="muted">
          Each prayer plays its azan at the computed time (category below). These extra lines are
          emitted around every azan at a second offset — e.g. the deckfade macro 10 seconds before.
        </p>

        {!format ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            <div className="row" style={{ margin: '8px 0 4px' }}>
              <label>
                AZAN audio category{' '}
                <select
                  value={format.azanCategory}
                  onChange={(e) => update({ ...format, azanCategory: e.target.value })}
                >
                  {(CATEGORY_OPTIONS.includes(format.azanCategory)
                    ? CATEGORY_OPTIONS
                    : [format.azanCategory, ...CATEGORY_OPTIONS]
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Offset (s)</th>
                  <th style={{ width: 64 }}>Cue</th>
                  <th>Name / cart</th>
                  <th style={{ width: 130 }}>Category</th>
                  <th>Description</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {format.lines.map((ln, i) => {
                  const noName = NO_NAME_CATEGORIES.includes(ln.category)
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          type="number"
                          value={ln.offset}
                          onChange={(e) => patchLine(i, { offset: Math.trunc(+e.target.value) })}
                          title="Seconds relative to the azan (negative = before)"
                        />
                      </td>
                      <td>
                        <select
                          value={ln.cue}
                          onChange={(e) => patchLine(i, { cue: e.target.value as Cue })}
                        >
                          {CUES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={ln.name}
                          disabled={noName}
                          placeholder={noName ? 'n/a for this category' : ''}
                          onChange={(e) => patchLine(i, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={ln.category}
                          onChange={(e) => {
                            const category = e.target.value
                            patchLine(i, {
                              category,
                              ...(NO_NAME_CATEGORIES.includes(category) ? { name: '' } : {})
                            })
                          }}
                        >
                          {(CATEGORY_OPTIONS.includes(ln.category)
                            ? CATEGORY_OPTIONS
                            : [ln.category, ...CATEGORY_OPTIONS]
                          ).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          dir="auto"
                          value={ln.description}
                          onChange={(e) => patchLine(i, { description: e.target.value })}
                        />
                      </td>
                      <td>
                        <button className="btn-link" onClick={() => removeLine(i)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={addLine}>
                + Add line
              </button>
              <span className="muted">
                Offset 0 = at the azan · negative = before · positive = after.
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
