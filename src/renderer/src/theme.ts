/** Theme registry. Ids map to the data-theme token blocks in styles.css.
 * Preview colors are duplicated from those blocks so the Settings picker can
 * render every card in its own look regardless of the active theme. */
export type ThemeId = 'dark' | 'light' | 'minimal' | 'graphite' | 'studio'

export interface ThemeMeta {
  id: ThemeId
  name: string
  desc: string
  preview: { bg: string; panel: string; accent: string; text: string }
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'dark',
    name: 'Dark',
    desc: 'Blue on slate — the original look.',
    preview: { bg: '#0f1115', panel: '#1f242d', accent: '#4f8cff', text: '#e6e9ef' }
  },
  {
    id: 'light',
    name: 'Light',
    desc: 'The original light counterpart.',
    preview: { bg: '#f4f6f9', panel: '#eceff4', accent: '#2f6fe0', text: '#1b1f27' }
  },
  {
    id: 'minimal',
    name: 'Minimal',
    desc: 'Monochrome ink on white. Compact, crisp, instant.',
    preview: { bg: '#fafafa', panel: '#f4f4f5', accent: '#18181b', text: '#1a1a1e' }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    desc: 'Desaturated charcoal with soft indigo. Smooth and calm.',
    preview: { bg: '#121214', panel: '#212124', accent: '#6e79d6', text: '#ececee' }
  },
  {
    id: 'studio',
    name: 'Studio',
    desc: 'Warm console tones, roomy type, on-air amber glow.',
    preview: { bg: '#17130e', panel: '#292219', accent: '#e0912e', text: '#ece3d4' }
  }
]

export const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id)
