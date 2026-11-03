// ABOUTME: Tests of the whole app rendered in happy-dom against a stubbed fetch: views, shelf, detail, editing.
// ABOUTME: Also covers routes, search, sorting, keyboard shortcuts, sign-in, settings, adding and importing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spinePalette } from './spines.js'

const BOOKS = [
  { id: 's1-flow', title: 'Flow', author: 'Mihaly Csikszentmihalyi', tags: ['psychology'], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null, medium: 'book' },
  { id: 's2-dune', title: 'Dune', author: 'Frank Herbert', tags: ['sci-fi'], isbn: null, coverUrl: null, rating: 5, notes: null, dateRead: null, dateAdded: null, pages: 412, year: 1965, medium: 'book' },
  { id: 's2-design-of-everyday-things', title: 'The Design of Everyday Things', author: 'Don Norman', tags: ['design'], isbn: null, coverUrl: null, rating: 4, notes: null, dateRead: null, dateAdded: null, pages: null, year: null, medium: 'book' },
]

const MIXED = [
  ...BOOKS,
  { id: 'abbey-road', title: 'Abbey Road', author: 'The Beatles', tags: [], isbn: null, coverUrl: 'https://art.example/abbey.jpg', rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: 1969, medium: 'album' },
  { id: 'radiolab', title: 'Radiolab', author: 'WNYC', tags: [], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null, medium: 'podcast' },
]

async function loadApp(books = BOOKS, { session, settings, view = 'covers' } = {}) {
  window.location.hash = ''
  document.body.innerHTML = '<div id="app"></div>'
  const sessionState = session || { authRequired: false, writable: true }
  const settingsState = settings || { landing: ['book', 'audiobook', 'movie', 'podcast', 'album'] }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const u = String(url)
    if (u.endsWith('/api/session')) {
      return { ok: true, json: async () => ({ ...sessionState }) }
    }
    if (u.endsWith('/api/settings') && (!opts.method || opts.method === 'GET')) {
      return { ok: true, json: async () => ({ ...settingsState }) }
    }
    if (u.endsWith('/api/settings') && opts.method === 'PUT') {
      Object.assign(settingsState, JSON.parse(opts.body))
      return { ok: true, json: async () => ({ ...settingsState }) }
    }
    if (u.includes('/api/lookup')) {
      const q = decodeURIComponent(u.match(/q=([^&]*)/)?.[1] || '').toLowerCase()
      if (q.includes('mystery')) return { ok: true, json: async () => ({ results: [] }) }
      if (q.includes('snow')) {
        return { ok: true, json: async () => ({ results: [{ title: 'Snow Crash', author: 'Neal Stephenson', year: 1992, isbn: '9780553380958', coverUrl: 'https://covers.example/snow.jpg' }] }) }
      }
      return { ok: true, json: async () => ({ results: [{ title: 'Abbey Road', author: 'The Beatles', year: 1969, coverUrl: 'https://art.example/abbey600.jpg' }] }) }
    }
    if (u.endsWith('/api/books') && opts.method === 'POST') {
      const body = JSON.parse(opts.body)
      return { ok: true, status: 201, json: async () => ({ tags: [], ...body, id: body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') }) }
    }
    if (u.endsWith('/api/login') && opts.method === 'POST') {
      if (JSON.parse(opts.body).password === 'sekrit') {
        sessionState.writable = true
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return { ok: false, status: 401, json: async () => ({ error: 'Wrong password' }) }
    }
    if (u.endsWith('/api/logout') && opts.method === 'POST') {
      sessionState.writable = false
      return { ok: true, json: async () => ({ ok: true }) }
    }
    if (u.endsWith('/api/books') && (!opts.method || opts.method === 'GET')) {
      return { ok: true, json: async () => ({ books: books.map(b => ({ ...b, tags: [...b.tags] })) }) }
    }
    const coverMatch = u.match(/\/api\/books\/([^/]+)\/cover$/)
    if (coverMatch && opts.method === 'PATCH') {
      const existing = books.find(b => b.id === coverMatch[1])
      return { ok: true, json: async () => ({ ...existing, coverUrl: JSON.parse(opts.body).coverUrl }) }
    }
    const idMatch = u.match(/\/api\/books\/([^/]+)$/)
    if (idMatch && opts.method === 'PUT') {
      const existing = books.find(b => b.id === idMatch[1])
      const updated = { ...existing, ...JSON.parse(opts.body), id: idMatch[1] }
      return { ok: true, json: async () => updated }
    }
    if (u.endsWith('/api/import') && opts.method === 'POST') {
      return { ok: true, json: async () => ({ added: 1, filled: 1, skipped: 0 }) }
    }
    if (idMatch && opts.method === 'DELETE') {
      return { ok: true, json: async () => ({ ok: true }) }
    }
    if (u.startsWith('https://openlibrary.org/search.json')) {
      return { ok: true, json: async () => ({ docs: [] }) }
    }
    if (u.startsWith('https://www.googleapis.com/books/v1/volumes')) {
      return { ok: true, json: async () => ({ items: [] }) }
    }
    throw new Error('unexpected fetch: ' + u)
  }))
  vi.resetModules()
  await import('./main.js')
  await vi.waitFor(() => {
    if (!document.querySelector('.header')) throw new Error('app not rendered yet')
  })
  // Flush happy-dom's queued hashchange task from the hash reset above
  await new Promise(r => setTimeout(r, 0))
  // Most suites exercise the cover wall; shelf suites ask for { view: 'shelf' }
  if (view !== 'shelf') document.querySelector(`[data-view="${view}"]`).click()
}

function typeInSearch(chars) {
  for (const ch of chars) {
    const input = document.activeElement
    if (!input || input.tagName !== 'INPUT') return
    input.value += ch
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

describe('initial render', () => {
  beforeEach(() => loadApp())

  it('shows all books in the cover wall', () => {
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
    expect(document.querySelector('.status-bar').textContent).toContain('3 BOOKS')
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

  it('keeps quoted data intact in inline field value attributes', async () => {
    await loadApp(HOSTILE)

    document.querySelector('[data-id="s1-hostile"]').click()

    expect(document.querySelector('[data-field="title"]').value).toBe('<img src=x onerror="window.pwned=true"> & "Friends"')
    expect(document.querySelector('[data-field="author"]').value).toBe('<b>Bold Author</b>')
  })
})

describe('detail metadata', () => {
  it('shows metadata instead of shelf in the detail', async () => {
    await loadApp()
    document.querySelector('[data-id="s2-dune"]').click()
    const meta = document.querySelector('.detail-meta').textContent
    expect(meta).not.toContain('Shelf')
    expect(meta).toContain('1965')
    expect(meta).toContain('412')
  })
})

describe('detail overlay', () => {
  const openDune = () => document.querySelector('[data-id="s2-dune"]').click()
  const isInert = selector => document.querySelector(selector).hasAttribute('inert')

  it('makes the page behind it inert while it is open', async () => {
    await loadApp()
    openDune()
    expect(isInert('.header')).toBe(true)
    expect(isInert('#results')).toBe(true)
    expect(isInert('.status-bar')).toBe(true)
    expect(document.querySelector('.detail').closest('[inert]')).toBeNull()
    document.querySelector('[data-action="close-detail"]').click()
    expect(document.querySelector('.detail')).toBeNull()
    expect(document.querySelectorAll('#app [inert]')).toHaveLength(0)
  })

  it('makes the read-only banner inert while it is open', async () => {
    await loadApp(BOOKS, { session: { authRequired: false, writable: false, unprotected: true } })
    openDune()
    expect(isInert('.setup-banner')).toBe(true)
    document.querySelector('[data-action="close-detail"]').click()
    expect(isInert('.setup-banner')).toBe(false)
  })

  it('keeps the remove confirmation usable above it', async () => {
    await loadApp()
    openDune()
    document.querySelector('[data-action="delete-book"]').click()
    expect(document.querySelector('.confirm-dialog').closest('[inert]')).toBeNull()
  })

  it('keeps the cover picker usable above it', async () => {
    await loadApp()
    openDune()
    document.querySelector('[data-action="open-cover-picker"]').click()
    expect(document.querySelector('.cover-picker-panel').closest('[inert]')).toBeNull()
  })

  it('is itself inert while the remove confirmation is open', async () => {
    await loadApp()
    openDune()
    document.querySelector('[data-action="delete-book"]').click()
    expect(isInert('.detail')).toBe(true)
    document.querySelector('[data-action="confirm-cancel"]').click()
    expect(isInert('.detail')).toBe(false)
  })

  it('Escape cancels the remove confirmation and keeps the detail open', async () => {
    await loadApp()
    openDune()
    document.querySelector('[data-action="delete-book"]').click()
    press('Escape')
    expect(document.querySelector('.confirm-dialog')).toBeNull()
    expect(document.querySelector('.detail-title').value).toBe('Dune')
    expect(isInert('.detail')).toBe(false)
    await new Promise(r => setTimeout(r, 0)) // a confirmed removal would have sent its DELETE by now
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)
  })

  it('is itself inert while the cover picker is open', async () => {
    await loadApp()
    openDune()
    document.querySelector('[data-action="open-cover-picker"]').click()
    expect(isInert('.detail')).toBe(true)
    await vi.waitFor(() => {
      if (!document.querySelector('.cover-picker-empty')) throw new Error('search not finished')
    })
    expect(isInert('.detail')).toBe(true)
    document.querySelector('.modal-actions [data-action="close-cover-picker"]').click()
    expect(isInert('.detail')).toBe(false)
  })

  it('keeps focus on a step button that is still enabled after the step', async () => {
    await loadApp()
    openDune()
    const next = document.querySelector('[data-action="detail-next"]')
    next.focus()
    next.click()
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
    expect(document.activeElement?.dataset.action).toBe('detail-next')
  })

  it('moves focus to Close when a step disables the step button', async () => {
    await loadApp()
    openDune()
    for (let k = 0; k < 2; k++) {
      const next = document.querySelector('[data-action="detail-next"]')
      next.focus()
      next.click()
    }
    expect(document.querySelector('[data-field="title"]').value).toBe('The Design of Everyday Things')
    expect(document.querySelector('[data-action="detail-next"]').disabled).toBe(true)
    expect(document.activeElement?.dataset.action).toBe('close-detail')
  })

  it('keeps focus on Close across an arrow-key step', async () => {
    await loadApp()
    openDune()
    expect(document.activeElement?.dataset.action).toBe('close-detail')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
    expect(document.activeElement?.dataset.action).toBe('close-detail')
  })

  it('returns focus to the tile it was opened from on close', async () => {
    await loadApp()
    openDune()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.activeElement?.dataset.id).toBe('s2-dune')
    expect(document.activeElement.classList.contains('cover-tile')).toBe(true)
  })

  it('returns focus to the list row for the item last shown on close', async () => {
    await loadApp(BOOKS, { view: 'list' })
    document.querySelector('.list-title [data-id="s2-dune"]').click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    document.querySelector('[data-action="close-detail"]').click()
    expect(document.activeElement?.dataset.id).toBe('s1-flow')
    expect(document.activeElement.closest('.list-title')).not.toBeNull()
  })
})

describe('detail motion', () => {
  const ON_SCREEN = { left: 100, top: 100, right: 300, bottom: 400, width: 200, height: 300, x: 100, y: 100 }
  const OFF_SCREEN = { left: 100, top: 2000, right: 300, bottom: 2300, width: 200, height: 300, x: 100, y: 2000 }
  const openDune = () => document.querySelector('[data-id="s2-dune"]').click()
  const ghosts = () => document.querySelectorAll('body > .detail-ghost')
  const framesOf = el => {
    const { calls, contexts } = Element.prototype.animate.mock
    return calls[contexts.indexOf(el)]?.[0]
  }
  const original = Element.prototype.animate
  let tileRect

  beforeEach(async () => {
    await loadApp()
    tileRect = ON_SCREEN
    Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null }))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.dataset?.id === 's2-dune' ? tileRect : ON_SCREEN
    })
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1024 })
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 768 })
  })

  afterEach(() => {
    if (original) Element.prototype.animate = original
    else delete Element.prototype.animate
    vi.restoreAllMocks()
    delete document.documentElement.clientWidth
    delete document.documentElement.clientHeight
    ghosts().forEach(g => g.remove())
  })

  it('plays the entrance and focuses Close on open', () => {
    openDune()
    expect(Element.prototype.animate.mock.contexts).toContain(document.querySelector('#app .detail'))
    expect(document.activeElement?.dataset.action).toBe('close-detail')
  })

  it('folds a ghost back into the tile on close', () => {
    openDune()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(ghosts()).toHaveLength(1)
    expect(ghosts()[0].style.transformOrigin).toBe('200px 250px')
    expect(framesOf(ghosts()[0])[1].clipPath).toMatch(/^inset\(/)
  })

  it('fades the ghost out instead when the tile is off screen', () => {
    openDune()
    tileRect = OFF_SCREEN
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(ghosts()).toHaveLength(1)
    expect(framesOf(ghosts()[0])).toEqual([{ opacity: 1 }, { opacity: 0 }])
  })

  it('clears a lingering exit ghost when the detail opens again', () => {
    openDune()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(ghosts()).toHaveLength(1)
    openDune()
    expect(ghosts()).toHaveLength(0)
    expect(document.querySelectorAll('.detail')).toHaveLength(1)
  })
})

describe('inline editing', () => {
  beforeEach(() => loadApp())

  const openDune = () => document.querySelector('[data-id="s2-dune"]').click()
  const field = (name) => document.querySelector(`[data-field="${name}"]`)

  it('shows editable fields prefilled in the detail, with no edit modal path', () => {
    openDune()
    expect(field('title').value).toBe('Dune')
    expect(field('author').value).toBe('Frank Herbert')
    expect(field('tags').value).toBe('sci-fi')
    expect(field('isbn').value).toBe('')
    expect(document.querySelector('[data-action="edit-book"]')).toBeNull()
  })

  it('saves a changed field on blur via PUT without rebuilding the detail', async () => {
    openDune()
    const author = field('author')
    author.value = 'Frank Herbert Sr.'
    author.dispatchEvent(new Event('blur'))

    await vi.waitFor(() => {
      if (!fetch.mock.calls.some(([, o]) => o?.method === 'PUT')) throw new Error('no PUT yet')
    })
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(put[0]).toContain('/api/books/s2-dune')
    expect(JSON.parse(put[1].body)).toEqual({ author: 'Frank Herbert Sr.' })
    expect(field('author')).toBe(author)   // detail not re-rendered out from under the user
  })

  it('parses tags on save', async () => {
    openDune()
    const tags = field('tags')
    tags.value = 'Sci-Fi,  Classics '
    tags.dispatchEvent(new Event('blur'))

    await vi.waitFor(() => {
      if (!fetch.mock.calls.some(([, o]) => o?.method === 'PUT')) throw new Error('no PUT yet')
    })
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ tags: ['sci-fi', 'classics'] })
  })

  it('does not save an unchanged field', () => {
    openDune()
    const author = field('author')
    author.dispatchEvent(new Event('blur'))
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false)
  })

  it('Escape reverts the field and keeps the detail open', () => {
    openDune()
    const author = field('author')
    author.value = 'Wrong Name'
    author.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(field('author').value).toBe('Frank Herbert')
    expect(document.querySelector('.detail')).not.toBeNull()
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false)
  })

  it('refuses to save an empty title', () => {
    openDune()
    const title = field('title')
    title.value = '   '
    title.dispatchEvent(new Event('blur'))
    expect(field('title').value).toBe('Dune')
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false)
  })

  it('reverts the field when the save fails', async () => {
    openDune()
    fetch.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }))
    const author = field('author')
    author.value = 'Frank Herbert Sr.'
    author.dispatchEvent(new Event('blur'))

    await vi.waitFor(() => {
      if (field('author').value !== 'Frank Herbert') throw new Error('not reverted yet')
    })
  })

  it('sets the rating from a star in the detail', async () => {
    openDune()
    document.querySelector('[data-action="set-rating"][data-rating="4"]').click()
    await vi.waitFor(() => {
      if (!fetch.mock.calls.some(([, o]) => o?.method === 'PUT')) throw new Error('no PUT yet')
    })
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(JSON.parse(put[1].body).rating).toBe(4)
    await vi.waitFor(() => {
      if (document.querySelector('.detail .rating-value')?.textContent !== '4') throw new Error('rating not shown yet')
    })
  })

  it('clears the rating from the detail', async () => {
    openDune()
    document.querySelector('.detail [data-action="clear-rating"]').click()
    await vi.waitFor(() => {
      if (!fetch.mock.calls.some(([, o]) => o?.method === 'PUT')) throw new Error('no PUT yet')
    })
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(JSON.parse(put[1].body).rating).toBeNull()
    await vi.waitFor(() => {
      if (document.querySelector('.detail .rating-value')) throw new Error('rating still shown')
    })
  })

  it('saves notes from the detail on blur', async () => {
    openDune()
    const notes = document.querySelector('.detail [data-action="notes"]')
    notes.value = 'Read it twice.'
    notes.dispatchEvent(new Event('blur'))
    await vi.waitFor(() => {
      if (!fetch.mock.calls.some(([, o]) => o?.method === 'PUT')) throw new Error('no PUT yet')
    })
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(JSON.parse(put[1].body).notes).toBe('Read it twice.')
  })

  it('e focuses the title field for the selected book', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect(document.activeElement?.dataset.field).toBe('title')
  })
})

describe('shelf media', () => {
  it('renames the masthead to Shelf', async () => {
    await loadApp()
    expect(document.querySelector('.masthead-title h1').textContent).toBe('Shelf')
  })

  it('renders medium tabs for present media and filters through them', async () => {
    await loadApp(MIXED)
    const tabs = [...document.querySelectorAll('.media-tab')].map(t => t.textContent.trim())
    expect(tabs[0]).toBe('All')
    expect(tabs.join(' ')).toContain('Books')
    expect(tabs.join(' ')).toContain('Albums')
    expect(tabs.join(' ')).not.toContain('Movies') // none present

    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    expect(window.location.hash).toBe('#/medium/album')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
    expect(document.querySelector('.cover-title').textContent).toBe('Abbey Road')
  })

  it('renders landing sections in the configured order', async () => {
    await loadApp(MIXED, { settings: { landing: ['podcast', 'book', 'album'] } })
    const headings = [...document.querySelectorAll('.media-heading')].map(h => h.textContent.trim())
    expect(headings[0]).toContain('Podcasts')
    expect(headings[1]).toContain('Books')
    expect(headings[2]).toContain('Albums')
    expect(document.querySelectorAll('.cover-tile').length).toBe(5)
  })

  it('skips sections for media hidden from the landing config', async () => {
    await loadApp(MIXED, { settings: { landing: ['book'] } })
    const headings = [...document.querySelectorAll('.media-heading')]
    expect(headings).toHaveLength(0) // single visible medium renders as a flat wall
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
  })

  it('adds an album via iTunes lookup', async () => {
    await loadApp(MIXED)
    document.querySelector('[data-action="add-book"]').click()
    document.getElementById('add-medium').value = 'album'
    document.getElementById('add-medium').dispatchEvent(new Event('change', { bubbles: true }))
    document.getElementById('add-title').value = 'abbey road'
    document.querySelector('[data-action="lookup-media"]').click()

    await vi.waitFor(() => {
      if (!document.querySelector('.lookup-result')) throw new Error('no results yet')
    })
    document.querySelector('.lookup-result').click()
    expect(document.getElementById('add-title').value).toBe('Abbey Road')
    expect(document.getElementById('add-author').value).toBe('The Beatles')
  })

  it('walks the cover fallback chain: local, then Open Library ISBN, then placeholder', async () => {
    const withIsbn = [{ ...BOOKS[1], isbn: '9780441172719' }]
    await loadApp(withIsbn)
    const img = document.querySelector('.cover-img')
    expect(img.getAttribute('src')).toBe('/covers/s2-dune.jpg')
    window.__nextCover(img)
    expect(img.getAttribute('src')).toContain('covers.openlibrary.org/b/isbn/9780441172719')
    window.__nextCover(img)
    expect(img.getAttribute('src')).toContain('data:image/svg+xml')
  })

  it('draws the placeholder in the item\'s spine colours with its creator, title and year', async () => {
    await loadApp([{ ...BOOKS[1] }, { ...BOOKS[0] }])
    const placeholderOf = id => {
      const img = [...document.querySelectorAll('.cover-tile')].find(t => t.dataset.id === id).querySelector('.cover-img')
      const last = img.dataset.fallbacks.split('\n').at(-1)
      const svg = decodeURIComponent(last.replace('data:image/svg+xml;charset=utf-8,', ''))
      return new DOMParser().parseFromString(svg, 'image/svg+xml')
    }
    for (const [id, words] of [['s2-dune', ['FRANK HERBERT', 'DUNE', '1965']], ['s1-flow', ['MIHALY CSIKSZENTMIHALYI', 'FLOW']]]) {
      const doc = placeholderOf(id)
      const { bg, fg } = spinePalette(id)
      expect(doc.querySelector('rect').getAttribute('fill')).toBe(bg)
      const texts = [...doc.querySelectorAll('text')]
      expect(texts.every(t => t.getAttribute('fill') === fg)).toBe(true)
      for (const word of words) expect(texts.map(t => t.textContent).join(' ')).toContain(word)
    }
    expect(placeholderOf('s2-dune').documentElement.outerHTML).toBe(placeholderOf('s2-dune').documentElement.outerHTML)
  })

  it('keeps the landing media headings working after the results re-render', async () => {
    await loadApp(MIXED)
    const search = document.querySelector('[data-action="search"]')
    search.value = 'd'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    search.value = ''
    search.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('[data-medium-link="book"]').click()
    expect(window.location.hash).toBe('#/medium/book')
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
  })

  it('saves landing settings from the Shelf Settings modal', async () => {
    await loadApp(MIXED)
    document.querySelector('[data-action="shelf-settings"]').click()
    document.querySelector('.settings-row[data-medium="book"] [data-action="toggle-medium"]').click()
    document.querySelector('[data-action="save-settings"]').click()

    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
    const put = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/settings') && o?.method === 'PUT')
    expect(JSON.parse(put[1].body).landing).not.toContain('book')
  })

  it('puts the media links in the masthead and filters in a toolbar', async () => {
    await loadApp(MIXED)
    expect(document.querySelector('.masthead-title .media-tabs')).not.toBeNull()
    expect(document.querySelector('.toolbar [data-action="tag"]')).not.toBeNull()
    expect(document.querySelector('.toolbar [data-action="sort"]')).not.toBeNull()
    expect(document.querySelector('.header .toolbar [data-action="reset"]')).not.toBeNull()
    expect(document.querySelector('.masthead-actions [data-action="search"]')).not.toBeNull()
  })

  it('marks the active media tab and view for assistive tech', async () => {
    await loadApp(MIXED)
    expect(document.querySelector('nav.media-tabs[aria-label="Media"]')).not.toBeNull()
    const current = [...document.querySelectorAll('.media-tab[aria-current="true"]')]
    expect(current).toHaveLength(1)
    expect(current[0].dataset.medium).toBe('')
    expect(document.querySelectorAll('.media-tab:not([aria-current])').length)
      .toBe(document.querySelectorAll('.media-tab').length - 1)
    expect(document.querySelector('.view-btn[data-view="covers"]').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.view-btn[data-view="list"]').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('shelf view', () => {
  const READING_BOOKS = BOOKS.map(b => ({ ...b, tags: b.id === 's1-flow' ? ['psychology', 'currently-reading'] : [...b.tags] }))
  const caption = () => document.querySelector('.shelf-caption-title')?.textContent

  it('lands on the shelf by default, without the toolbar or status bar', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    expect(document.querySelector('.shelf-view')).not.toBeNull()
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
    expect(document.querySelector('.toolbar')).toBeNull()
    expect(document.querySelector('.status-bar')).toBeNull()
  })

  it('shows the showcase groups in the rail', async () => {
    await loadApp(READING_BOOKS, { view: 'shelf' })
    const tabs = [...document.querySelectorAll('[data-shelf-group]')].map(t => t.dataset.shelfGroup)
    expect(tabs).toEqual(['reading', 'favorites'])
    expect(caption()).toBe('Flow')
  })

  it('switches groups from the rail', async () => {
    await loadApp(READING_BOOKS, { view: 'shelf' })
    document.querySelector('[data-shelf-group="favorites"]').click()
    expect(caption()).toBe('Dune')
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
  })

  it('shows an empty shelf for an empty library', async () => {
    await loadApp([], { view: 'shelf' })
    expect(document.querySelector('.shelf-empty').textContent).toContain('Nothing on this shelf yet.')
  })

  it('keeps the shelf for a medium route, bypassing the landing config', async () => {
    await loadApp(MIXED, { view: 'shelf', settings: { landing: ['book'] } })
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    expect(document.querySelector('.shelf-view')).not.toBeNull()
    expect(caption()).toBe('Abbey Road')
  })

  it('an author route on the shelf switches to covers', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    window.location.hash = '#/author/herbert'
    window.dispatchEvent(new Event('hashchange'))
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('covers')
    expect(document.querySelector('.cover-title').textContent).toBe('Dune')
  })

  // Re-reads the library the way a confirmed import does
  async function refreshViaImport() {
    document.querySelector('[data-action="import"]').click()
    await window.__loadImportText('Title,Author,My Rating\nDune,Frank Herbert,5')
    document.querySelector('[data-action="confirm-import"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
  }

  it('starts a fallback group at its first item', async () => {
    const library = BOOKS.map(b => ({ ...b, rating: 5, tags: b.id === 's2-dune' ? [...b.tags] : [...b.tags, 'currently-reading'] }))
    await loadApp(library, { view: 'shelf' })
    document.querySelector('[data-shelf-step="1"]').click()
    expect(caption()).toBe('The Design of Everyday Things')

    library.forEach(b => { b.tags = b.tags.filter(t => t !== 'currently-reading') })
    await refreshViaImport()
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
    expect(caption()).toBe('Dune')
  })

  const activeView = () => document.querySelector('.view-btn.active').dataset.view
  it('typing a search on the shelf switches to covers and keeps typing in the search box', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    document.querySelector('[data-action="search"]').focus()
    typeInSearch('du')
    expect(activeView()).toBe('covers')
    expect(document.activeElement.dataset.action).toBe('search')
    expect(document.activeElement.value).toBe('du')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
  })

  it('a number-key tag filter on the shelf switches to covers', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    press('1')
    expect(activeView()).toBe('covers')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
  })

  it('switching to the shelf clears the search and tag but keeps the medium', async () => {
    await loadApp(MIXED)
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    const input = document.querySelector('[data-action="search"]')
    input.value = 'abbey'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector('[data-view="shelf"]').click()

    expect(document.querySelector('[data-action="search"]').value).toBe('')
    expect(window.location.hash).toBe('#/medium/album')
    expect(caption()).toBe('Abbey Road')
  })

  it('clearing the search keeps you in covers', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    document.querySelector('[data-action="search"]').focus()
    typeInSearch('du')
    document.querySelector('[data-action="clear-search"]').click()
    expect(activeView()).toBe('covers')
  })

  it('Escape on the shelf clears a medium route and stays on the shelf', async () => {
    await loadApp(MIXED, { view: 'shelf' })
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    press('Escape')
    expect(window.location.hash).toBe('')
    expect(activeView()).toBe('shelf')
  })

  it('a medium change by hash starts the new medium at its first item', async () => {
    const favorites = [
      ['alpha', 'Alpha', 'album'],
      ['bravo', 'Bravo', 'album'],
      ['charlie', 'Charlie', 'podcast'],
      ['delta', 'Delta', 'podcast'],
    ].map(([id, title, medium]) => ({ ...MIXED[0], id, title, tags: [], rating: 5, medium }))
    await loadApp(favorites, { view: 'shelf' })
    window.location.hash = '#/medium/album'
    window.dispatchEvent(new Event('hashchange'))
    document.querySelector('[data-shelf-step="1"]').click()
    expect(caption()).toBe('Bravo')

    window.location.hash = '#/medium/podcast'
    window.dispatchEvent(new Event('hashchange'))

    expect(caption()).toBe('Charlie')
  })

  describe('leaving a medium', () => {
    const PODCAST_FAVORITES = [
      ['alpha', 'Alpha', 'album'],
      ['bravo', 'Bravo', 'album'],
      ['charlie', 'Charlie', 'podcast'],
      ['delta', 'Delta', 'podcast'],
    ].map(([id, title, medium]) => ({ ...MIXED[0], id, title, author: 'Some Author', tags: [], rating: 5, medium }))

    const leavingMedium = {
      'Escape': () => press('Escape'),
      'Back to an empty hash': () => {
        window.location.hash = ''
        window.dispatchEvent(new Event('hashchange'))
      },
      'Home': () => document.querySelector('[data-action="home"]').click(),
      'an author route, then the Shelf button': () => {
        window.location.hash = '#/author/some-author'
        window.dispatchEvent(new Event('hashchange'))
        document.querySelector('[data-view="shelf"]').click()
      },
    }

    it.each(Object.entries(leavingMedium))('starts the unfiltered shelf at its first item after %s', async (_name, leave) => {
      await loadApp(PODCAST_FAVORITES, { view: 'shelf' })
      window.location.hash = '#/medium/podcast'
      window.dispatchEvent(new Event('hashchange'))
      document.querySelector('[data-shelf-step="1"]').click()
      expect(caption()).toBe('Delta')

      leave()

      expect(document.querySelector('.shelf-view')).not.toBeNull()
      expect(caption()).toBe('Alpha')
    })
  })

  it('the Shelf button clears a route and tag set in covers', async () => {
    await loadApp(READING_BOOKS, { view: 'covers' })
    window.location.hash = '#/author/herbert'
    window.dispatchEvent(new Event('hashchange'))
    press('1')

    document.querySelector('[data-view="shelf"]').click()

    expect(window.location.hash).toBe('')
    expect(document.querySelector('.shelf-view')).not.toBeNull()
    expect([...document.querySelectorAll('[data-shelf-group]')].map(t => t.dataset.shelfGroup)).toEqual(['reading', 'favorites'])
    document.querySelector('[data-view="covers"]').click()
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
  })

  it('waits for an IME composition to end before leaving the shelf', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    const input = document.querySelector('[data-action="search"]')
    input.focus()
    input.value = 'du'
    const composing = new Event('input', { bubbles: true })
    Object.assign(composing, { isComposing: true })
    input.dispatchEvent(composing)
    expect(activeView()).toBe('shelf')
    expect(document.querySelector('[data-action="search"]')).toBe(input)

    input.dispatchEvent(new Event('compositionend', { bubbles: true }))

    expect(activeView()).toBe('covers')
    expect(document.activeElement.dataset.action).toBe('search')
    expect(document.activeElement.value).toBe('du')
  })

  it('takes the search from the box when a composition ends before its last input event', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    const input = document.querySelector('[data-action="search"]')
    input.focus()
    input.value = 'du'
    input.dispatchEvent(new Event('compositionend', { bubbles: true }))
    expect(activeView()).toBe('covers')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
  })

  it('stays on the shelf when a composition is cancelled', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    const input = document.querySelector('[data-action="search"]')
    input.focus()
    input.value = ''
    input.dispatchEvent(new Event('compositionend', { bubbles: true }))
    expect(activeView()).toBe('shelf')
  })

  it('leaves focus alone when a composition ends because the box lost focus', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    const input = document.querySelector('[data-action="search"]')
    input.value = 'du'
    input.dispatchEvent(new Event('compositionend', { bubbles: true }))
    expect(activeView()).toBe('covers')
    expect(document.activeElement.dataset.action).not.toBe('search')
  })

  it('ignores keys pressed while an IME is composing', async () => {
    await loadApp(MIXED, { view: 'shelf' })
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    const escape = Object.assign(new Event('keydown', { bubbles: true }), { key: 'Escape', isComposing: true })
    document.dispatchEvent(escape)
    expect(window.location.hash).toBe('#/medium/album')
  })

  const TWO_READING = BOOKS.map(b => ({ ...b, tags: b.id === 's1-flow' || b.id === 's2-dune' ? [...b.tags, 'currently-reading'] : [...b.tags] }))

  it('left and right move the shelf, stopping at the ends of a short group', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    expect(caption()).toBe('Dune')
    press('ArrowRight')
    expect(caption()).toBe('Flow')
    press('ArrowRight')
    expect(caption()).toBe('Flow')
    press('ArrowLeft')
    expect(caption()).toBe('Dune')
  })

  it('Enter opens the centred item', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('ArrowRight')
    press('Enter')
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
  })

  it('Enter on a focused rail tab does not open the centred item', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    document.querySelector('[data-shelf-group="favorites"]').focus()
    press('Enter')
    expect(document.querySelector('[data-field="title"]')).toBeNull()
  })

  it('pressing the active rail tab again keeps the place on the shelf', async () => {
    const library = BOOKS.map(b => ({ ...b, rating: 5, tags: b.id === 's2-dune' ? [...b.tags] : [...b.tags, 'currently-reading'] }))
    await loadApp(library, { view: 'shelf' })
    const favorites = () => document.querySelector('[data-shelf-group="favorites"]')
    favorites().click()
    press('ArrowRight')
    press('ArrowRight')
    const placed = caption()
    expect(placed).not.toBe(library.map(b => b.title).sort()[0])
    favorites().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    expect(caption()).toBe(placed)
  })

  it('leaves one shelf listening to the window across module reloads', async () => {
    const listening = new Set()
    const add = window.addEventListener
    const remove = window.removeEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation(function (type, fn, opts) {
      if (type === 'pointermove') listening.add(fn)
      return add.call(this, type, fn, opts)
    })
    vi.spyOn(window, 'removeEventListener').mockImplementation(function (type, fn, opts) {
      if (type === 'pointermove') listening.delete(fn)
      return remove.call(this, type, fn, opts)
    })
    try {
      await loadApp(BOOKS, { view: 'shelf' })
      await loadApp(BOOKS, { view: 'shelf' })
      expect(listening.size).toBe(1)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('keeps focus on a rail tab chosen from the keyboard', async () => {
    await loadApp(READING_BOOKS, { view: 'shelf' })
    document.querySelector('[data-shelf-group="favorites"]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
    expect(document.activeElement?.dataset.shelfGroup).toBe('favorites')
  })

  // Holds every PUT until the returned release() is called
  function holdSaves() {
    const respond = fetch.getMockImplementation()
    let release
    const gate = new Promise(r => { release = r })
    fetch.mockImplementation(async (url, opts = {}) => {
      if (opts.method === 'PUT') await gate
      return respond(url, opts)
    })
    return () => release()
  }

  const saved = () => vi.waitFor(() => {
    if (document.querySelector('.toast')?.textContent !== 'Saved') throw new Error('save not settled yet')
  })

  it('keeps the rail working when a save finishes after the detail closes', async () => {
    await loadApp(READING_BOOKS, { view: 'shelf' })
    const release = holdSaves()
    press('Enter')
    const author = document.querySelector('[data-field="author"]')
    author.value = 'M. Csikszentmihalyi'
    author.dispatchEvent(new Event('blur'))
    document.querySelector('[data-action="close-detail"]').click()
    release()
    await saved()
    document.querySelector('[data-shelf-group="favorites"]').click()
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
    expect(caption()).toBe('Dune')
  })

  it('keeps the empty shelf\'s Add Media working when a save finishes after the detail closes', async () => {
    // Nothing on the landing shelf, while the list still shows every item
    await loadApp(BOOKS, { view: 'list', settings: { landing: ['album'] } })
    const release = holdSaves()
    document.querySelector('.list-title [data-id="s2-dune"]').click()
    const author = document.querySelector('[data-field="author"]')
    author.value = 'F. Herbert'
    author.dispatchEvent(new Event('blur'))
    document.querySelector('[data-action="close-detail"]').click()
    document.querySelector('[data-view="shelf"]').click()
    release()
    await saved()
    const add = document.querySelector('.shelf-empty [data-action="add-book"]')
    expect(add).not.toBeNull()
    add.click()
    expect(document.querySelector('.modal-panel h2')?.textContent).toBe('Add Media')
  })

  it('a mouse click on the active rail tab still lets Enter open the centred item', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    const active = document.querySelector('.shelf-tab.active')
    active.focus()
    active.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    press('Enter')
    expect(document.querySelector('[data-field="title"]')).not.toBeNull()
  })

  it('steps through the shelf group from the detail and re-centres the shelf on close', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    expect(document.querySelector('[data-field="title"]').value).toBe('Dune')
    press('ArrowRight')
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
    press('ArrowRight')
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
    press('Escape')
    expect(document.querySelector('.detail')).toBeNull()
    expect(caption()).toBe('Flow')
  })

  describe('closing a detail opened from the shelf', () => {
    const original = Element.prototype.animate
    afterEach(() => {
      if (original) Element.prototype.animate = original
      else delete Element.prototype.animate
    })

    it('returns focus to the shelf\'s open button', async () => {
      await loadApp(TWO_READING, { view: 'shelf' })
      press('Enter')
      press('Escape')
      expect(document.activeElement?.classList.contains('shelf-open')).toBe(true)
    })

    it('lets Enter on that button open the detail again, once', async () => {
      await loadApp(TWO_READING, { view: 'shelf' })
      press('Enter')
      press('Escape')
      Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null }))
      const button = document.querySelector('.shelf-open')
      expect(document.activeElement).toBe(button)
      // A browser presses a focused button for Enter after the keydown has gone by
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
      expect(document.querySelector('[data-field="title"]').value).toBe('Dune')
      const entrances = Element.prototype.animate.mock.contexts.filter(el => el.classList.contains('detail'))
      expect(entrances).toHaveLength(1)
    })
  })

  it('stays on the shelf when the hash changes to the item already open', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    expect(window.location.hash).toBe('#/title/dune')
    window.dispatchEvent(new Event('hashchange'))
    expect(activeView()).toBe('shelf')
    expect(document.querySelector('[data-field="title"]').value).toBe('Dune')
  })

  it('slash does nothing while the detail is open', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    press('/')
    expect(document.activeElement?.dataset.action).not.toBe('search')
    expect(activeView()).toBe('shelf')
  })

  it('keeps the Enter that opens the centred item from reaching the focused Close button', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    document.dispatchEvent(enter)
    expect(document.querySelector('.detail')).not.toBeNull()
    expect(enter.defaultPrevented).toBe(true)
  })

  it('leaves Enter on a focused rail tab to the tab', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    document.querySelector('[data-shelf-group="favorites"]').focus()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    document.dispatchEvent(enter)
    expect(document.querySelector('.detail')).toBeNull()
    expect(enter.defaultPrevented).toBe(false)
  })

  it('does not step when the open item has left the group it was opened from', async () => {
    const FAVORITES = BOOKS.map(b => ({ ...b, tags: [...b.tags], rating: b.id === 's1-flow' ? 5 : b.rating }))
    await loadApp(FAVORITES, { view: 'shelf' })
    expect(caption()).toBe('Dune')
    press('Enter')
    document.querySelector('[data-action="set-rating"][data-rating="4"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.detail .rating-value')?.textContent !== '4') throw new Error('rating not shown yet')
    })
    press('ArrowRight')
    expect(document.querySelector('[data-field="title"]').value).toBe('Dune')
  })

  it('re-centres on the item before one removed after its edit moved it to the end of its group', async () => {
    const ALL_READING = BOOKS.map(b => ({ ...b, tags: [...b.tags, 'currently-reading'] }))
    await loadApp(ALL_READING, { view: 'shelf' })
    expect(caption()).toBe('Dune')
    press('Enter')
    // Flush happy-dom's queued hashchange for the opened item before its title stops matching the hash
    await new Promise(r => setTimeout(r, 0))
    const title = document.querySelector('[data-field="title"]')
    title.value = 'Zen'
    title.dispatchEvent(new Event('blur'))
    await vi.waitFor(() => {
      if (caption() !== 'Flow') throw new Error('rename not applied yet')
    })
    document.querySelector('[data-action="delete-book"]').click()
    document.querySelector('[data-action="confirm-ok"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.detail')) throw new Error('detail still open')
    })
    expect(caption()).toBe('The Design of Everyday Things')
  })

  it('re-centres on the next item after removing one opened from the shelf', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    document.querySelector('[data-action="delete-book"]').click()
    document.querySelector('[data-action="confirm-ok"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.detail')) throw new Error('detail still open')
    })
    expect(caption()).toBe('Flow')
  })

  it('v cycles shelf, covers and list', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    press('v')
    expect(activeView()).toBe('covers')
    press('v')
    expect(activeView()).toBe('list')
    press('v')
    expect(activeView()).toBe('shelf')
  })

  it('s, e, up and down do nothing on the shelf', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    for (const key of ['ArrowUp', 'ArrowDown', 's', 'e']) press(key)
    expect(activeView()).toBe('shelf')
    expect(caption()).toBe('Dune')
    expect(document.querySelector('[data-field="title"]')).toBeNull()
    document.querySelector('[data-view="covers"]').click()
    expect(document.querySelector('.status-bar').textContent).toContain('TITLE ↑') // s did not cycle the sort
  })

  it.each(['metaKey', 'ctrlKey'])('%s with v leaves the view and tag alone', async (modifier) => {
    await loadApp(READING_BOOKS, { view: 'list' })
    press('1')
    const hash = window.location.hash
    const rows = document.querySelectorAll('.list-row').length
    expect(hash).not.toBe('')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', [modifier]: true, bubbles: true }))
    expect(activeView()).toBe('list')
    expect(window.location.hash).toBe(hash)
    expect(document.querySelectorAll('.list-row').length).toBe(rows)
  })

  it('alt with left leaves the browser its Back shortcut', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('ArrowRight')
    const back = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(back)
    expect(back.defaultPrevented).toBe(false)
    expect(caption()).toBe('Flow')
  })

  it('the help overlay describes the view cycle', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    press('?')
    expect(document.querySelector('.help-overlay').textContent).toContain('cycle Shelf / Covers / List')
  })

  describe('covers', () => {
    // Stands in for the network: width(url) > 0 loads at that width, 0 fails
    let width
    let requested
    const duneCover = () => document.querySelector('.tape[data-id="s2-dune"] .tape-cover')
    const dune = patch => BOOKS.map(b => ({ ...b, tags: [...b.tags], ...(b.id === 's2-dune' ? patch : {}) }))
    const flush = () => new Promise(r => setTimeout(r, 0))

    beforeEach(() => {
      width = () => 0
      requested = []
      vi.stubGlobal('Image', class {
        set src(url) {
          requested.push(url)
          queueMicrotask(() => {
            const w = width(url)
            if (w) { this.naturalWidth = w; this.onload?.() } else this.onerror?.()
          })
        }
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('shows the first candidate that loads', async () => {
      width = url => url.startsWith('https://') ? 100 : 0
      await loadApp(dune({ coverUrl: 'https://covers.example/dune.jpg', isbn: '9780441013593' }), { view: 'shelf' })
      await vi.waitFor(() => expect(duneCover().classList.contains('has-image')).toBe(true))
      expect(duneCover().style.backgroundImage).toBe('url("https://covers.example/dune.jpg")')
    })

    it('skips a candidate that loads as a 1x1 image', async () => {
      width = url => url.startsWith('https://covers.example') ? 1 : url.includes('openlibrary') ? 100 : 0
      await loadApp(dune({ coverUrl: 'https://covers.example/dune.jpg', isbn: '9780441013593' }), { view: 'shelf' })
      await vi.waitFor(() => expect(duneCover().classList.contains('has-image')).toBe(true))
      expect(duneCover().style.backgroundImage).toBe('url("https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg?default=false")')
    })

    it('keeps the typographic face when nothing loads, without probing the placeholder', async () => {
      await loadApp(dune({ coverUrl: 'https://covers.example/dune.jpg', isbn: '9780441013593' }), { view: 'shelf' })
      await vi.waitFor(() => expect(requested).toHaveLength(3))
      await flush()
      expect(duneCover().classList.contains('has-image')).toBe(false)
      expect(requested.some(u => u.startsWith('data:'))).toBe(false)
    })

    it('shows a cover that a refresh newly makes available', async () => {
      const library = dune({})
      width = url => url.includes('openlibrary') ? 100 : 0
      await loadApp(library, { view: 'shelf' })
      await vi.waitFor(() => expect(requested).toEqual(['/covers/s2-dune.jpg']))
      await flush()

      library.find(b => b.id === 's2-dune').isbn = '9780441013593'
      await refreshViaImport()
      await vi.waitFor(() => expect(duneCover().classList.contains('has-image')).toBe(true))
      expect(duneCover().style.backgroundImage).toBe('url("https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg?default=false")')
    })
  })
})

describe('cover picker manual URL', () => {
  it('saves a pasted image URL as the cover', async () => {
    await loadApp()
    document.querySelector('[data-id="s2-dune"]').click()
    document.querySelector('[data-action="open-cover-picker"]').click()

    await vi.waitFor(() => {
      if (!document.getElementById('cover-url-input')) throw new Error('picker not open')
    })
    document.getElementById('cover-url-input').value = 'https://example.com/my-rare-cover.jpg'
    document.querySelector('[data-action="use-cover-url"]').click()

    await vi.waitFor(() => {
      if (document.querySelector('.cover-picker-panel')) throw new Error('picker open')
    })
    const patch = fetch.mock.calls.find(([u, o]) => String(u).includes('/cover') && o?.method === 'PATCH')
    expect(JSON.parse(patch[1].body).coverUrl).toBe('https://example.com/my-rare-cover.jpg')
  })
})

describe('shelf identity', () => {
  it('shows a configured shelf name in the masthead and document title', async () => {
    await loadApp(BOOKS, { settings: { landing: ['book'], shelfName: "Mary Steiner's Shelf" } })
    expect(document.querySelector('.masthead-title h1').textContent).toBe("Mary Steiner's Shelf")
    expect(document.title).toBe("Mary Steiner's Shelf")
  })

  it('tucks input actions behind the avatar menu', async () => {
    await loadApp()
    const avatar = document.querySelector('[data-action="avatar-menu"]')
    expect(avatar).not.toBeNull()
    expect(avatar.textContent.trim()).toBe('S')
    expect(document.querySelector('.avatar-dropdown.open')).toBeNull()
    avatar.click()
    expect(document.querySelector('.avatar-dropdown.open')).not.toBeNull()
    const items = [...document.querySelectorAll('.avatar-dropdown button')].map(b => b.textContent.trim())
    expect(items).toContain('Add Media')
    expect(items).toContain('Import')
    expect(items).toContain('Shelf Settings')
  })

  it('saves the shelf name from Shelf Settings', async () => {
    await loadApp()
    document.querySelector('[data-action="shelf-settings"]').click()
    document.getElementById('settings-name').value = "Jason's Shelf"
    document.querySelector('[data-action="save-settings"]').click()

    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
    const put = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/settings') && o?.method === 'PUT')
    expect(JSON.parse(put[1].body).shelfName).toBe("Jason's Shelf")
    expect(document.querySelector('.masthead-title h1').textContent).toBe("Jason's Shelf")
  })
})

describe('quick add', () => {
  beforeEach(() => loadApp())

  const enter = (input, title) => {
    input.value = title
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  it('appends pending items from the list-view quick row without re-rendering', async () => {
    document.querySelector('[data-view="list"]').click()
    const input = document.querySelector('[data-action="quick-add"]')
    enter(input, 'Snow Crash')
    enter(input, 'Mystery Item')

    expect(document.querySelectorAll('.quick-pending').length).toBe(2)
    expect(document.querySelector('[data-action="resolve-quick"]').textContent).toContain('2')
    expect(document.querySelector('[data-action="quick-add"]')).toBe(input)
    expect(input.value).toBe('')
  })

  it('keeps the quick row working after the results re-render', async () => {
    document.querySelector('[data-view="list"]').click()
    const search = document.querySelector('[data-action="search"]')
    search.value = 'd'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    search.value = ''
    search.dispatchEvent(new Event('input', { bubbles: true }))
    enter(document.querySelector('[data-action="quick-add"]'), 'Snow Crash')
    expect(document.querySelectorAll('.quick-pending').length).toBe(1)
    document.querySelector('[data-action="resolve-quick"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.quick-pending')) throw new Error('still pending')
    })
    expect(fetch.mock.calls.some(([u, o]) => String(u).endsWith('/api/books') && o?.method === 'POST')).toBe(true)
  })

  it('resolves pending items via lookup and keeps misses as typed', async () => {
    document.querySelector('[data-view="list"]').click()
    const input = document.querySelector('[data-action="quick-add"]')
    enter(input, 'Snow Crash')
    enter(input, 'Mystery Item')
    document.querySelector('[data-action="resolve-quick"]').click()

    await vi.waitFor(() => {
      if (document.querySelector('.quick-pending')) throw new Error('still pending')
    })
    const posts = fetch.mock.calls.filter(([u, o]) => String(u).endsWith('/api/books') && o?.method === 'POST')
    expect(posts).toHaveLength(2)
    const bodies = posts.map(([, o]) => JSON.parse(o.body))
    expect(bodies[0].author).toBe('Neal Stephenson')
    expect(bodies[0].isbn).toBe('9780553380958')
    expect(bodies[1].title).toBe('Mystery Item')
    expect(bodies[1].author).toBeUndefined()
  })
})

describe('chunked import', () => {
  it('sends large imports in chunks and sums the preview', async () => {
    await loadApp()
    document.querySelector('[data-action="import"]').click()
    const rows = Array.from({ length: 600 }, (_, i) => `Book ${i},Author ${i}`).join('\n')
    await window.__loadImportText('Title,Author\n' + rows)

    const dryRuns = fetch.mock.calls.filter(([u, o]) =>
      String(u).endsWith('/api/import') && o?.method === 'POST' && JSON.parse(o.body).dryRun)
    expect(dryRuns).toHaveLength(3)
    expect(JSON.parse(dryRuns[0][1].body).books).toHaveLength(250)
    expect(document.querySelector('.import-preview').textContent).toContain('3 new')
  })
})

describe('login flow', () => {
  it('locked session hides editing and offers Log In', async () => {
    await loadApp(BOOKS, { session: { authRequired: true, writable: false } })
    expect(document.querySelector('[data-action="add-book"]')).toBeNull()
    expect(document.querySelector('[data-action="login"]')).not.toBeNull()
  })

  it('logging in unlocks editing and offers Log Out', async () => {
    await loadApp(BOOKS, { session: { authRequired: true, writable: false } })
    document.querySelector('[data-action="login"]').click()
    document.getElementById('login-password').value = 'sekrit'
    document.querySelector('[data-action="submit-login"]').click()

    await vi.waitFor(() => {
      if (!document.querySelector('[data-action="add-book"]')) throw new Error('still locked')
    })
    expect(document.querySelector('[data-action="login"]')).toBeNull()
    expect(document.querySelector('[data-action="logout"]')).not.toBeNull()
  })

  it('shows an error for a wrong password', async () => {
    await loadApp(BOOKS, { session: { authRequired: true, writable: false } })
    document.querySelector('[data-action="login"]').click()
    document.getElementById('login-password').value = 'nope'
    document.querySelector('[data-action="submit-login"]').click()

    await vi.waitFor(() => {
      if (!document.querySelector('.status.error')) throw new Error('no error yet')
    })
    expect(document.querySelector('[data-action="add-book"]')).toBeNull()
  })

  it('writable session without password shows no auth buttons', async () => {
    await loadApp()
    expect(document.querySelector('[data-action="login"]')).toBeNull()
    expect(document.querySelector('[data-action="logout"]')).toBeNull()
    expect(document.querySelector('[data-action="add-book"]')).not.toBeNull()
  })
})

describe('hash routes', () => {
  const goTo = (hash) => {
    window.location.hash = hash
    window.dispatchEvent(new Event('hashchange'))
  }

  it('filters the wall by author route with fuzzy matching', async () => {
    await loadApp()
    goTo('#/author/herbert')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
    expect(document.querySelector('.cover-title').textContent).toBe('Dune')
    expect(document.querySelector('.status-bar').textContent).toContain('author')
    expect(window.location.hash).toBe('#/author/frank-herbert') // canonicalized
  })

  it('applies a route present at load time', async () => {
    window.location.hash = '#/tags/design'
    document.body.innerHTML = '<div id="app"></div>'
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      if (String(url).endsWith('/api/books') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, json: async () => ({ books: BOOKS.map(b => ({ ...b, tags: [...b.tags] })) }) }
      }
      throw new Error('unexpected fetch: ' + url)
    }))
    vi.resetModules()
    await import('./main.js')
    await vi.waitFor(() => {
      if (!document.querySelector('.header')) throw new Error('app not rendered yet')
    })
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
    expect(document.querySelector('.cover-title').textContent).toBe('The Design of Everyday Things')
  })

  it('opens the detail for a single-title route', async () => {
    await loadApp()
    goTo('#/title/dune')
    expect(document.querySelector('.detail-title').value).toBe('Dune')
  })

  it('sets a book hash when opening from the wall and clears it on close', async () => {
    await loadApp()
    document.querySelector('[data-id="s2-dune"]').click()
    expect(window.location.hash).toBe('#/title/dune')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(window.location.hash).toBe('')
  })

  it('applies a typed route that resolves like the one showing', async () => {
    await loadApp()
    goTo('#/author/herbert')
    await new Promise(r => setTimeout(r, 0))
    expect(window.location.hash).toBe('#/author/frank-herbert')
    const input = document.querySelector('[data-action="search"]')
    input.value = 'du'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    goTo('#/author/herbert')
    expect(document.querySelector('[data-action="search"]').value).toBe('')
    expect(window.location.hash).toBe('#/author/frank-herbert')
  })

  describe('closing puts back the route the item was opened from', () => {
    // happy-dom queues a hashchange for replaceState, which a browser never sends
    const flush = () => new Promise(r => setTimeout(r, 0))
    const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    const enter = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    const caption = () => document.querySelector('.shelf-caption-title')?.textContent

    const TWO_ALBUMS = [...MIXED, { ...MIXED[3], id: 'blue', title: 'Blue', author: 'Joni Mitchell', coverUrl: null }]

    async function openOnAlbumShelf(library = MIXED) {
      await loadApp(library, { view: 'shelf' })
      document.querySelector('.media-tab[data-medium="album"]').click()
      await flush()
      enter()
      expect(document.querySelector('[data-field="title"]').value).toBe('Abbey Road')
      expect(window.location.hash).toBe('#/title/abbey-road')
      await flush()
    }

    it('from a medium shelf', async () => {
      await openOnAlbumShelf()
      escape()
      expect(window.location.hash).toBe('#/medium/album')
      await flush()
      expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
      expect(caption()).toBe('Abbey Road')
      expect(document.activeElement?.classList.contains('shelf-open')).toBe(true)
    })

    it('after removing the open item', async () => {
      await openOnAlbumShelf(TWO_ALBUMS)
      document.querySelector('[data-action="delete-book"]').click()
      document.querySelector('[data-action="confirm-ok"]').click()
      await vi.waitFor(() => {
        if (document.querySelector('.detail')) throw new Error('detail still open')
      })
      expect(window.location.hash).toBe('#/medium/album')
      await flush()
      expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
      expect(caption()).toBe('Blue')
    })

    it('unless removing the open item leaves that route with nothing to show', async () => {
      await openOnAlbumShelf()
      document.querySelector('[data-action="delete-book"]').click()
      document.querySelector('[data-action="confirm-ok"]').click()
      await vi.waitFor(() => {
        if (document.querySelector('.detail')) throw new Error('detail still open')
      })
      expect(window.location.hash).toBe('')
      await flush()
      expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
      expect(document.querySelector('.shelf-empty')).toBeNull()
      expect(document.querySelector('.media-tab.active').dataset.medium).toBe('')
    })

    it('from an author route in covers, after stepping', async () => {
      const library = BOOKS.map(b => ({ ...b, tags: [...b.tags], author: b.id === 's1-flow' ? 'Frank Herbert' : b.author }))
      await loadApp(library)
      goTo('#/author/herbert')
      await flush()
      expect(window.location.hash).toBe('#/author/frank-herbert')
      document.querySelector('[data-id="s2-dune"]').click()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
      expect(window.location.hash).toBe('#/title/flow')
      await flush()
      escape()
      expect(window.location.hash).toBe('#/author/frank-herbert')
      await flush()
      expect(document.querySelectorAll('.cover-tile')).toHaveLength(2)
      expect(document.activeElement?.dataset.id).toBe('s1-flow')
    })

    it('to no hash after a cold deep link', async () => {
      await loadApp()
      goTo('#/title/dune')
      await flush()
      expect(document.querySelector('.detail-title').value).toBe('Dune')
      escape()
      expect(window.location.hash).toBe('')
    })
  })

  it('routes tag filters through the hash', async () => {
    await loadApp()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    expect(window.location.hash).toBe('#/tags/design')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
  })

  it('replaces a tag filter when navigating to an author route', async () => {
    await loadApp()
    goTo('#/tags/design')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
    goTo('#/author/herbert')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
    expect(document.querySelector('.cover-title').textContent).toBe('Dune')
    expect(document.querySelector('.status-bar').textContent).not.toContain('tag:')
  })

  it('clicking the masthead goes home to the shelf', async () => {
    await loadApp()
    goTo('#/author/herbert')
    const input = document.querySelector('[data-action="search"]')
    input.value = 'dune'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector('[data-action="home"]').click()

    expect(window.location.hash).toBe('')
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
    expect(document.querySelector('[data-action="search"]').value).toBe('')
  })

  it('clears the route filter on reset', async () => {
    await loadApp()
    goTo('#/author/herbert')
    document.querySelector('.header [data-action="reset"]').click()
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
    expect(window.location.hash).toBe('')
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
    document.querySelector('[data-view="covers"]').click()

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
    expect(document.querySelector('.empty-state').textContent).toContain('Nothing matches')
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

    expect(document.querySelector('.detail-title').value).toBe('Dune')
  })
})

describe('keyboard shortcuts', () => {
  beforeEach(() => loadApp())

  it('slash focuses search; typing there suspends shortcuts', () => {
    press('/')
    expect(document.activeElement.dataset.action).toBe('search')
    press('v')                                   // must NOT toggle view
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('covers')
  })

  it('arrows move the selection and Enter opens', () => {
    press('ArrowRight')
    press('ArrowRight')
    const selected = document.querySelector('.kb-selected')
    expect(selected).not.toBeNull()
    press('Enter')
    expect(document.querySelector('.detail-title').value)
      .toBe(selected.getAttribute('aria-label').split(' by ')[0])
  })

  it('keeps the Enter that opens the selected tile from reaching the focused Close button', () => {
    press('ArrowRight')
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    document.dispatchEvent(enter)
    expect(document.querySelector('.detail')).not.toBeNull()
    expect(enter.defaultPrevented).toBe(true)
  })

  it('left/right walk prev/next while the detail is open', () => {
    press('ArrowRight'); press('Enter')
    const first = document.querySelector('.detail-title').value
    press('ArrowRight')
    expect(document.querySelector('.detail-title').value).not.toBe(first)
  })

  it('v toggles view and s cycles sort at default direction', () => {
    press('v')
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('list')
    press('s')
    expect(document.querySelector('.status-bar').textContent).toContain('AUTHOR ↑')
  })

  it('Escape closes the detail, then clears the search', () => {
    press('ArrowRight'); press('Enter')
    press('Escape')
    expect(document.querySelector('.detail')).toBeNull()
    const input = document.querySelector('[data-action="search"]')
    input.focus(); input.value = 'dune'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
    press('Escape')
    expect(document.querySelector('[data-action="search"]').value).toBe('')
  })
})

describe('help overlay and tag keys', () => {
  beforeEach(() => loadApp())

  it('? opens the help overlay listing shortcuts', () => {
    press('?')
    expect(document.querySelector('.help-overlay').textContent).toContain('navigate')
    press('Escape')
    expect(document.querySelector('.help-overlay')).toBeNull()
  })

  it('number keys toggle tag filters', () => {
    press('1')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1) // first tag alphabetically
    press('1')
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
  })
})

describe('status bar', () => {
  it('renders the status bar with count and sort', async () => {
    await loadApp()
    const bar = document.querySelector('.status-bar').textContent
    expect(bar).toContain('3 BOOKS')
    expect(bar).toContain('TITLE')
  })
})

describe('goodreads import', () => {
  beforeEach(() => loadApp())

  const CSV = 'Title,Author,My Rating\nNew Book,Someone,4\nDune,Frank Herbert,0\n,Broken,1'

  it('shows a preview after loading a file', async () => {
    document.querySelector('[data-action="import"]').click()
    await window.__loadImportText(CSV)
    const preview = document.querySelector('.import-preview').textContent
    expect(preview).toContain('1 new')
    expect(preview).toContain('1 update')
    expect(preview).toContain('1 unparseable (rows 4)')
  })

  it('confirms via POST /api/import and refreshes', async () => {
    document.querySelector('[data-action="import"]').click()
    await window.__loadImportText(CSV)
    document.querySelector('[data-action="confirm-import"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
    const call = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/import') && !JSON.parse(o.body).dryRun)
    expect(JSON.parse(call[1].body).books).toHaveLength(2)
  })
})

describe('metadata sorting', () => {
  beforeEach(() => loadApp())

  it('sorts by rating descending by default with nulls last', () => {
    document.querySelector('[data-view="list"]').click()
    document.querySelector('[data-sort="rating"]').click()
    const titles = [...document.querySelectorAll('.list-title button')].map(b => b.textContent)
    expect(titles).toEqual(['Dune', 'The Design of Everyday Things', 'Flow']) // 5, 4, null last
  })

  it('re-selecting the active sort flips direction', () => {
    document.querySelector('[data-view="list"]').click()
    document.querySelector('[data-sort="title"]').click() // active, flips to desc
    const titles = [...document.querySelectorAll('.list-title button')].map(b => b.textContent)
    expect(titles[0] > titles[titles.length - 1]).toBe(true)
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
    expect(document.querySelector('.status-bar').textContent).toContain('1/3 BOOKS')
  })
})
