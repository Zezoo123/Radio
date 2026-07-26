/**
 * Category highlight rendering, shared by the Editor grid and the Settings
 * preview chip so they always look the same.
 *
 * The stored color is a solid `#rrggbb`; rows paint it translucently so the
 * cell text stays readable. `TINT_ALPHA` is the hex alpha suffix — 0x59 ≈ 35%,
 * strong enough to read as the picked color (older builds used 14%, which came
 * out pale and washed-out).
 */
export const TINT_ALPHA = '59'

export const tintBackground = (color: string): string => `${color}${TINT_ALPHA}`
