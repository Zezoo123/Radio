/**
 * The station's Simian stores text in the Arabic ANSI codepage (Windows-1256).
 * The Jet/Access reader (mdb-reader) mis-decodes it as Windows-1252, producing
 * mojibake like `ÑÇãì ÌãÇá` — these helpers map the characters back to their
 * original bytes and re-decode them properly. Used by both the .bsi log parser
 * and the audio-database loader.
 */

/** Windows-1252's 0x80–0x9F block, mapped back from Unicode to the raw byte. */
const CP1252_INVERSE = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f]
])

/** Re-decode Windows-1252-mojibake text as Windows-1256 (Arabic). ASCII is untouched. */
export function fixArabicText(text: string): string {
  if (!/[\u0080-\uffff]/.test(text)) return text // pure ASCII — nothing to fix
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[i] = code < 256 ? code : (CP1252_INVERSE.get(code) ?? 0x3f) /* '?' */
  }
  try {
    return new TextDecoder('windows-1256').decode(bytes)
  } catch {
    return text // ICU without cp1256 — keep the original rather than corrupt it
  }
}

/**
 * fixArabicText for text of unknown provenance: strings already containing
 * genuine Arabic (U+0600–U+06FF) were decoded correctly and are left alone —
 * re-encoding would destroy them; everything else gets the mojibake fix.
 */
export function fixMisdecodedText(text: string): string {
  return /[\u0600-\u06ff]/.test(text) ? text : fixArabicText(text)
}
