import { describe, expect, it } from 'vitest'
import { fixArabicText, isBsiBuffer } from '../src/main/core/parsers/bsiLog'

describe('bsi log helpers', () => {
  it('detects the Jet database magic', () => {
    const jet = Buffer.concat([
      Buffer.from([0, 1, 0, 0]),
      Buffer.from('Standard Jet DB'),
      Buffer.alloc(16)
    ])
    expect(isBsiBuffer(jet)).toBe(true)
    expect(isBsiBuffer(Buffer.from('00:00:10|+|L024-073|LI|Liner'))).toBe(false)
    expect(isBsiBuffer(Buffer.alloc(4))).toBe(false)
  })

  it('re-decodes cp1252 mojibake as Arabic and leaves ASCII alone', () => {
    expect(fixArabicText('ÑÇãì ÌãÇá')).toBe('رامى جمال')
    expect(fixArabicText('PROMO - NOON TUNES')).toBe('PROMO - NOON TUNES')
    expect(fixArabicText('HP25-LazizWeSay2')).toBe('HP25-LazizWeSay2')
  })
})
