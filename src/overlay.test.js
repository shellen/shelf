// ABOUTME: Tests that the detail overlay's markup matches the spec's parity checklist, plus its geometry and motion.
// ABOUTME: Signed-in and signed-out renders are checked separately against the spec's checklist.

import { describe, it, expect, afterEach } from 'vitest'
import { renderDetail, insetFrom, playEntrance, playExit } from './overlay.js'

const MEDIA = [
  { key: 'book', label: 'Books', creator: 'Author' },
  { key: 'album', label: 'Albums', creator: 'Artist' },
]
const DUNE = { id: 's2-dune', title: 'Dune', author: 'Frank Herbert', tags: ['sci-fi'], isbn: '9780441172719', rating: 4.5, notes: 'Spice.', dateRead: '2025-06-01', pages: 412, year: 1965, medium: 'book' }
const LINKS = [['Bookshop.org', 'https://bookshop.org/x'], ['Amazon', 'https://amazon.com/x'], ['Open Library', 'https://openlibrary.org/x']]

function show(book, opts = {}) {
  document.body.innerHTML = renderDetail(book, { readOnly: false, savingCover: false, media: MEDIA, links: LINKS, canPrev: true, canNext: true, settled: true, ...opts })
}
const $ = sel => document.querySelector(sel)

describe('renderDetail — always shown', () => {
  it('labels the medium and shows title, creator, notes, metadata and links', () => {
    show(DUNE)
    expect($('.detail-kicker').textContent).toBe('Book')
    expect($('[data-field="title"]').value).toBe('Dune')
    expect($('[data-field="author"]').value).toBe('Frank Herbert')
    expect($('[data-action="notes"]').value).toBe('Spice.')
    expect($('.detail-meta').textContent).toContain('1965')
    expect($('.detail-meta').textContent).toContain('412 pages')
    expect($('.detail-meta').textContent).toContain('read 2025-06-01')
    expect([...document.querySelectorAll('.detail-links a')].map(a => a.textContent)).toEqual(['Bookshop.org', 'Amazon', 'Open Library'])
  })

  it('shows the star display with halves and the numeric rating', () => {
    show(DUNE, { readOnly: true })
    expect(document.querySelectorAll('.star-display.filled')).toHaveLength(4)
    expect(document.querySelectorAll('.star-display.half-filled')).toHaveLength(1)
    expect($('.rating-value').textContent).toBe('4.5')
  })

  it('links to more by the author only when there is one', () => {
    show(DUNE, { readOnly: true })
    expect($('[data-action="author-route"]')).not.toBeNull()
    show({ ...DUNE, author: null })
    expect($('[data-action="author-route"]')).toBeNull()
  })

  it('reflects whether it can step to a previous or next item', () => {
    show(DUNE, { canPrev: false, canNext: true })
    expect($('[data-action="detail-prev"]').disabled).toBe(true)
    expect($('[data-action="detail-next"]').disabled).toBe(false)
  })

  it('keeps quoted and markup data intact in fields', () => {
    show({ ...DUNE, title: '<img src=x> & "Friends"', author: '<b>x</b>' })
    expect($('[data-field="title"]').value).toBe('<img src=x> & "Friends"')
    expect($('[data-field="author"]').value).toBe('<b>x</b>')
    expect($('.detail img')).toBeNull()
  })
})

describe('renderDetail — poster', () => {
  const radii = () => [...document.querySelectorAll('.detail-ink-blob')].map(b => b.getAttribute('r'))

  it('draws the cover fully inked when settled', () => {
    show(DUNE, { settled: true })
    expect(radii().length).toBeGreaterThan(0)
    expect(radii().every(r => r === '900')).toBe(true)
  })

  it('draws the cover uninked when not settled', () => {
    show(DUNE, { settled: false })
    expect(radii().length).toBeGreaterThan(0)
    expect(radii().every(r => r === '0')).toBe(true)
  })
})

describe('renderDetail — poster shape', () => {
  const ALBUM = { ...DUNE, id: 'abbey-road', title: 'Abbey Road', author: 'The Beatles', medium: 'album' }
  const attrs = (sel, names) => names.map(name => $(sel).getAttribute(name))
  const blobs = () => [...document.querySelectorAll('.detail-ink-blob')].map(b => [b.getAttribute('cx'), b.getAttribute('cy')])

  it('draws a book\'s poster on a 600 by 900 page, its art filling the page', () => {
    show(DUNE)
    expect($('.detail-poster').className).toBe('detail-poster shape-tall')
    expect($('.detail-poster svg').getAttribute('viewBox')).toBe('0 0 600 900')
    expect(attrs('#detail-clip rect', ['width', 'height'])).toEqual(['600', '900'])
    expect(attrs('.detail-cover-image', ['width', 'height', 'preserveAspectRatio'])).toEqual(['600', '900', 'xMidYMid slice'])
    expect(attrs('#detail-ink', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1300'])
    expect(attrs('#detail-ink-filter', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1300'])
    expect(blobs()).toEqual([['190', '330'], ['430', '600'], ['316', '120'], ['114', '760'], ['506', '250'], ['329', '860'], ['291', '470']])
  })

  it('draws a square item\'s poster on a 600 by 600 page, its art whole within it', () => {
    show(ALBUM)
    expect($('.detail-poster').className).toBe('detail-poster shape-square')
    expect($('.detail-poster svg').getAttribute('viewBox')).toBe('0 0 600 600')
    expect(attrs('#detail-clip rect', ['width', 'height'])).toEqual(['600', '600'])
    expect(attrs('.detail-cover-image', ['width', 'height', 'preserveAspectRatio'])).toEqual(['600', '600', 'xMidYMid meet'])
    expect(attrs('#detail-ink', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1000'])
    expect(attrs('#detail-ink-filter', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1000'])
    // The blobs land at the same places, with their heights scaled into the square
    expect(blobs()).toEqual([['190', '220'], ['430', '400'], ['316', '80'], ['114', '507'], ['506', '167'], ['329', '573'], ['291', '313']])
  })

  it('draws an album\'s record under its art', () => {
    show(ALBUM)
    const inked = $('.detail-poster [mask]')
    expect(inked.querySelectorAll('circle')).toHaveLength(4)
    expect(inked.lastElementChild.classList.contains('detail-cover-image')).toBe(true)
  })
})

describe('renderDetail — paper behind square art', () => {
  it('lays paper the size of a square page between the drawn cover and the art', () => {
    show({ ...DUNE, medium: 'podcast' })
    const paper = $('.detail-cover-paper')
    expect(['width', 'height'].map(name => paper.getAttribute(name))).toEqual(['600', '600'])
    expect(paper.nextElementSibling.classList.contains('detail-cover-image')).toBe(true)
  })

  it('lays no paper under a book\'s art, which fills its page', () => {
    show(DUNE)
    expect($('.detail-cover-paper')).toBeNull()
  })
})

describe('renderDetail — signed in', () => {
  it('offers medium, tags and ISBN inputs', () => {
    show(DUNE)
    expect($('[data-field="medium"]').value).toBe('book')
    expect($('[data-field="tags"]').value).toBe('sci-fi')
    expect($('[data-field="isbn"]').value).toBe('9780441172719')
  })

  it('offers rating targets, Clear, Change Cover and Remove Book', () => {
    show(DUNE)
    expect(document.querySelectorAll('[data-action="set-rating"]')).toHaveLength(10)
    expect($('[data-action="clear-rating"]')).not.toBeNull()
    expect($('[data-action="open-cover-picker"]').textContent.trim()).toBe('Change Cover')
    expect($('[data-action="delete-book"]')).not.toBeNull()
  })

  it('disables Change Cover with a spinner while a cover saves', () => {
    show(DUNE, { savingCover: true })
    expect($('[data-action="open-cover-picker"]').disabled).toBe(true)
    expect($('[data-action="open-cover-picker"] .loading')).not.toBeNull()
  })

  it('leaves the metadata line without the ISBN', () => {
    show(DUNE)
    expect($('.detail-meta').textContent).not.toContain('ISBN')
  })
})

describe('renderDetail — signed out', () => {
  it('makes title, creator and notes read-only and shows tags as chips', () => {
    show(DUNE, { readOnly: true })
    expect($('[data-field="title"]').hasAttribute('readonly')).toBe(true)
    expect($('[data-field="author"]').hasAttribute('readonly')).toBe(true)
    expect($('[data-action="notes"]').hasAttribute('readonly')).toBe(true)
    expect([...document.querySelectorAll('.detail-tag')].map(t => t.textContent)).toEqual(['sci-fi'])
  })

  it('drops every editing control and moves the ISBN into the metadata line', () => {
    show(DUNE, { readOnly: true })
    for (const sel of ['[data-field="medium"]', '[data-field="tags"]', '[data-field="isbn"]', '[data-action="set-rating"]', '[data-action="clear-rating"]', '[data-action="open-cover-picker"]', '[data-action="delete-book"]']) {
      expect($(sel)).toBeNull()
    }
    expect($('.detail-meta').textContent).toContain('ISBN 9780441172719')
  })
})

describe('insetFrom', () => {
  const viewport = { width: 1000, height: 800 }

  it('frames an unrotated rect exactly', () => {
    const { clip, origin } = insetFrom({ left: 100, top: 50, width: 200, height: 300 }, 0, viewport)
    expect(clip).toBe('inset(50px 700px 450px 100px round 3px)')
    expect(origin).toBe('200px 200px')
  })

  it('recovers the size of a rect drawn rotated, from its bounding box', () => {
    const a = 4.5 * Math.PI / 180
    const w = 100, h = 150
    const box = { width: w * Math.cos(a) + h * Math.sin(a), height: h * Math.cos(a) + w * Math.sin(a) }
    const rect = { left: 500 - box.width / 2, top: 400 - box.height / 2, ...box }
    const [top, right, bottom, left] = insetFrom(rect, -4.5, viewport).clip.match(/[\d.]+px/g).map(parseFloat)
    expect(viewport.width - left - right).toBeCloseTo(w)
    expect(viewport.height - top - bottom).toBeCloseTo(h)
  })
})

describe('playExit', () => {
  const original = HTMLElement.prototype.animate
  afterEach(() => {
    if (original) HTMLElement.prototype.animate = original
    else delete HTMLElement.prototype.animate
    document.querySelectorAll('.detail-ghost').forEach(g => g.remove())
  })

  it('leaves an inert, hidden copy without the ink mask to animate out', () => {
    show(DUNE)
    HTMLElement.prototype.animate = function () { return {} }
    playExit($('.detail'), null)
    const ghosts = document.body.querySelectorAll('.detail-ghost')
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].inert).toBe(true)
    expect(ghosts[0].getAttribute('aria-hidden')).toBe('true')
    expect(ghosts[0].querySelector('[mask]')).toBeNull()
  })

  it('leaves no copy under reduced motion', () => {
    show(DUNE)
    HTMLElement.prototype.animate = function () { return {} }
    playExit($('.detail'), null, { reducedMotion: true })
    expect(document.body.querySelectorAll('.detail-ghost')).toHaveLength(0)
  })
})

describe('playEntrance', () => {
  const original = Element.prototype.animate
  afterEach(() => {
    if (original) Element.prototype.animate = original
    else delete Element.prototype.animate
  })

  it('starts each rising line below the 6px of focus-ring room in its mask', () => {
    show(DUNE, { settled: false })
    Element.prototype.animate = function () { return {} }
    const starts = new Map()
    const lines = [...document.querySelectorAll('.dm > *')]
    // Stubbed per line: happy-dom's <select> doesn't pick up a prototype stub
    for (const line of lines) line.animate = function (frames) { starts.set(this, frames[0]); return {} }
    playEntrance($('.detail'), null, { reducedMotion: false })
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(starts.get(line).transform).toBe('translateY(calc(110% + 8px))')
  })

  it('holds its opening frames through each delay but nothing once finished', () => {
    show(DUNE, { settled: false })
    const fills = []
    const ends = []
    const record = function (frames, options) { fills.push(options?.fill); ends.push(frames.at(-1)); return {} }
    Element.prototype.animate = record
    for (const line of document.querySelectorAll('.dm > *')) line.animate = record
    const from = { rect: { left: 100, top: 100, width: 200, height: 300, right: 300, bottom: 400 }, rotate: -4.5 }
    playEntrance($('.detail'), from, { reducedMotion: false })
    expect(fills.length).toBeGreaterThan(1)
    expect(fills.every(fill => fill === 'backwards')).toBe(true)
    // Each one ends on the resting style, so letting go of the fill changes nothing on screen
    for (const end of ends) {
      if ('clipPath' in end) expect(end.clipPath).toBe('inset(0px 0px 0px 0px round 0px)')
      expect(['rotate(0deg)', 'translateY(0)']).toContain(end.transform)
    }
  })
})
