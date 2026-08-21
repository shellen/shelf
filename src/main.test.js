// ABOUTME: Frontend tests for the bookshelf app.
// ABOUTME: Covers initial render and search interaction behavior.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

async function loadApp(books = BOOKS, { session, settings } = {}) {
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
    throw new Error('unexpected fetch: ' + u)
  }))
  vi.resetModules()
  await import('./main.js')
  await vi.waitFor(() => {
    if (!document.querySelector('.header')) throw new Error('app not rendered yet')
  })
  // Flush happy-dom's queued hashchange task from the hash reset above
  await new Promise(r => setTimeout(r, 0))
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

describe('inline editing', () => {
  beforeEach(() => loadApp())

  const openDune = () => document.querySelector('[data-id="s2-dune"]').click()
  const field = (name) => document.querySelector(`[data-field="${name}"]`)

  it('shows editable fields prefilled in the drawer, with no edit modal path', () => {
    openDune()
    expect(field('title').value).toBe('Dune')
    expect(field('author').value).toBe('Frank Herbert')
    expect(field('tags').value).toBe('sci-fi')
    expect(field('isbn').value).toBe('')
    expect(document.querySelector('[data-action="edit-book"]')).toBeNull()
  })

  it('saves a changed field on blur via PUT without rebuilding the drawer', async () => {
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
    expect(field('author')).toBe(author)   // drawer not re-rendered out from under the user
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

  it('Escape reverts the field and keeps the drawer open', () => {
    openDune()
    const author = field('author')
    author.value = 'Wrong Name'
    author.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(field('author').value).toBe('Frank Herbert')
    expect(document.querySelector('.drawer-panel')).not.toBeNull()
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

  it('e focuses the title field for the selected book', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect(document.activeElement?.dataset.field).toBe('title')
  })
})

describe('shelf media', () => {
  it('renames the masthead to Shelf', async () => {
    await loadApp()
    expect(document.querySelector('.header-title h1').textContent).toBe('Shelf')
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
    expect(document.querySelector('.header-title h1').textContent).toBe("Mary Steiner's Shelf")
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
    expect(document.querySelector('.header-title h1').textContent).toBe("Jason's Shelf")
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

  it('opens the drawer for a single-title route', async () => {
    await loadApp()
    goTo('#/title/dune')
    expect(document.querySelector('.drawer-title').value).toBe('Dune')
  })

  it('sets a book hash when opening from the wall and clears it on close', async () => {
    await loadApp()
    document.querySelector('[data-id="s2-dune"]').click()
    expect(window.location.hash).toBe('#/title/dune')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(window.location.hash).toBe('')
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

  it('clicking the Bookshelf masthead goes home', async () => {
    await loadApp()
    goTo('#/author/herbert')
    const input = document.querySelector('[data-action="search"]')
    input.value = 'dune'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector('[data-action="home"]').click()

    expect(window.location.hash).toBe('')
    expect(document.querySelectorAll('.cover-tile').length).toBe(3)
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

    expect(document.querySelector('.drawer-title').value).toBe('Dune')
  })
})

describe('keyboard shortcuts', () => {
  beforeEach(() => loadApp())
  const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

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
    expect(document.querySelector('.drawer-title').value)
      .toBe(selected.getAttribute('aria-label').split(' by ')[0])
  })

  it('left/right walk prev/next while the drawer is open', () => {
    press('ArrowRight'); press('Enter')
    const first = document.querySelector('.drawer-title').value
    press('ArrowRight')
    expect(document.querySelector('.drawer-title').value).not.toBe(first)
  })

  it('v toggles view and s cycles sort at default direction', () => {
    press('v')
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('list')
    press('s')
    expect(document.querySelector('.status-bar').textContent).toContain('AUTHOR ↑')
  })

  it('Escape closes the drawer, then clears the search', () => {
    press('ArrowRight'); press('Enter')
    press('Escape')
    expect(document.querySelector('.drawer-panel')).toBeNull()
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
  const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

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
