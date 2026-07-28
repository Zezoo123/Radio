/**
 * Category color rendering, shared by the Editor grid and the Settings
 * preview chip so they always look the same.
 *
 * Stored colors are solid `#rrggbb`; two app-wide Settings percentages control
 * how they paint — the row-highlight opacity (default 35%, strong enough to
 * read as the picked color; older builds used 14%, which came out pale) and
 * the text opacity (default 100%). The alpha is applied at render time, never
 * persisted per category.
 */
export const DEFAULT_TINT_PCT = 35
export const DEFAULT_TEXT_PCT = 100

/** The solid `#rrggbb` part of a color that may carry an alpha suffix. */
export const colorBase = (color: string): string => color.slice(0, 7)

/** `#4f8cff` at 50% → `#4f8cff80`; 100% stays the solid color. */
export const withOpacity = (color: string, pct: number): string => {
  const clamped = Math.max(1, Math.min(100, Math.round(pct)))
  if (clamped === 100) return colorBase(color)
  return `${colorBase(color)}${Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')}`
}
