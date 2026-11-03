// ABOUTME: Tests for the normalised match key shared by the import merge,
// ABOUTME: the music readers and the cover finder.

import { describe, it, expect } from 'vitest'
import { normKey } from './match.js'

describe('normKey', () => {
  it('lowercases, drops punctuation and collapses spaces', () => {
    expect(normKey('  Dune:  The   Novel! ')).toBe('dune the novel')
  })

  it('treats a missing value as an empty key', () => {
    expect(normKey(null)).toBe('')
    expect(normKey(undefined)).toBe('')
  })

  it('drops accents from Latin letters', () => {
    expect(normKey('Björk')).toBe('bjork')
    expect(normKey('Sigur Rós')).toBe('sigur ros')
  })

  it('keeps letters and numbers in any script', () => {
    expect(normKey('Кино')).toBe('кино')
    expect(normKey('坂本龍一')).toBe('坂本龍一')
    expect(normKey('１９８４')).toBe('1984')
  })

  it('keeps vowel signs, so titles that differ only by one get different keys', () => {
    expect(normKey('काल')).toBe('काल')
    expect(normKey('काल')).not.toBe(normKey('कल'))
    expect(normKey('กี')).not.toBe(normKey('ก'))
  })

  it('keeps the marks of non-Latin letters, so Мой and Мои stay apart', () => {
    expect(normKey('Мой')).toBe('мой')
    expect(normKey('Мой')).not.toBe(normKey('Мои'))
  })

  it('gives two different all-Japanese album titles different keys', () => {
    const a = normKey('風の谷のナウシカ')
    const b = normKey('天空の城ラピュタ')
    expect(a).not.toBe('')
    expect(b).not.toBe('')
    expect(a).not.toBe(b)
  })

  it('keeps voiced kana distinct from their unvoiced forms', () => {
    expect(normKey('がっこう')).toBe('がっこう')
    expect(normKey('がっこう')).not.toBe(normKey('かっこう'))
  })
})
