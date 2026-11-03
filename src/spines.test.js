// ABOUTME: Tests for deriving a book spine's colour, short title and creator name, and for wrapping cover titles.
// ABOUTME: Colour choice must be deterministic per id and spread across the palette.

import { describe, it, expect } from 'vitest'
import { SPINE_PALETTE, spinePalette, spineTitle, spineCreator, wrapWords, coverTypeSvg, coverSize } from './spines.js'

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

  it('keeps at most four lines, ending the last with an ellipsis when text is left over', () => {
    expect(wrapWords('  one two  three four five six ', 3)).toEqual(['one', 'two', 'three', 'four…'])
    expect(wrapWords('one two three four', 3)).toEqual(['one', 'two', 'three', 'four'])
    expect(wrapWords('', 10)).toEqual([])
  })
})

describe('coverTypeSvg', () => {
  const draw = book => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${coverTypeSvg(book)}</svg>`, 'image/svg+xml')

  it('sets the creator, short title and year in the item\'s cloth colours', () => {
    const doc = draw({ id: 's2-dune', title: 'Dune: Deluxe Edition', author: 'Frank Herbert', year: 1965 })
    const { bg, fg } = spinePalette('s2-dune')
    expect(doc.querySelector('rect').getAttribute('fill')).toBe(bg)
    expect([...doc.querySelectorAll('text')].map(t => [t.textContent, t.getAttribute('fill')])).toEqual([
      ['FRANK HERBERT', fg], ['DUNE', fg], ['1965', fg],
    ])
  })

  it('gives the same item the same cover every time', () => {
    const book = { id: 'b7', title: 'The Design of Everyday Things', author: 'Don Norman' }
    expect(coverTypeSvg(book)).toBe(coverTypeSvg({ ...book }))
  })

  const titleSize = book => Number(draw(book).querySelectorAll('text')[1].getAttribute('font-size'))
  const tspans = book => [...draw(book).querySelectorAll('tspan')].map(t => t.textContent)

  it('sets a short title large and shrinks the type for a long line', () => {
    expect(titleSize({ id: 'a', title: 'Dune' })).toBe(62)
    const wide = titleSize({ id: 'a', title: 'Neuromancers' })
    expect(wide).toBeLessThan(52)
    const word = titleSize({ id: 'a', title: 'Supercalifragilistic' })
    expect(word).toBeLessThan(wide)
    // Roughly how wide the longest line sets, against the 600-wide cover less its margins
    expect(word * 20 * 0.75).toBeLessThanOrEqual(492)
  })

  it('keeps even a very long word at a legible size', () => {
    expect(titleSize({ id: 'a', title: 'Pneumonoultramicroscopicsilicovolcanoconiosis' })).toBe(24)
  })

  it('ends a title too long for four lines with an ellipsis', () => {
    const lines = tspans({ id: 'a', title: 'The Long Dark Tea Time of the Soul and Other Stories Told Twice' })
    expect(lines).toHaveLength(4)
    expect(lines[3].endsWith('…')).toBe(true)
  })

  it('cuts a long creator short with an ellipsis', () => {
    const creator = draw({ id: 'a', title: 'X', author: 'The Very Long Name of a Chamber Orchestra and Choir of London' }).querySelector('text').textContent
    expect(creator.length).toBeLessThanOrEqual(31)
    expect(creator.endsWith('…')).toBe(true)
    expect(draw({ id: 'a', title: 'X', author: 'Frank Herbert' }).querySelector('text').textContent).toBe('FRANK HERBERT')
  })

  it('names an untitled item', () => {
    expect(tspans({ id: 'a', title: '' })).toEqual(['UNTITLED'])
    expect(tspans({ id: 'a' })).toEqual(['UNTITLED'])
  })

  it('sets item data as text', () => {
    const doc = draw({ id: 'h', title: '<b>Bold</b> & Co', author: '"Q"' })
    expect(doc.querySelector('b')).toBeNull()
    expect([...doc.querySelectorAll('tspan')].map(t => t.textContent).join(' ')).toBe('<B>BOLD</B> & CO')
  })

  it('sets a tall item\'s cover on a 600 by 900 page, line for line', () => {
    const book = { id: 's2-dune', title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', year: 1969, medium: 'book' }
    expect(coverTypeSvg(book)).toBe([
      '<rect width="600" height="900" fill="#6B3A4B"/>',
      '<text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="#EDE3CC">URSULA K. LE GUIN</text>',
      '<text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="47" fill="#EDE3CC"><tspan x="300" y="424.1">THE LEFT HAND</tspan><tspan x="300" y="475.8">OF DARKNESS</tspan></text>',
      '<text x="300" y="830" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="#EDE3CC">1969</text>',
    ].join('\n    '))
  })

  it.each(['podcast', 'audiobook'])('sets the creator, short title and year of a %s on a square page', medium => {
    const doc = draw({ id: 'radiolab', title: 'Radiolab: Season One', author: 'WNYC Studios', year: 2002, medium })
    const { bg, fg } = spinePalette('radiolab')
    const rect = doc.querySelector('rect')
    expect([rect.getAttribute('height'), rect.getAttribute('fill')]).toEqual(['600', bg])
    expect([...doc.querySelectorAll('text')].map(t => [t.textContent, t.getAttribute('fill')])).toEqual([
      ['WNYC STUDIOS', fg], ['RADIOLAB', fg], ['2002', fg],
    ])
    // The title is centred on the square and the year sits as far from its foot as on a tall cover
    expect(doc.querySelector('tspan').getAttribute('y')).toBe('300.0')
    expect(doc.querySelectorAll('text')[2].getAttribute('y')).toBe('530')
  })
})

describe('coverSize', () => {
  it('is 600 by 900 for a tall item and 600 by 600 for a square one', () => {
    expect(coverSize({ medium: 'book' })).toEqual({ width: 600, height: 900 })
    expect(coverSize({})).toEqual({ width: 600, height: 900 })
    expect(coverSize({ medium: 'podcast' })).toEqual({ width: 600, height: 600 })
    expect(coverSize({ medium: 'album' })).toEqual({ width: 600, height: 600 })
  })
})

describe('the record cover', () => {
  const draw = book => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${coverTypeSvg(book)}</svg>`, 'image/svg+xml')
  const ALBUM = { id: 'ok-computer', title: 'OK Computer: OKNOTOK 1997 2017', author: 'Radiohead', year: 1997, medium: 'album' }
  const circles = doc => [...doc.querySelectorAll('circle')].map(c => [c.getAttribute('cx'), c.getAttribute('cy'), c.getAttribute('r'), c.getAttribute('fill')])

  it('fills a square sleeve with the album\'s cloth colour', () => {
    const rect = draw(ALBUM).querySelector('rect')
    expect([rect.getAttribute('width'), rect.getAttribute('height'), rect.getAttribute('fill')]).toEqual(['600', '600', spinePalette('ok-computer').bg])
  })

  it('draws a near-black disc 14% in from each edge, its rim, a paper label, and a spindle hole in the disc colour', () => {
    expect(circles(draw(ALBUM))).toEqual([
      ['300', '300', '216', '#141414'],
      ['300', '300', '214', 'none'],
      ['300', '300', '100', '#EDE3CC'],
      ['300', '300', '7', '#141414'],
    ])
  })

  it('edges the disc with a thin rim in the sleeve\'s light colour', () => {
    const rim = [...draw(ALBUM).querySelectorAll('circle')].find(c => c.getAttribute('r') === '214')
    expect([rim.getAttribute('fill'), rim.getAttribute('stroke'), rim.getAttribute('stroke-opacity'), rim.getAttribute('stroke-width')])
      .toEqual(['none', spinePalette('ok-computer').fg, '.45', '4'])
  })

  it('draws the rim just inside the disc, before the label', () => {
    const radii = [...draw(ALBUM).querySelectorAll('circle')].map(c => c.getAttribute('r'))
    expect(radii.slice(0, 3)).toEqual(['216', '214', '100'])
  })

  it('cuts a single word too long for the label with an ellipsis', () => {
    const lines = [...draw({ ...ALBUM, title: 'Supercalifragilisticexpialidocious' }).querySelectorAll('tspan')].map(t => t.textContent)
    expect(lines).toHaveLength(1)
    expect(lines[0].length).toBeLessThanOrEqual(14)
    expect(lines[0].endsWith('…')).toBe(true)
  })

  it('cuts a long unspaced title in a script without spaces', () => {
    const lines = [...draw({ ...ALBUM, title: '宇多田ヒカルファーストラブアルバム初回限定盤' }).querySelectorAll('tspan')].map(t => t.textContent)
    expect(lines.every(l => l.length <= 14)).toBe(true)
    expect(lines.at(-1).endsWith('…')).toBe(true)
  })

  it('keeps every line of a normal title as it was', () => {
    expect([...draw({ ...ALBUM, title: 'Kind of Blue' }).querySelectorAll('tspan')].map(t => t.textContent)).toEqual(['KIND OF BLUE'])
  })

  it('carries the artist and the short title on the label, in ink', () => {
    const texts = [...draw(ALBUM).querySelectorAll('text')]
    expect(texts.map(t => [t.textContent, t.getAttribute('fill')])).toEqual([['RADIOHEAD', '#141414'], ['OK COMPUTER', '#141414']])
    expect(texts.map(t => t.getAttribute('font-family'))).toEqual(['Inter Tight, sans-serif', 'Newsreader, Georgia, serif'])
  })

  it('sets the artist above the spindle hole and the title below it', () => {
    const doc = draw(ALBUM)
    const [artist, title] = doc.querySelectorAll('text')
    // The hole spans 293 to 307; a line reaches at most its font size above its baseline
    expect(Number(artist.getAttribute('y'))).toBeLessThan(293)
    const size = Number(title.getAttribute('font-size'))
    expect([...title.querySelectorAll('tspan')].every(t => Number(t.getAttribute('y')) - size > 307)).toBe(true)
  })

  it('keeps a long title to two lines on the label, ending the second with an ellipsis', () => {
    const lines = [...draw({ ...ALBUM, title: 'The Freewheelin\' Bob Dylan Remastered Mono Edition' }).querySelectorAll('tspan')].map(t => t.textContent)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  it('cuts a long artist short to fit the label', () => {
    const artist = draw({ ...ALBUM, author: 'The London Symphony Orchestra and Chorus' }).querySelector('text').textContent
    expect(artist.length).toBeLessThanOrEqual(18)
    expect(artist.endsWith('…')).toBe(true)
  })

  it('names an untitled album', () => {
    expect([...draw({ id: 'x', medium: 'album' }).querySelectorAll('tspan')].map(t => t.textContent)).toEqual(['UNTITLED'])
  })

  it('sets album data as text', () => {
    const doc = draw({ id: 'h', title: '<b>Bold</b> & Co', author: '"Q" <i>', medium: 'album' })
    expect(doc.querySelector('b')).toBeNull()
    expect(doc.querySelector('i')).toBeNull()
    expect(doc.querySelector('text').textContent).toBe('"Q" <I>')
    expect([...doc.querySelectorAll('tspan')].map(t => t.textContent).join(' ')).toBe('<B>BOLD</B> & CO')
  })

  it('is drawn only for albums', () => {
    expect(draw({ ...ALBUM, medium: 'podcast' }).querySelector('circle')).toBeNull()
    expect(draw({ ...ALBUM, medium: 'book' }).querySelector('circle')).toBeNull()
  })
})
