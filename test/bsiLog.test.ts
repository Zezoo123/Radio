import { describe, expect, it } from 'vitest'
import { fixArabicText, isBsiBuffer } from '../src/main/core/parsers/bsiLog'
import { fixMisdecodedText } from '../src/main/core/encoding'

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
    expect(fixArabicText('PROMO - MIDDAY MIX')).toBe('PROMO - MIDDAY MIX')
    expect(fixArabicText('HP25-AhwaSobh2')).toBe('HP25-AhwaSobh2')
  })

  it('fixMisdecodedText never touches text that is already real Arabic', () => {
    // The audio-DB description reported as rubbish by the station.
    expect(fixMisdecodedText('ÞåæÉ ÇáÕÈÍ - äæÑÇ ÕÈÑí')).toBe('قهوة الصبح - نورا صبري')
    expect(fixMisdecodedText('رامى جمال')).toBe('رامى جمال') // correct already — unchanged
    expect(fixMisdecodedText('ADS-1705-B')).toBe('ADS-1705-B')
  })
})
