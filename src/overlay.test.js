// ABOUTME: Tests for the detail overlay's markup (parity with the drawer it replaces) and geometry.
// ABOUTME: Signed-in and signed-out renders are checked separately against the spec's checklist.

import { describe, it, expect, afterEach } from 'vitest'
import { renderDetail, insetFrom, playExit } from './overlay.js'

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

  it('leaves an inert, hidden, id-independent copy to animate out', () => {
    show(DUNE)
    HTMLElement.prototype.animate = function () { return {} }
    playExit($('.detail'), null)
    const ghosts = document.body.querySelectorAll('.detail-ghost')
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].inert).toBe(true)
    expect(ghosts[0].getAttribute('aria-hidden')).toBe('true')
    expect(ghosts[0].querySelector('[mask]')).toBeNull()
  })
})
