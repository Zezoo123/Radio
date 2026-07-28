/**
 * Category color rendering, shared by the Editor grid and the Settings
 * preview chip so they always look the same.
 *
 * A stored color is `#rrggbb` or `#rrggbbaa` — the user can set an opacity %
 * per category in Settings, persisted as the hex alpha suffix. A plain 6-digit
 * color keeps the defaults: highlights paint at `TINT_ALPHA` (0x59 ≈ 35%,
 * strong enough to read as the picked color — older builds used 14%, which
 * came out pale and washed-out), text draws fully opaque.
 */
export const TINT_ALPHA = '59'
export const DEFAULT_TINT_PCT = 35

/** Row highlight: an explicit alpha wins, otherwise the default tint. */
export const tintBackground = (color: string): string =>
  color.length === 9 ? color : `${color}${TINT_ALPHA}`

/** The `#rrggbb` part — what a `<input type="color">` can hold. */
export const colorBase = (color: string): string => color.slice(0, 7)

/** The stored opacity as 1-100, or `fallback` for a plain 6-digit color. */
export const colorAlphaPct = (color: string, fallback: number): number =>
  color.length === 9
    ? Math.max(1, Math.round((parseInt(color.slice(7, 9), 16) / 255) * 100))
    : fallback

/** Attach an opacity % to a base color: `#4f8cff` + 50 → `#4f8cff80`. */
export const withAlphaPct = (base: string, pct: number): string => {
  const clamped = Math.max(1, Math.min(100, Math.round(pct)))
  return `${colorBase(base)}${Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')}`
}
