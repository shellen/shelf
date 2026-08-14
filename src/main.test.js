// ABOUTME: Frontend tests for the bookshelf app.
// ABOUTME: Covers initial render and search interaction behavior.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const BOOKS = [
  { id: 's1-flow', title: 'Flow', author: 'Mihaly Csikszentmihalyi', tags: ['psychology'], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null },
  { id: 's2-dune', title: 'Dune', author: 'Frank Herbert', tags: ['sci-fi'], isbn: null, coverUrl: null, rating: 5, notes: null, dateRead: null, dateAdded: null, pages: 412, year: 1965 },
  { id: 's2-design-of-everyday-things', title: 'The Design of Everyday Things', author: 'Don Norman', tags: ['design'], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null },
]

async function loadApp(books = BOOKS) {
  document.body.innerHTML = '<div id="app"></div>'
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const u = String(url)
    if (u.endsWith('/api/books') && (!opts.method || opts.method === 'GET')) {
      return { ok: true, json: async () => ({ books: books.map(b => ({ ...b, tags: [...b.tags] })) }) }
    }
    const idMatch = u.match(/\/api\/books\/([^/]+)$/)
    if (idMatch && opts.method === 'PUT') {
      const existing = books.find(b => b.id === idMatch[1])
      const updated = { ...existing, ...JSON.parse(opts.body), id: idMatch[1] }
      return { ok: true, json: async () => updated }
    }
    throw new Error('unexpected fetch: ' + u)
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
  beforeEach(() => loadApp())

  it('shows all books in the cover wall', () => {
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
    expect(document.querySelector('.header-count').textContent).toContain('3 shown')
  })
})

describe('html escaping', () => {
  const HOSTILE = [{
    id: 's1-hostile',
    title: '<img src=x onerror="window.pwned=true"> & "Friends"',
    author: '<b>Bold Author</b>',
    tags: ['<i>tag</i>'],
    isbn: null,
    coverUrl: null,
    rating: null,
    notes: null,
    dateRead: null,
    dateAdded: null,
    pages: null,
    year: null
  }]

  it('renders markup in book data as plain text', async () => {
    await loadApp(HOSTILE)

    expect(window.pwned).toBeUndefined()
    expect(document.querySelector('.cover-tile img[src="x"]')).toBeNull()
    expect(document.querySelector('.cover-title').textContent).toBe('<img src=x onerror="window.pwned=true"> & "Friends"')
    expect(document.querySelector('.cover-tag').textContent).toBe('<i>tag</i>')
  })

  it('keeps quoted data intact in edit form value attributes', async () => {
    await loadApp(HOSTILE)

    document.querySelector('[data-id="s1-hostile"]').click()
    document.querySelector('[data-action="edit-book"]').click()

    expect(document.getElementById('add-title').value).toBe('<img src=x onerror="window.pwned=true"> & "Friends"')
    expect(document.getElementById('add-author').value).toBe('<b>Bold Author</b>')
  })
})

describe('drawer metadata', () => {
  it('shows metadata instead of shelf in the drawer', async () => {
    await loadApp()
    document.querySelector('[data-id="s2-dune"]').click()
    const meta = document.querySelector('.drawer-meta').textContent
    expect(meta).not.toContain('Shelf')
    expect(meta).toContain('1965')
    expect(meta).toContain('412')
  })
})

describe('editing a book', () => {
  beforeEach(() => loadApp())

  it('opens a prefilled edit form from the drawer', () => {
    document.querySelector('[data-id="s2-dune"]').click()
    document.querySelector('[data-action="edit-book"]').click()

    expect(document.getElementById('add-title').value).toBe('Dune')
    expect(document.getElementById('add-author').value).toBe('Frank Herbert')
    expect(document.getElementById('add-tags').value).toBe('sci-fi')
  })

  it('saves edited fields via PUT and updates the drawer', async () => {
    document.querySelector('[data-id="s2-dune"]').click()
    document.querySelector('[data-action="edit-book"]').click()

    document.getElementById('add-author').value = 'Frank Herbert Sr.'
    document.querySelector('[data-action="save-book"]').click()

    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal still open')
    })

    const put = fetch.mock.calls.find(([, opts]) => opts?.method === 'PUT')
    expect(put[0]).toContain('/api/books/s2-dune')
    expect(JSON.parse(put[1].body).author).toBe('Frank Herbert Sr.')
    expect(document.querySelector('.drawer-author').textContent).toBe('Frank Herbert Sr.')
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

describe('empty results', () => {
  beforeEach(() => loadApp())

  it('shows an empty state when no books match the search', () => {
    const input = document.querySelector('[data-action="search"]')
    input.focus()

    typeInSearch('zzzzz')

    expect(document.querySelector('.empty-state')).not.toBeNull()
    expect(document.querySelector('.empty-state').textContent).toContain('No books match')
  })
})

describe('list view sorting', () => {
  beforeEach(() => loadApp())

  it('sorts by author when the author column header is clicked', () => {
    document.querySelector('[data-view="list"]').click()
    document.querySelector('[data-sort="author"]').click()

    const firstTitle = document.querySelector('.list-row .list-title button').textContent
    expect(firstTitle).toBe('The Design of Everyday Things')
  })
})

describe('keyboard access', () => {
  beforeEach(() => loadApp())

  it('opens a book from the cover wall with the Enter key', () => {
    const tile = document.querySelector('[data-id="s2-dune"]')
    expect(tile.getAttribute('tabindex')).toBe('0')

    tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(document.querySelector('.drawer-title').textContent).toBe('Dune')
  })
})

describe('search', () => {
  beforeEach(() => loadApp())

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
