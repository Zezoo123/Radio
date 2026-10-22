import { describe, expect, it } from 'vitest'
import { searchAudio, type AudioSearchSource } from '../src/main/core/audioSearch'

function source(): AudioSearchSource {
  const names = [
    'ADV-1710-A',
    'ADV-1710-B',
    'ADV-1711-A',
    'ID-MEGA-01',
    'MEGA-JINGLE-02',
    'MEGAPHONE',
    'SONG-LOVE',
    'AZAN_FAJR'
  ]
  return {
    tracks: new Map(names.map((n) => [n, 30])),
    descriptions: new Map([
      ['ADV-1710-A', 'Acme    Summer sale'],
      ['SONG-LOVE', 'Amr Diab    Habibi']
    ]),
    categories: new Map([
      ['ADV-1710-A', 'ADS'],
      ['SONG-LOVE', 'SONG']
    ])
  }
}

const names = (q: string, limit = 50): string[] =>
  searchAudio(source(), q, limit).map((h) => h.name)

describe('searchAudio (F7 lookup)', () => {
  it('matches anywhere in the file name, ignoring case', () => {
    expect(names('1710')).toEqual(['ADV-1710-A', 'ADV-1710-B'])
    expect(names('adv-1710-b')).toEqual(['ADV-1710-B'])
  })

  it('treats dash and underscore as the same character', () => {
    expect(names('azan_fajr')).toEqual(['AZAN_FAJR'])
    expect(names('azan-fajr')).toEqual(['AZAN_FAJR'])
    expect(names('ADV_1710_A')).toEqual(['ADV-1710-A'])
  })

  it('ignores an audio extension typed after the name', () => {
    expect(names('ADV-1711-A.wav')).toEqual(['ADV-1711-A'])
  })

  it('requires every word, in any order', () => {
    expect(names('jingle mega')).toEqual(['MEGA-JINGLE-02'])
    expect(names('mega nothing')).toEqual([])
  })

  it('ranks exact, then prefix, then word-start, then contains', () => {
    // exact < prefix (shorter first) < word-start < contains
    expect(names('mega')).toEqual(['MEGAPHONE', 'MEGA-JINGLE-02', 'ID-MEGA-01'])
    expect(names('MEGAPHONE')).toEqual(['MEGAPHONE'])
    expect(names('a')[0]).toBe('AZAN_FAJR')
  })

  it('carries description and category when the database has them', () => {
    expect(searchAudio(source(), 'ADV-1710-A', 5)).toEqual([
      { name: 'ADV-1710-A', description: 'Acme    Summer sale', category: 'ADS' }
    ])
    // Entries without library text come back with just the name.
    expect(searchAudio(source(), 'ADV-1710-B', 5)).toEqual([{ name: 'ADV-1710-B' }])
  })

  it('lists everything alphabetically for an empty query, capped by the limit', () => {
    expect(names('')).toEqual([
      'ADV-1710-A',
      'ADV-1710-B',
      'ADV-1711-A',
      'AZAN_FAJR',
      'ID-MEGA-01',
      'MEGA-JINGLE-02',
      'MEGAPHONE',
      'SONG-LOVE'
    ])
    expect(names('', 3)).toHaveLength(3)
    expect(names('', 0)).toEqual([])
  })
})
