import { describe, expect, it } from 'vitest'
import { decodeLogText, encodeAnsi } from '../src/main/core/export/encoding'

describe('ANSI (Windows-1256) log encoding', () => {
  it('encodes Arabic as single-byte Windows-1256, not UTF-8', () => {
    const buf = encodeAnsi('رامى جمال')
    expect(buf.length).toBe(9) // one byte per character
    expect(Array.from(buf.subarray(0, 2))).toEqual([0xd1, 0xc7]) // ر ا
  })

  it('keeps ASCII log lines byte-identical', () => {
    const line = '00:00:10|+|L024-073|LI|Liner\r\n'
    expect(encodeAnsi(line).toString('latin1')).toBe(line)
  })

  it('round-trips Arabic through encode/decode', () => {
    const text = '06:00:00|+|HP25|PR|برنامج الصباح\r\n'
    expect(decodeLogText(encodeAnsi(text))).toBe(text)
  })

  it('still decodes older UTF-8 exports correctly', () => {
    const text = 'رامى جمال | PROMO'
    expect(decodeLogText(Buffer.from(text, 'utf-8'))).toBe(text)
  })

  it('replaces characters outside the codepage instead of throwing', () => {
    expect(encodeAnsi('中').toString('latin1')).toBe('?')
  })
})
