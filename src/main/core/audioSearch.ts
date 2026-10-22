/**
 * File-name search over the loaded Simian audio database — the "list of values"
 * behind F7 in the clock editor. Kept free of `mdb-reader` (like bookingCheck)
 * so it is renderer-safe and unit-testable without a real .mdb.
 */

/** One database entry offered by the lookup. */
export interface AudioSearchHit {
  /** UPPERCASED file name (no extension) — the key Simian finds the audio by. */
  name: string
  /** Advertiser + description library text, when the table has it. */
  description?: string
  /** Simian category (UPPERCASE), when the table has one. */
  category?: string
}

/** The slice of `SimianDb` the search needs. */
export interface AudioSearchSource {
  tracks: Map<string, number>
  descriptions: Map<string, string>
  categories: Map<string, string>
}

const AUDIO_EXT = /\.(wav|mp3|mp2|ogg|flac|m4a|aif+f?)$/i

/** Dash and underscore are interchangeable in cart names (`ADS_1710_A` = `ADS-1710-A`). */
const squash = (s: string): string => s.replace(/_/g, '-')

/**
 * Entries whose file name contains every word of `query` (any order, case- and
 * dash/underscore-insensitive). Best matches first: exact, then prefix, then a
 * match at a word start (`…-JINGLE`), then anywhere; shorter names win ties and
 * the rest is alphabetical. An empty query lists the database alphabetically.
 */
export function searchAudio(
  source: AudioSearchSource,
  query: string,
  limit: number
): AudioSearchHit[] {
  const q = squash(query.trim().replace(AUDIO_EXT, '').toUpperCase())
  const words = q.split(/\s+/).filter(Boolean)
  const first = words[0] ?? ''

  const found: { key: string; norm: string; rank: number }[] = []
  for (const key of source.tracks.keys()) {
    const norm = squash(key)
    if (!words.every((w) => norm.includes(w))) continue
    const rank =
      words.length === 0
        ? 4
        : norm === q
          ? 0
          : norm.startsWith(first)
            ? 1
            : norm.includes('-' + first)
              ? 2
              : 3
    found.push({ key, norm, rank })
  }

  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      (words.length > 0 ? a.norm.length - b.norm.length : 0) ||
      (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : 0)
  )

  return found.slice(0, Math.max(0, limit)).map(({ key }) => {
    const description = source.descriptions.get(key)
    const category = source.categories.get(key)
    return {
      name: key,
      ...(description ? { description } : {}),
      ...(category ? { category } : {})
    }
  })
}
