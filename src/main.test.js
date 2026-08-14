// ABOUTME: Frontend tests for the bookshelf app.
// ABOUTME: Covers initial render and search interaction behavior.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const BOOKS = [
  { id: 's1-flow', shelf: 1, title: 'Flow', author: 'Mihaly Csikszentmihalyi', tags: ['psychology'], isbn: null, coverUrl: null, rating: null, notes: null },
  { id: 's2-dune', shelf: 2, title: 'Dune', author: 'Frank Herbert', tags: ['sci-fi'], isbn: null, coverUrl: null, rating: null, notes: null },
  { id: 's2-design-of-everyday-things', shelf: 2, title: 'The Design of Everyday Things', author: 'Don Norman', tags: ['design'], isbn: null, coverUrl: null, rating: null, notes: null },
]

async function loadApp() {
  document.body.innerHTML = '<div id="app"></div>'
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).endsWith('/api/books')) {
      return { ok: true, json: async () => ({ books: BOOKS.map(b => ({ ...b, tags: [...b.tags] })) }) }
    }
    throw new Error('unexpected fetch: ' + url)
  }))
  vi.resetModules()
  await import('./main.js')
  await vi.waitFor(() => {
    if (!document.querySelector('.header')) throw new Error('app not rendered yet')
  })
}

function typeInSearch(chars) {
  for (const ch of chars) {
    const input = document.activeElement
    if (!input || input.tagName !== 'INPUT') return
    input.value += ch
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

describe('initial render', () => {
  beforeEach(loadApp)

  it('shows all books in the cover wall', () => {
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
    expect(document.querySelector('.header-count').textContent).toContain('3 shown')
  })
})

describe('static build fallback', () => {
  afterEach(() => {
    vi.doUnmock('virtual:bookshelf-data')
  })

  it('renders embedded books read-only when the API is unavailable', async () => {
    vi.doMock('virtual:bookshelf-data', () => ({ default: BOOKS }))
    document.body.innerHTML = '<div id="app"></div>'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable') }))
    vi.resetModules()
    await import('./main.js')
    await vi.waitFor(() => {
      if (!document.querySelector('.header')) throw new Error('app not rendered yet')
    })

    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
    expect(document.querySelector('[data-action="add-book"]')).toBeNull()
  })
})

describe('search', () => {
  beforeEach(loadApp)

  it('keeps focus in the search input while typing', () => {
    const input = document.querySelector('[data-action="search"]')
    input.focus()

    typeInSearch('dune')

    expect(document.activeElement).toBe(input)
    expect(document.querySelector('[data-action="search"]')).toBe(input)
    expect(document.querySelector('[data-action="search"]').value).toBe('dune')
  })

  it('filters results as the query is typed', () => {
    const input = document.querySelector('[data-action="search"]')
    input.focus()

    typeInSearch('dune')

    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
    expect(document.querySelector('.cover-title').textContent).toBe('Dune')
    expect(document.querySelector('.header-count').textContent).toContain('1 shown')
  })
})
