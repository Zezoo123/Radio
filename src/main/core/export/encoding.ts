import iconv from 'iconv-lite'

/**
 * Simian Pro is a non-Unicode (ANSI) Windows app: it reads log files through
 * the system codepage, which on Arabic-locale machines is Windows-1256. UTF-8
 * Arabic comes out as mojibake there, so every exported text log is encoded
 * as Windows-1256 and opened logs are decoded the same way.
 */
const ANSI_CODEPAGE = 'win1256'

/** Encode text for a Simian log file (Windows-1256 "ANSI"). Characters with
 *  no ANSI equivalent become `?`. */
export function encodeAnsi(text: string): Buffer {
  return iconv.encode(text, ANSI_CODEPAGE)
}

/**
 * Decode a text log of unknown origin. Files this app exported before the
 * ANSI switch are UTF-8; files exported now (or saved by Simian itself) are
 * Windows-1256. Strict-UTF-8 tells them apart: pure ASCII decodes identically
 * either way, and Windows-1256 Arabic is essentially never valid UTF-8.
 */
export function decodeLogText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return iconv.decode(buffer, ANSI_CODEPAGE)
  }
}
