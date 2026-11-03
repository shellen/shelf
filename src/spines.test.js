// ABOUTME: Tests for deriving a book spine's colour, short title and creator name, and for wrapping cover titles.
// ABOUTME: Colour choice must be deterministic per id and spread across the palette.

import { describe, it, expect } from 'vitest'
import { SPINE_PALETTE, spinePalette, spineTitle, spineCreator, wrapWords } from './spines.js'

describe('spinePalette', () => {
  it('always gives the same id the same palette entry', () => {
    expect(spinePalette('s2-dune')).toBe(spinePalette('s2-dune'))
    expect(SPINE_PALETTE).toContain(spinePalette('s2-dune'))
  })

  it('does not depend on what else is on the shelf', () => {
    const ids = ['a', 'b', 'c', 'd']
    const forward = ids.map(spinePalette)
    const backward = [...ids].reverse().map(spinePalette).reverse()
    expect(backward).toEqual(forward)
  })

  it('spreads ids across the palette', () => {
    const used = new Set(Array.from({ length: 50 }, (_, i) => spinePalette(`book-${i}`)))
    expect(used.size).toBeGreaterThanOrEqual(5)
  })

  it('pairs every cloth colour with text that meets WCAG AA contrast', () => {
    const channel = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = hex => {
      const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    for (const { bg, fg } of SPINE_PALETTE) {
      const [hi, lo] = [luminance(bg), luminance(fg)].sort((a, b) => b - a)
      expect((hi + 0.05) / (lo + 0.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('spineTitle', () => {
  it('keeps a plain title', () => {
    expect(spineTitle('Dune')).toBe('Dune')
  })

  it('drops a subtitle', () => {
    expect(spineTitle('A Long Walk to Water: A Powerful Adventure')).toBe('A Long Walk to Water')
  })

  it('drops a trailing series marker', () => {
    expect(spineTitle('Polostan (Bomb Light #1)')).toBe('Polostan')
  })

  it('handles a missing title', () => {
    expect(spineTitle(undefined)).toBe('')
  })
})

describe('spineCreator', () => {
  it('uses the surname', () => {
    expect(spineCreator('Frank Herbert')).toBe('Herbert')
  })

  it('skips generational suffixes', () => {
    expect(spineCreator('Kurt Vonnegut Jr.')).toBe('Vonnegut')
  })

  it('keeps single-word names and handles none', () => {
    expect(spineCreator('WNYC')).toBe('WNYC')
    expect(spineCreator(null)).toBe('')
  })
})

describe('wrapWords', () => {
  it('breaks at word boundaries within the width', () => {
    expect(wrapWords('THE DESIGN OF EVERYDAY THINGS', 13)).toEqual(['THE DESIGN OF', 'EVERYDAY', 'THINGS'])
  })

  it('gives a word longer than the width a line of its own', () => {
    expect(wrapWords('A CSIKSZENTMIHALYI READER', 10)).toEqual(['A', 'CSIKSZENTMIHALYI', 'READER'])
  })

  it('keeps at most four lines and ignores extra whitespace', () => {
    expect(wrapWords('  one two  three four five six ', 3)).toEqual(['one', 'two', 'three', 'four'])
    expect(wrapWords('', 10)).toEqual([])
  })
})
