import './style.css'
import embeddedBooks from 'virtual:bookshelf-data'
import { parseGoodreadsCsv } from './goodreads.js'
import { parseRoute, resolveRoute, slugify } from './routes.js'
import { esc } from './html.js'
import { showcaseGroups } from './showcase.js'
import { renderShelfView, mountShelf, TILT_DEG } from './shelf.js'
import { renderDetail, playEntrance, playExit } from './overlay.js'

// Get local cover path - files in public/covers are served at /covers/
function getLocalCoverPath(bookId) {
  return `/covers/${bookId}.jpg`
}

// API helpers
const api = {
  async getBooks() {
    const res = await fetch('/api/books')
    if (!res.ok) throw new Error('Failed to fetch books')
    const data = await res.json()
    return data.books
  },

  async createBook(book) {
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(book)
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to create book')
    }
    return res.json()
  },

  async updateBook(id, updates) {
    const res = await fetch(`/api/books/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    if (!res.ok) throw new Error('Failed to update book')
    return res.json()
  },

  async updateCover(id, coverUrl) {
    const res = await fetch(`/api/books/${id}/cover`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverUrl })
    })
    if (!res.ok) throw new Error('Failed to update cover')
    return res.json()
  },

  async deleteBook(id) {
    const res = await fetch(`/api/books/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete book')
    return true
  }
}

// Toast helper - renders into its own root so it never disturbs focus or form state
let toastTimer = null
function showToast(message, type = 'success') {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="toast toast-${type}">${esc(message)}</div>`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { root.innerHTML = '' }, 3000)
}

// Confirm dialog helper
function showConfirm(title, message) {
  return new Promise((resolve) => {
    state.confirmOpen = true
    state.confirmTitle = title
    state.confirmMessage = message
    state.confirmAction = resolve
    render()
  })
}

function answerConfirm(ok) {
  state.confirmOpen = false
  if (state.confirmAction) state.confirmAction(ok)
  state.confirmAction = null
  render()
}

// Helpers to update a book in state
function syncBookState(updatedBook) {
  const bookIndex = state.books.findIndex(b => b.id === updatedBook.id)
  if (bookIndex !== -1) {
    state.books = [
      ...state.books.slice(0, bookIndex),
      { ...updatedBook },
      ...state.books.slice(bookIndex + 1)
    ]
    if (state.selected?.id === updatedBook.id) {
      state.selected = { ...updatedBook }
    }
  }
}

function updateBookInState(updatedBook) {
  syncBookState(updatedBook)
  render()
}

function parseTags(value) {
  return value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
}

// Inline field save - commits one detail field, leaving the detail DOM alone
async function saveField(el) {
  const book = state.selected
  if (!book || state.readOnly) return
  const fieldName = el.dataset.field
  const original = el.dataset.original || ''

  if (fieldName === 'title' && !el.value.trim()) {
    el.value = original
    return
  }
  if (el.value === original) return

  const payload = fieldName === 'tags'
    ? { tags: parseTags(el.value) }
    : { [fieldName]: el.value.trim() || null }

  try {
    const updated = await api.updateBook(book.id, payload)
    const canonical = fieldName === 'tags' ? (updated.tags || []).join(', ') : String(updated[fieldName] ?? '')
    el.value = canonical
    el.dataset.original = canonical
    syncBookState(updated)
    updateResults()
    showToast('Saved')
  } catch (e) {
    el.value = original
    showToast('Save failed — reverted', 'error')
  }
}

const MEDIA = [
  { key: 'book', label: 'Books', creator: 'Author' },
  { key: 'audiobook', label: 'Audiobooks', creator: 'Author' },
  { key: 'movie', label: 'Movies', creator: 'Director' },
  { key: 'podcast', label: 'Podcasts', creator: 'Host' },
  { key: 'album', label: 'Albums', creator: 'Artist' },
]

const mediumOf = b => b.medium || 'book'
const mediaLabel = key => MEDIA.find(m => m.key === key)?.label || key
const creatorLabel = key => MEDIA.find(m => m.key === key)?.creator || 'Author'

const SORT_OPTIONS = [
  { key: 'title', label: 'Title', dir: 'asc', value: b => (b.title || '').toLowerCase() },
  { key: 'author', label: 'Author', dir: 'asc', value: b => (b.author || '').toLowerCase() || null },
  { key: 'rating', label: 'Rating', dir: 'desc', value: b => b.rating ?? null },
  { key: 'dateRead', label: 'Date Read', dir: 'desc', value: b => b.dateRead || null },
  { key: 'dateAdded', label: 'Date Added', dir: 'desc', value: b => b.dateAdded || null },
  { key: 'pages', label: 'Pages', dir: 'desc', value: b => b.pages ?? null },
  { key: 'year', label: 'Year', dir: 'desc', value: b => b.year ?? null },
]

// State
const state = {
  books: [],
  loading: true,
  error: null,
  readOnly: false,
  view: 'shelf',
  shelf: { group: '', index: 0, medium: '' },
  q: '',
  tag: '',
  sortBy: 'title',
  sortDir: 'asc',
  selectedIndex: -1,
  route: null,
  settings: { landing: MEDIA.map(m => m.key), shelfName: '' },
  settingsOpen: false,
  menuOpen: false,
  lookupPick: null,
  quickQueue: [],
  detailOpen: false,
  selected: null,
  detailSource: 'results',
  detailEntrance: null,
  modalOpen: false,
  modalLoading: false,
  modalStatus: null,
  canLogin: false,
  unprotected: false,
  loggedIn: false,
  loginOpen: false,
  loginError: null,
  helpOpen: false,
  importOpen: false,
  importBooks: [],
  importFailed: [],
  importPreview: null,
  importLoading: false,
  coverPickerOpen: false,
  coverOptions: [],
  coverLoading: false,
  savingCover: false,
  // Confirm dialog state
  confirmOpen: false,
  confirmTitle: '',
  confirmMessage: '',
  confirmAction: null
}

// Computed
function getAllTags() {
  const set = new Set()
  state.books.forEach(b => (b.tags || []).forEach(t => set.add(t)))
  return Array.from(set).sort()
}

function shelfMedium() {
  return state.route?.kind === 'medium' ? state.route.slug : ''
}

function shelfGroups() {
  return showcaseGroups(state.books, { landing: state.settings.landing || [], medium: shelfMedium() })
}

function activeShelfGroup(groups = shelfGroups()) {
  return groups.find(g => g.key === state.shelf.group) || groups[0] || null
}

// A group that has gone away, or the same group under another medium, starts at its first item
function shelfIndex(group) {
  const sameGroup = group.key === state.shelf.group && state.shelf.medium === shelfMedium()
  return sameGroup ? Math.min(state.shelf.index, group.items.length - 1) : 0
}

function getFilteredSorted() {
  const q = state.q.trim().toLowerCase()
  const tag = state.tag

  let out = state.books.filter(b => {
    if (state.route && !state.route.ids.has(b.id)) return false
    if (tag && !(b.tags || []).includes(tag)) return false
    if (!q) return true
    const hay = [b.title || '', b.author || '', ...(b.tags || [])].join(' ').toLowerCase()
    return hay.includes(q)
  })

  const opt = SORT_OPTIONS.find(o => o.key === state.sortBy) || SORT_OPTIONS[0]
  const sign = state.sortDir === 'desc' ? -1 : 1
  out.sort((a, b) => {
    const va = opt.value(a)
    const vb = opt.value(b)
    if (va === null && vb === null) return (a.title || '').localeCompare(b.title || '')
    if (va === null) return 1   // nulls last regardless of direction
    if (vb === null) return -1
    if (va < vb) return -1 * sign
    if (va > vb) return 1 * sign
    return (a.title || '').localeCompare(b.title || '')
  })

  // The landing page shows only configured media, grouped in the configured
  // order (stable sort preserves the inner ordering) so keyboard navigation
  // walks the page in visual order. Medium tabs bypass this via routes.
  if (isLanding()) {
    const rank = new Map(landingMedia().map((k, i) => [k, i]))
    out = out.filter(b => rank.has(mediumOf(b)))
    out.sort((a, b) => rank.get(mediumOf(a)) - rank.get(mediumOf(b)))
  }

  return out
}

function setSort(key) {
  if (state.sortBy === key) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'
  } else {
    const opt = SORT_OPTIONS.find(o => o.key === key)
    if (!opt) return
    state.sortBy = key
    state.sortDir = opt.dir
  }
  state.selectedIndex = -1
  render()
}

// Cover resolution: a candidate chain walked by window.__nextCover on image
// errors. No bytes are stored by the app - stored URL, local cache, then the
// Open Library ISBN cover service, then the generated placeholder.
function coverCandidates(book) {
  const list = []
  if (book.coverUrl) list.push(book.coverUrl)
  list.push(getLocalCoverPath(book.id))
  if (book.isbn) list.push(`https://covers.openlibrary.org/b/isbn/${String(book.isbn).replace(/[^0-9Xx]/g, '')}-L.jpg?default=false`)
  list.push(generatePlaceholder(book))
  return list
}

window.__nextCover = (img) => {
  const rest = (img.dataset.fallbacks || '').split('\n').filter(Boolean)
  if (!rest.length) return
  img.src = rest.shift()
  img.dataset.fallbacks = rest.join('\n')
}

function coverImgAttrs(book) {
  const cands = coverCandidates(book)
  return `src="${esc(cands[0])}" data-fallbacks="${esc(cands.slice(1).join('\n'))}" onerror="window.__nextCover(this)"`
}

// Walks the cover chain with real image loads and settles on the first that works.
// The generated placeholder is left out: the shelf and overlay draw their own.
// Results are cached by candidate chain, so a book whose cover inputs change resolves afresh.
const coverUrlCache = new Map()
function resolveCover(book) {
  const candidates = coverCandidates(book).slice(0, -1)
  const key = candidates.join('\n')
  if (!coverUrlCache.has(key)) {
    coverUrlCache.set(key, (async () => {
      for (const url of candidates) {
        const ok = await new Promise(resolve => {
          const img = new Image()
          img.onload = () => resolve(img.naturalWidth > 1)
          img.onerror = () => resolve(false)
          img.src = url
        })
        if (ok) return url
      }
      return null
    })())
  }
  return coverUrlCache.get(key)
}

function generatePlaceholder(book) {
  const title = (book.title || 'Untitled').replace(/&/g, 'and')
  const author = (book.author || '').replace(/&/g, 'and')

  const wrapText = (text, maxChars) => {
    const words = text.split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (candidate.length > maxChars) {
        if (line) lines.push(line)
        line = w
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
    return lines.slice(0, 4)
  }

  const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const titleLines = wrapText(title.toUpperCase(), 16).map((line, i) =>
    `<tspan x="300" dy="${i === 0 ? 0 : 60}">${escapeXml(line)}</tspan>`
  ).join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
      <rect width="600" height="900" fill="#E6DBC2"/>
      <text x="300" y="110" text-anchor="middle" font-family="'Inter Tight', system-ui, sans-serif" font-size="20" font-weight="600" letter-spacing="4" fill="#141414">${escapeXml(author.toUpperCase())}</text>
      <text x="300" y="360" text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="52" fill="#141414">
        ${titleLines}
      </text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// Links
function bookshopLink(book) {
  const q = book.isbn || `${book.title} ${book.author || ''}`.trim()
  return `https://bookshop.org/search?keywords=${encodeURIComponent(q)}`
}

function amazonLink(book) {
  const q = book.isbn || `${book.title} ${book.author || ''}`.trim()
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`
}

function openLibraryLink(book) {
  const q = book.isbn || `${book.title} ${book.author || ''}`.trim()
  return `https://openlibrary.org/search?q=${encodeURIComponent(q)}`
}

// Search for cover options from multiple sources
async function searchCovers(book) {
  const results = []

  // Search Open Library
  try {
    const params = new URLSearchParams()
    if (book.title) params.set('title', book.title)
    if (book.author) params.set('author', book.author)
    params.set('limit', '8')
    params.set('fields', 'title,author_name,cover_i,isbn')

    const res = await fetch(`https://openlibrary.org/search.json?${params}`)
    if (res.ok) {
      const data = await res.json()
      for (const doc of (data?.docs || [])) {
        if (doc.cover_i) {
          results.push({
            source: 'Open Library',
            title: doc.title,
            author: doc.author_name?.[0] || '',
            coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
            thumbUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          })
        }
      }
    }
  } catch (e) {
    console.log('Open Library search failed:', e.message)
  }

  // Search Google Books
  try {
    const query = encodeURIComponent(`${book.title} ${book.author || ''}`.trim())
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=8`)
    if (res.ok) {
      const data = await res.json()
      for (const item of (data?.items || [])) {
        const info = item.volumeInfo
        const imageLinks = info?.imageLinks
        if (imageLinks?.thumbnail) {
          const thumbUrl = imageLinks.thumbnail.replace('http://', 'https://')
          const coverUrl = thumbUrl.replace('zoom=1', 'zoom=2')
          results.push({
            source: 'Google Books',
            title: info.title,
            author: info.authors?.[0] || '',
            coverUrl,
            thumbUrl
          })
        }
      }
    }
  } catch (e) {
    console.log('Google Books search failed:', e.message)
  }

  // If book has ISBN, add direct lookup options
  if (book.isbn) {
    results.unshift({
      source: 'ISBN (Open Library)',
      title: book.title,
      author: book.author,
      coverUrl: `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`,
      thumbUrl: `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`
    })
  }

  return results
}

// The full-screen detail is modal: the page it covers stays out of reach while it is open
const behindDetail = () => state.detailOpen ? 'inert' : ''

// Render
function render() {
  const filtered = getFilteredSorted()
  const allTags = getAllTags()

  if (state.loading) {
    document.querySelector('#app').innerHTML = `
      <div class="loading-screen">
        <span class="loading loading-lg"></span>
        <p>Loading bookshelf...</p>
      </div>
    `
    return
  }

  if (state.error) {
    document.querySelector('#app').innerHTML = `
      <div class="error-screen">
        <h2>Error loading books</h2>
        <p>${esc(state.error)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `
    return
  }

  const entrance = state.detailOpen ? state.detailEntrance : null
  state.detailEntrance = null
  const animateEntrance = !!entrance && canAnimate()
  // The ink reveal starts from bare paper only when it will actually play
  const settledCover = !animateEntrance || prefersReducedMotion()

  document.body.classList.toggle('is-shelf', state.view === 'shelf')
  document.querySelector('#app').innerHTML = `
    ${renderUnprotectedBanner()}
    <div class="header" ${behindDetail()}>
      <div class="masthead">
        <div class="view-toggle">
          <button class="view-btn ${state.view === 'shelf' ? 'active' : ''}" data-action="view" data-view="shelf" aria-pressed="${state.view === 'shelf'}">Shelf</button>
          <button class="view-btn ${state.view === 'covers' ? 'active' : ''}" data-action="view" data-view="covers" aria-pressed="${state.view === 'covers'}">Covers</button>
          <button class="view-btn ${state.view === 'list' ? 'active' : ''}" data-action="view" data-view="list" aria-pressed="${state.view === 'list'}">List</button>
        </div>
        <div class="masthead-title">
          <h1><button data-action="home" title="Back to the shelf">${esc(state.settings.shelfName || 'Shelf')}</button></h1>
          ${renderMediaTabs()}
        </div>
        <div class="masthead-actions">
          <div class="search-wrap">
            <input type="text" class="search-input" placeholder="Search title / author / tags" value="${esc(state.q)}" data-action="search">
            <button class="search-clear ${state.q ? '' : 'hidden'}" data-action="clear-search">&times;</button>
          </div>
          ${state.canLogin && state.readOnly ? '<button class="btn" data-action="login">Log In</button>' : ''}
          ${state.readOnly ? '' : `
          <div class="avatar-wrap">
            <button class="avatar" data-action="avatar-menu" title="Shelf actions">${esc((state.settings.shelfName || 'Shelf')[0].toUpperCase())}</button>
            <div class="avatar-dropdown ${state.menuOpen ? 'open' : ''}">
              <button data-action="add-book">Add Media</button>
              <button data-action="import">Import</button>
              <button data-action="shelf-settings">Shelf Settings</button>
              ${state.loggedIn ? '<button data-action="logout">Log Out</button>' : ''}
            </div>
          </div>`}
        </div>
      </div>
      ${state.view === 'shelf' ? '' : `
      <div class="toolbar">
        <select class="select select-tag" data-action="tag">
          <option value="">All tags</option>
          ${allTags.map(t => `<option value="${esc(t)}" ${state.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
        <select class="select select-sort" data-action="sort">
          ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${state.sortBy === o.key ? 'selected' : ''}>${o.label}${state.sortBy === o.key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</option>`).join('')}
        </select>
        <button class="btn" data-action="reset">Reset</button>
      </div>`}
    </div>

    <div id="results" ${behindDetail()}>${renderResults(filtered)}</div>
    ${state.view === 'shelf' ? '' : renderStatusBar(filtered)}
    ${state.detailOpen ? renderDetailOverlay(settledCover) : ''}
    ${state.modalOpen ? renderModal() : ''}
    ${state.importOpen ? renderImportModal() : ''}
    ${state.loginOpen ? renderLoginModal() : ''}
    ${state.settingsOpen ? renderSettingsModal() : ''}
    ${state.coverPickerOpen ? renderCoverPicker() : ''}
    ${state.confirmOpen ? renderConfirmDialog() : ''}
    ${state.helpOpen ? renderHelpOverlay() : ''}
  `

  attachEventListeners()
  mountShelfIfShown()
  if (state.detailOpen) afterDetailRender(entrance, animateEntrance)
}

function landingMedia() {
  const present = new Set(state.books.map(mediumOf))
  return (state.settings.landing || []).filter(k => present.has(k))
}

function isLanding() {
  return state.view === 'covers' && !state.q.trim() && !state.tag && !state.route
}

function renderMediaTabs() {
  const present = MEDIA.filter(m => state.books.some(b => mediumOf(b) === m.key))
  if (present.length < 2) return ''
  const active = state.route?.kind === 'medium' ? state.route.slug : ''
  return `
    <nav class="media-tabs" aria-label="Media">
      <button class="media-tab ${active === '' ? 'active' : ''}" data-medium=""${active === '' ? ' aria-current="true"' : ''}>All</button>
      ${present.map(m => `<button class="media-tab ${active === m.key ? 'active' : ''}" data-medium="${m.key}"${active === m.key ? ' aria-current="true"' : ''}>${m.label}</button>`).join('')}
    </nav>
  `
}

function renderSections(filtered) {
  return landingMedia().map(key => {
    const items = filtered.filter(b => mediumOf(b) === key)
    if (!items.length) return ''
    const offset = filtered.indexOf(items[0])
    return `
      <div class="media-section">
        <h2 class="media-heading"><button data-medium-link="${key}">${mediaLabel(key)} <span class="media-count">${items.length}</span></button></h2>
        ${renderCoversView(items, offset)}
      </div>
    `
  }).join('')
}

function renderResults(filtered) {
  if (state.view === 'shelf') {
    const groups = shelfGroups()
    const group = activeShelfGroup(groups)
    return renderShelfView({
      groups,
      activeKey: group?.key,
      index: group ? shelfIndex(group) : 0,
      total: state.books.length,
      canAdd: !state.readOnly,
    })
  }
  if (!filtered.length && state.books.length) {
    return `
      <div class="empty-state">
        <p>Nothing matches your filters.</p>
        <button class="btn" data-action="reset">Clear filters</button>
      </div>
    `
  }
  if (isLanding() && landingMedia().length > 1) return renderSections(filtered)
  return state.view === 'covers' ? renderCoversView(filtered) : renderListView(filtered)
}

function renderStatusBar(filtered) {
  const total = state.books.length
  const shown = filtered.length
  const opt = SORT_OPTIONS.find(o => o.key === state.sortBy) || SORT_OPTIONS[0]
  return `
    <div class="status-bar" ${behindDetail()}>
      ${shown === total ? `${total} BOOKS` : `${shown}/${total} BOOKS`}
      / SORTED BY ${esc(opt.label.toUpperCase())} ${state.sortDir === 'asc' ? '↑' : '↓'}
      ${state.route ? ` / ${esc(state.route.kind)}: "${esc(state.route.slug)}"` : ''}
      ${state.q ? ` / q: "${esc(state.q)}"` : ''}
      ${state.tag ? ` / tag: ${esc(state.tag)}` : ''}
    </div>
  `
}

// Update only the results region so header controls (like the search input) keep focus
function updateResults() {
  const filtered = getFilteredSorted()
  const results = document.querySelector('#results')
  if (results) results.innerHTML = renderResults(filtered)
  mountShelfIfShown()
  const bar = document.querySelector('.status-bar')
  if (bar) bar.outerHTML = renderStatusBar(filtered)
  const clearBtn = document.querySelector('[data-action="clear-search"]')
  if (clearBtn) clearBtn.classList.toggle('hidden', !state.q)
}

let shelfControl = null

function mountShelfIfShown() {
  shelfControl?.destroy()
  shelfControl = null
  const root = document.querySelector('.shelf-view:not(.shelf-empty)')
  if (!root) return
  const group = activeShelfGroup()
  const index = shelfIndex(group)
  const medium = shelfMedium()
  state.shelf = { group: group.key, index, medium }
  shelfControl = mountShelf(root, {
    items: group.items,
    index,
    reducedMotion: prefersReducedMotion(),
    resolveCover,
    onIndexChange: i => { state.shelf = { group: group.key, index: i, medium } },
    onOpen: (i, rect) => openBook(group.items[i].id, { source: 'shelf', from: rect ? { rect, rotate: TILT_DEG } : null }),
  })
}

function renderConfirmDialog() {
  return `
    <div class="modal-backdrop confirm-backdrop">
      <div class="confirm-dialog">
        <h3>${esc(state.confirmTitle)}</h3>
        <p>${esc(state.confirmMessage)}</p>
        <div class="confirm-actions">
          <button class="btn" data-action="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" data-action="confirm-ok">Remove</button>
        </div>
      </div>
    </div>
  `
}

function renderCoversView(books, offset = 0) {
  return `
    <div class="wall">
      ${books.map((b, i) => `
        <div class="cover-tile medium-${esc(mediumOf(b))} ${offset + i === state.selectedIndex ? 'kb-selected' : ''}" data-action="open-book" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.title)}${b.author ? ` by ${esc(b.author)}` : ''}">
          <div class="cover-aspect" style="background-image:url('${generatePlaceholder(b).replace(/'/g, "\\'")}')">
            <img class="cover-img" ${coverImgAttrs(b)} alt="Cover for ${esc(b.title)}" loading="lazy">
          </div>
          <div class="cover-overlay">
            <div class="cover-info">
              <div class="cover-title">${esc(b.title)}</div>
              <div class="cover-author">${esc(b.author) || '—'}</div>
              <div class="cover-tags">
                ${(b.tags || []).map(t => `<span class="cover-tag">${esc(t)}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `
}

function renderListView(books) {
  return `
    <div class="list-wrap">
      <div class="list-table">
        <div class="list-header">
          <div><button class="list-sort ${state.sortBy === 'title' ? 'active' : ''}" data-sort="title">Title</button></div>
          <div><button class="list-sort ${state.sortBy === 'author' ? 'active' : ''}" data-sort="author">Author</button></div>
          <div style="text-align:right"><button class="list-sort ${state.sortBy === 'rating' ? 'active' : ''}" data-sort="rating">Rating</button></div>
          <div style="text-align:right"><button class="list-sort ${state.sortBy === 'year' ? 'active' : ''}" data-sort="year">Year</button></div>
          <div>Tags</div>
        </div>
        ${books.map((b, i) => `
          <div class="list-row ${i === state.selectedIndex ? 'kb-selected' : ''}">
            <div class="list-title"><button data-action="open-book" data-id="${esc(b.id)}">${esc(b.title)}</button></div>
            <div class="list-author">${esc(b.author) || '—'}</div>
            <div class="list-rating">${b.rating ? esc(b.rating) + '★' : '—'}</div>
            <div class="list-year">${b.year ? esc(b.year) : '—'}</div>
            <div class="list-tags">
              ${(b.tags || []).map(t => `<span class="list-tag">${esc(t)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
        ${renderQuickAdd()}
      </div>
    </div>
  `
}

function activeMedium() {
  return state.route?.kind === 'medium' ? state.route.slug : 'book'
}

function quickPendingRow(q) {
  return `
    <div class="list-row quick-pending">
      <div class="list-title">${esc(q.title)}</div>
      <div class="list-author">—</div>
      <div class="list-rating"></div>
      <div class="list-year"></div>
      <div class="list-tags"><span class="list-tag">pending ${esc(q.medium)}</span></div>
    </div>
  `
}

function renderQuickAdd() {
  if (state.readOnly) return ''
  return `
    ${state.quickQueue.map(quickPendingRow).join('')}
    <div class="quick-add">
      <input class="quick-add-input" data-action="quick-add" placeholder="Quick add a ${esc(activeMedium())} title, press Enter">
      <button class="btn btn-primary ${state.quickQueue.length ? '' : 'hidden'}" data-action="resolve-quick">Resolve ${state.quickQueue.length} pending</button>
    </div>
  `
}

function renderCoverPicker() {
  const b = state.selected
  if (!b) return ''

  return `
    <div class="modal-backdrop" data-action="close-cover-picker">
      <div class="modal-panel cover-picker-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Choose Cover for "${esc(b.title)}"</h2>
          <button class="modal-close" data-action="close-cover-picker">&times;</button>
        </div>
        <div class="modal-body">
          ${state.coverLoading ? `
            <div class="cover-picker-loading">
              <span class="loading"></span> Searching for covers...
            </div>
          ` : state.coverOptions.length === 0 ? `
            <div class="cover-picker-empty">
              No cover options found. Try adding an ISBN to the book.
            </div>
          ` : `
            <div class="cover-picker-grid">
              ${state.coverOptions.map((opt, i) => `
                <div class="cover-option" data-action="select-cover" data-index="${i}">
                  <div class="cover-option-img-wrap">
                    <img src="${esc(opt.thumbUrl || opt.coverUrl)}" alt="${esc(opt.title)}" loading="lazy"
                         onerror="this.parentElement.classList.add('cover-option-error')">
                  </div>
                  <div class="cover-option-info">
                    <div class="cover-option-title">${esc(opt.title)}</div>
                    <div class="cover-option-author">${esc(opt.author) || '—'}</div>
                    <div class="cover-option-source">${esc(opt.source)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <div class="cover-url-row">
          <input type="url" class="form-input" id="cover-url-input" placeholder="Or paste an image URL (linked, never stored)">
          <button class="btn" data-action="use-cover-url">Use URL</button>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-cover-picker">Cancel</button>
          <button class="btn" data-action="refresh-covers" ${state.coverLoading ? 'disabled' : ''}>
            ${state.coverLoading ? '<span class="loading"></span>' : ''}Refresh
          </button>
        </div>
      </div>
    </div>
  `
}

function renderModal() {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Add Media</h2>
          <button class="modal-close" data-action="close-modal">&times;</button>
        </div>
        ${state.modalStatus ? `<div class="status ${state.modalStatus.type}">${esc(state.modalStatus.message)}</div>` : ''}
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Medium</label>
            <select class="form-input" id="add-medium">
              ${MEDIA.map(m => `<option value="${m.key}">${esc(m.label.slice(0, -1))}</option>`).join('')}
            </select>
          </div>
          <div class="form-group isbn-group">
            <label class="form-label">ISBN (optional)</label>
            <input type="text" class="form-input" id="add-isbn" placeholder="9780143127741">
            <div class="form-hint">Enter ISBN to auto-fill title & author</div>
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-input" id="add-title" placeholder="The Design of Everyday Things">
          </div>
          <div class="lookup-results"></div>
          <div class="form-group">
            <label class="form-label" id="add-author-label">Author</label>
            <input type="text" class="form-input" id="add-author" placeholder="Don Norman">
          </div>
          <div class="form-group">
            <label class="form-label">Tags</label>
            <input type="text" class="form-input" id="add-tags" placeholder="design, ux">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-modal">Cancel</button>
          <button class="btn" data-action="lookup-isbn" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : ''}Lookup ISBN
          </button>
          <button class="btn hidden" data-action="lookup-media" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : ''}Lookup
          </button>
          <button class="btn btn-primary" data-action="save-book" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  `
}

function clearHash() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
}

function resetFilters() {
  state.q = ''
  state.tag = ''
  state.sortBy = 'title'
  state.sortDir = 'asc'
  state.selectedIndex = -1
  state.route = null
  clearHash()
  render()
}

const VIEWS = ['shelf', 'covers', 'list']

// The shelf only ever carries a medium filter; entering it drops search, tag and other routes
function clearFiltersForShelf() {
  state.q = ''
  state.tag = ''
  state.selectedIndex = -1
  if (state.route?.kind !== 'medium') state.route = null
  if (parseRoute(location.hash)?.kind !== 'medium') clearHash()
}

function switchView(view) {
  if (view === 'shelf' && state.view !== 'shelf') clearFiltersForShelf()
  state.view = view
  render()
}

function leaveShelfKeepingSearchFocus(input) {
  const caret = input.selectionStart
  const focused = document.activeElement === input
  state.view = 'covers'
  render()
  if (!focused) return
  const next = document.querySelector('[data-action="search"]')
  next?.focus()
  next?.setSelectionRange(caret, caret)
}

// The hash a book is shareable at: its title slug when unambiguous, else its ISBN
function bookHash(book) {
  const titleHash = `#/title/${slugify(book.title)}`
  const parsed = parseRoute(titleHash)
  if (parsed && resolveRoute(parsed, state.books).open?.id === book.id) return titleHash
  if (book.isbn) return `#/isbn/${String(book.isbn).replace(/[^0-9Xx]/g, '').toUpperCase()}`
  return null
}

function openBook(id, { from = null, source = 'results', entrance = true } = {}) {
  const book = state.books.find(b => b.id === id)
  if (!book) return
  state.selected = book
  state.detailOpen = true
  state.detailSource = source
  state.detailEntrance = entrance ? { from } : null
  const target = bookHash(book)
  if (target && location.hash !== target) {
    history.replaceState(null, '', target)
  }
  render()
}

const canAnimate = () => typeof Element.prototype.animate === 'function'
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The list the detail steps through: the shelf group it was opened from, or the current results
function detailList() {
  if (state.detailSource === 'shelf') return activeShelfGroup()?.items || []
  return getFilteredSorted()
}

function stepDetail(delta) {
  const list = detailList()
  const i = list.findIndex(b => b.id === state.selected?.id)
  // An item edited out of the list it was opened from has no neighbours there
  if (i < 0) return
  const next = list[i + delta]
  if (!next) return
  const pressed = document.activeElement?.dataset?.action
  if (state.detailSource === 'shelf') state.shelf.index = i + delta
  else state.selectedIndex = i + delta
  openBook(next.id, { source: state.detailSource, entrance: false })
  // The step button that was pressed keeps focus while it can still step; otherwise focus rests on Close
  const stepButton = ['detail-prev', 'detail-next'].includes(pressed) ? document.querySelector(`.detail [data-action="${pressed}"]`) : null
  const target = stepButton && !stepButton.disabled ? stepButton : document.querySelector('.detail-close')
  target?.focus({ preventScroll: true })
}

// The cover tile or list row in the results that opens this item
const resultTile = id => [...document.querySelectorAll('#results [data-id]')].find(el => el.dataset.id === id)

function onScreen(rect) {
  const { clientWidth, clientHeight } = document.documentElement
  return rect.right > 0 && rect.bottom > 0 && rect.left < clientWidth && rect.top < clientHeight
}

// Where the detail folds away to: the shelf's centred cover, or its tile when that is on screen (else a fade)
function detailOrigin(source, id) {
  if (source === 'shelf') {
    const rect = shelfControl?.centreRect()
    return rect ? { rect, rotate: TILT_DEG } : null
  }
  const rect = resultTile(id)?.getBoundingClientRect()
  return rect && onScreen(rect) ? { rect, rotate: 0 } : null
}

function renderDetailOverlay(settled) {
  const b = state.selected
  if (!b) return ''
  const list = detailList()
  const i = list.findIndex(x => x.id === b.id)
  return renderDetail(b, {
    readOnly: state.readOnly,
    savingCover: state.savingCover,
    media: MEDIA,
    links: [['Bookshop.org', bookshopLink(b)], ['Amazon', amazonLink(b)], ['Open Library', openLibraryLink(b)]],
    canPrev: i > 0,
    canNext: i >= 0 && i < list.length - 1,
    settled,
  })
}

function afterDetailRender(entrance, animate) {
  // A copy still folding away from the last close carries the same ids as the detail
  document.querySelectorAll('body > .detail-ghost').forEach(ghost => ghost.remove())
  const el = document.querySelector('#app .detail')
  const book = state.selected
  if (!el || !book) return
  // A dialog opened over the detail takes the keyboard to itself
  el.toggleAttribute('inert', state.confirmOpen || state.coverPickerOpen)
  resolveCover(book).then(url => {
    const img = document.querySelector('.detail-cover-image')
    if (url && img && state.selected?.id === book.id) img.setAttribute('href', url)
  })
  if (animate) playEntrance(el, entrance.from, { reducedMotion: prefersReducedMotion() })
  if (entrance) el.querySelector('.detail-close')?.focus({ preventScroll: true })
}

function setTagRoute(tag) {
  if (tag) {
    history.replaceState(null, '', `#/tags/${slugify(tag)}`)
    state.tag = tag
    state.selectedIndex = -1
    if (state.view === 'shelf') state.view = 'covers'
    render()
  } else {
    clearHash()
    state.tag = ''
    state.selectedIndex = -1
    render()
  }
}

function closeDetail() {
  const el = document.querySelector('.detail')
  const source = state.detailSource
  const id = state.selected?.id
  state.detailOpen = false
  state.selected = null
  const route = parseRoute(location.hash)
  if (route && (route.kind === 'title' || route.kind === 'isbn')) clearHash()
  render()
  if (source !== 'shelf') resultTile(id)?.focus({ preventScroll: true })
  if (el && canAnimate() && !prefersReducedMotion()) playExit(el, detailOrigin(source, id))
}

// Apply the current location.hash to app state
function applyHash() {
  const route = parseRoute(location.hash)
  if (!route) {
    if (!state.route && !state.detailOpen) return // nothing to change; skip the re-render
    state.route = null
    if (state.detailOpen) {
      state.detailOpen = false
      state.selected = null
    }
    render()
    return
  }

  const resolved = resolveRoute(route, state.books)
  // The open item's own link: the detail already shows it, from whichever view opened it
  if (state.detailOpen && resolved.open && resolved.open.id === state.selected?.id) return
  // Any route but a medium filter shows results, which the shelf view doesn't
  if (route.kind !== 'medium' && state.view === 'shelf') state.view = 'covers'
  if (resolved.canonical && location.hash !== resolved.canonical) {
    history.replaceState(null, '', resolved.canonical)
  }

  if (route.kind === 'tags' && resolved.tag) {
    state.route = null
    state.tag = resolved.tag
    state.selectedIndex = -1
    render()
    return
  }

  if (resolved.open) {
    state.route = null
    state.selected = state.books.find(b => b.id === resolved.open.id) || null
    state.detailOpen = !!state.selected
    state.detailSource = 'results'
    state.detailEntrance = { from: null }
    render()
    return
  }

  // Navigating to a route is a fresh view: stale tag/search filters would
  // silently intersect with it and show misleading empty results.
  state.route = { kind: route.kind, slug: route.slug, ids: new Set(resolved.books.map(b => b.id)) }
  state.tag = ''
  state.q = ''
  state.detailOpen = false
  state.selected = null
  state.selectedIndex = -1
  render()
}

// Single hashchange listener; the window guard keeps test module
// reloads and Vite HMR from stacking handlers.
if (window.__bookshelfHashchange) window.removeEventListener('hashchange', window.__bookshelfHashchange)
window.__bookshelfHashchange = applyHash
window.addEventListener('hashchange', applyHash)

function renderSettingsModal() {
  const landing = state.settings.landing || []
  const ordered = [...landing, ...MEDIA.map(m => m.key).filter(k => !landing.includes(k))]
  return `
    <div class="modal-backdrop" data-action="close-settings">
      <div class="modal-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Shelf Settings</h2>
          <button class="modal-close" data-action="close-settings">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Shelf Name</label>
            <input type="text" class="form-input" id="settings-name" placeholder="Mary Steiner's Shelf" value="${esc(state.settings.shelfName)}" maxlength="60">
            <div class="form-hint">Shown in the masthead and on shared pages. Leave blank for plain "Shelf".</div>
          </div>
          <p class="form-hint">Which media appear on the landing page, and in what order.</p>
          ${ordered.map(key => `
            <div class="settings-row" data-medium="${key}">
              <button class="btn settings-toggle" data-action="toggle-medium">${landing.includes(key) ? '☑' : '☐'} ${esc(mediaLabel(key))}</button>
              <button class="btn" data-action="medium-up" ${landing.includes(key) ? '' : 'disabled'}>↑</button>
              <button class="btn" data-action="medium-down" ${landing.includes(key) ? '' : 'disabled'}>↓</button>
            </div>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-settings">Cancel</button>
          <button class="btn btn-primary" data-action="save-settings">Save</button>
        </div>
      </div>
    </div>
  `
}

// Shown on a hosted shelf whose owner has not configured sign-in. Writes are
// already refused server-side, so this is a status notice rather than a warning,
// and it stays useless to a reader without access to the host.
function renderUnprotectedBanner() {
  if (!state.unprotected) return ''
  return `
    <div class="setup-banner" role="status" ${behindDetail()}>
      <strong>Read-only</strong>
      <span>The owner of this shelf hasn't set up sign-in yet, so nothing here can be added, edited, or deleted.</span>
      <span class="setup-banner-owner">If this is your shelf, the README explains how to finish setup on your host.</span>
    </div>
  `
}

function renderLoginModal() {
  return `
    <div class="modal-backdrop" data-action="close-login">
      <div class="modal-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Log In</h2>
          <button class="modal-close" data-action="close-login">&times;</button>
        </div>
        ${state.loginError ? `<div class="status error">${esc(state.loginError)}</div>` : ''}
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="login-email" autocomplete="username" inputmode="email">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" class="form-input" id="login-password" autocomplete="current-password">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-login">Cancel</button>
          <button class="btn btn-primary" data-action="submit-login">Log In</button>
        </div>
      </div>
    </div>
  `
}

async function refreshSession() {
  try {
    const res = await fetch('/api/session')
    if (!res.ok) return
    const s = await res.json()
    state.unprotected = !!s.unprotected
    // Derived from `writable` alone: a shelf can also be read-only because its
    // owner never configured sign-in, and there is nothing to log into then.
    state.readOnly = !s.writable
    state.canLogin = s.authRequired && !s.writable
    state.loggedIn = s.authRequired && s.writable
  } catch (e) {
    // No session endpoint (static build) - the readOnly fallback already applies
  }
}

function renderHelpOverlay() {
  const rows = [
    ['/', 'focus search'],
    ['← → ↑ ↓', 'navigate the wall or list; ← → move the shelf'],
    ['Enter', 'open selected book'],
    ['← →', 'previous / next book while a book is open'],
    ['Esc', 'close panels; then clear search'],
    ['v', 'cycle Shelf / Covers / List'],
    ['s', 'cycle sort field'],
    ['a', 'add media'],
    ['e', 'edit selected item'],
    ['i', 'import from Goodreads'],
    ['1–9', 'toggle Nth tag filter'],
    ['?', 'this help'],
  ]
  return `
    <div class="help-overlay" data-action="close-help">
      <div class="help-panel" onclick="event.stopPropagation()">
        <h2>Keyboard Shortcuts</h2>
        <div class="help-grid">
          ${rows.map(([k, d]) => `<span class="help-key">${esc(k)}</span><span>${esc(d)}</span>`).join('')}
        </div>
      </div>
    </div>
  `
}

function renderImportModal() {
  const p = state.importPreview
  const failed = state.importFailed
  return `
    <div class="modal-backdrop" data-action="close-import">
      <div class="modal-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Import from Goodreads</h2>
          <button class="modal-close" data-action="close-import">&times;</button>
        </div>
        <div class="modal-body">
          <p class="form-hint">Export from Goodreads: My Books &rarr; Tools &rarr; Import and Export &rarr; Export Library</p>
          <div class="drop-zone" data-action="pick-import-file">
            ${state.importLoading ? '<span class="loading"></span> Reading file...' : 'Drop goodreads_library_export.csv here or click to choose'}
          </div>
          <input type="file" accept=".csv,text/csv" id="import-file" class="hidden">
          ${p ? `
            <div class="import-preview">
              ${p.added} new &bull; ${p.filled} update${p.filled === 1 ? '' : 's'} &bull; ${p.skipped} already complete${failed.length ? ` &bull; ${failed.length} unparseable (rows ${failed.join(', ')})` : ''}
            </div>
          ` : ''}
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-import">Cancel</button>
          <button class="btn btn-primary" data-action="confirm-import" ${p && state.importBooks.length ? '' : 'disabled'}>Confirm Import</button>
        </div>
      </div>
    </div>
  `
}

// Chunked so large libraries clear serverless request-size limits
const IMPORT_CHUNK = 250

async function postImportChunks(books, dryRun) {
  const totals = { added: 0, filled: 0, skipped: 0 }
  for (let i = 0; i < books.length; i += IMPORT_CHUNK) {
    const res = await fetch('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books: books.slice(i, i + IMPORT_CHUNK), dryRun })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Import failed (${res.status})`)
    }
    const counts = await res.json()
    totals.added += counts.added
    totals.filled += counts.filled
    totals.skipped += counts.skipped
  }
  return totals
}

async function loadImportText(text) {
  const { books, failed } = parseGoodreadsCsv(text)
  state.importBooks = books
  state.importFailed = failed
  state.importLoading = false
  try {
    state.importPreview = await postImportChunks(books, true)
  } catch (e) {
    state.importPreview = null
  }
  render()
}
if (import.meta.env?.MODE === 'test') window.__loadImportText = loadImportText

function closeImport() {
  state.importOpen = false
  state.importBooks = []
  state.importFailed = []
  state.importPreview = null
  state.importLoading = false
  render()
}

function attachEventListeners() {
  // Search input
  document.querySelector('[data-action="search"]')?.addEventListener('input', e => {
    state.q = e.target.value
    state.selectedIndex = -1
    if (state.view === 'shelf') {
      if (!e.isComposing) leaveShelfKeepingSearchFocus(e.target)
      return
    }
    updateResults()
  })

  // An IME composition finishing is when a shelf search actually begins
  // WebKit can fire it before the composition's last input event, so read the box itself
  document.querySelector('[data-action="search"]')?.addEventListener('compositionend', e => {
    if (state.view !== 'shelf') return
    state.q = e.target.value
    if (state.q) leaveShelfKeepingSearchFocus(e.target)
  })

  // Clear search
  document.querySelector('[data-action="clear-search"]')?.addEventListener('click', () => {
    state.q = ''
    render()
  })

  // Tag select
  document.querySelector('[data-action="tag"]')?.addEventListener('change', e => {
    setTagRoute(e.target.value)
  })

  // Sort select
  document.querySelector('[data-action="sort"]')?.addEventListener('change', e => {
    setSort(e.target.value)
  })

  // View toggle
  document.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  })

  // Shelf rail: switch showcase group. A mouse click releases focus so Enter opens the centred item.
  document.querySelectorAll('[data-shelf-group]').forEach(el => {
    el.addEventListener('click', e => {
      const key = el.dataset.shelfGroup
      if (key === activeShelfGroup()?.key) {
        if (e.detail > 0) el.blur()
        return
      }
      state.shelf = { group: key, index: 0, medium: shelfMedium() }
      render()
      if (e.detail === 0) document.querySelector(`[data-shelf-group="${key}"]`)?.focus()
    })
  })

  // Reset
  document.querySelector('.header [data-action="reset"]')?.addEventListener('click', resetFilters)

  // Masthead goes home: clear route, filters, and any open panels
  document.querySelector('[data-action="home"]')?.addEventListener('click', () => {
    state.detailOpen = false
    state.selected = null
    state.view = 'shelf'
    resetFilters()
  })

  // Add book button
  document.querySelectorAll('[data-action="add-book"]').forEach(el => el.addEventListener('click', () => {
    state.modalOpen = true
    state.modalStatus = null
    state.lookupPick = null
    render()
  }))

  // Import button
  document.querySelector('.header [data-action="import"]')?.addEventListener('click', () => {
    state.importOpen = true
    render()
  })

  // Avatar menu
  document.querySelector('[data-action="avatar-menu"]')?.addEventListener('click', () => {
    state.menuOpen = !state.menuOpen
    render()
  })
  // Any dropdown item click closes the menu (capture phase runs before the item's handler)
  document.querySelector('.avatar-dropdown')?.addEventListener('click', () => {
    state.menuOpen = false
  }, true)

  // Login / logout
  document.querySelector('.header [data-action="login"]')?.addEventListener('click', () => {
    state.loginOpen = true
    state.loginError = null
    render()
    document.getElementById('login-email')?.focus()
  })

  document.querySelectorAll('[data-action="close-login"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('modal-backdrop') && e.target !== el) return
      state.loginOpen = false
      state.loginError = null
      render()
    })
  })

  const submitLogin = async () => {
    const email = document.getElementById('login-email')?.value || ''
    const password = document.getElementById('login-password')?.value || ''
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        state.loginError = body.error || 'Wrong email or password'
        render()
        return
      }
      await refreshSession()
      state.loginOpen = false
      state.loginError = null
      render()
      showToast('Logged in')
    } catch (e) {
      state.loginError = 'Login failed'
      render()
    }
  }

  document.querySelector('[data-action="submit-login"]')?.addEventListener('click', submitLogin)
  for (const id of ['login-email', 'login-password']) {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submitLogin() }
    })
  }

  document.querySelector('.header [data-action="logout"]')?.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } catch (e) { /* session cookie may linger; the UI still locks */ }
    state.loggedIn = false
    state.readOnly = true
    state.canLogin = true
    render()
    showToast('Logged out')
  })

  // Help overlay: close on backdrop click
  document.querySelector('[data-action="close-help"]')?.addEventListener('click', (e) => {
    if (e.target !== e.currentTarget) return
    state.helpOpen = false
    render()
  })

  // Import modal: close (backdrop only on direct clicks)
  document.querySelectorAll('[data-action="close-import"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('modal-backdrop') && e.target !== el) return
      closeImport()
    })
  })

  // Import modal: file picking
  const importFile = document.getElementById('import-file')
  document.querySelector('[data-action="pick-import-file"]')?.addEventListener('click', () => importFile?.click())
  importFile?.addEventListener('change', () => {
    const file = importFile.files?.[0]
    if (!file) return
    state.importLoading = true
    render()
    file.text().then(loadImportText)
  })
  const dropZone = document.querySelector('.drop-zone')
  dropZone?.addEventListener('dragover', e => e.preventDefault())
  dropZone?.addEventListener('drop', e => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    state.importLoading = true
    render()
    file.text().then(loadImportText)
  })

  // Import modal: confirm
  document.querySelector('[data-action="confirm-import"]')?.addEventListener('click', async () => {
    if (!state.importBooks.length) return
    try {
      const counts = await postImportChunks(state.importBooks, false)
      state.books = await api.getBooks()
      closeImport()
      if (parseRoute(location.hash)) applyHash()
      showToast(`Imported: ${counts.added} added, ${counts.filled} filled, ${counts.skipped} skipped`)
    } catch (e) {
      console.error('Import failed:', e)
      showToast('Import failed: ' + e.message, 'error')
    }
  })

  // Results interactions - delegated so results can re-render without re-attaching listeners
  document.querySelector('#results')?.addEventListener('click', e => {
    if (e.target.closest('[data-action="reset"]')) {
      resetFilters()
      return
    }
    const sortBtn = e.target.closest('[data-sort]')
    if (sortBtn) {
      setSort(sortBtn.dataset.sort)
      return
    }
    const el = e.target.closest('[data-action="open-book"]')
    if (el) openBook(el.dataset.id, { from: { rect: el.getBoundingClientRect(), rotate: 0 } })
  })

  document.querySelector('#results')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = e.target.closest('[data-action="open-book"]')
    if (!el) return
    e.preventDefault()
    openBook(el.dataset.id, { from: { rect: el.getBoundingClientRect(), rotate: 0 } })
  })

  // Close and step the detail
  document.querySelector('[data-action="close-detail"]')?.addEventListener('click', closeDetail)
  document.querySelector('[data-action="detail-prev"]')?.addEventListener('click', () => stepDetail(-1))
  document.querySelector('[data-action="detail-next"]')?.addEventListener('click', () => stepDetail(1))

  // Media tabs and section heading links
  document.querySelectorAll('.media-tab').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.medium
      if (key) {
        history.replaceState(null, '', `#/medium/${key}`)
        applyHash()
      } else {
        state.route = null
        clearHash()
        render()
      }
    })
  })
  document.querySelectorAll('[data-medium-link]').forEach(el => {
    el.addEventListener('click', () => {
      history.replaceState(null, '', `#/medium/${el.dataset.mediumLink}`)
      applyHash()
    })
  })

  // Shelf settings modal
  document.querySelector('[data-action="shelf-settings"]')?.addEventListener('click', () => {
    state.settingsOpen = true
    render()
  })
  document.querySelectorAll('[data-action="close-settings"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('modal-backdrop') && e.target !== el) return
      state.settingsOpen = false
      render()
    })
  })
  document.querySelectorAll('[data-action="toggle-medium"]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.closest('.settings-row').dataset.medium
      const landing = state.settings.landing || []
      state.settings.landing = landing.includes(key) ? landing.filter(k => k !== key) : [...landing, key]
      render()
    })
  })
  const moveMedium = (key, delta) => {
    const landing = [...(state.settings.landing || [])]
    const i = landing.indexOf(key)
    const j = i + delta
    if (i < 0 || j < 0 || j >= landing.length) return
    ;[landing[i], landing[j]] = [landing[j], landing[i]]
    state.settings.landing = landing
    render()
  }
  document.querySelectorAll('[data-action="medium-up"]').forEach(el => {
    el.addEventListener('click', () => moveMedium(el.closest('.settings-row').dataset.medium, -1))
  })
  document.querySelectorAll('[data-action="medium-down"]').forEach(el => {
    el.addEventListener('click', () => moveMedium(el.closest('.settings-row').dataset.medium, 1))
  })
  document.querySelector('[data-action="save-settings"]')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landing: state.settings.landing,
          shelfName: document.getElementById('settings-name')?.value.trim() ?? state.settings.shelfName
        })
      })
      if (!res.ok) throw new Error('Save failed')
      state.settings = await res.json()
      state.settingsOpen = false
      document.title = state.settings.shelfName || 'Shelf'
      render()
      showToast('Settings saved')
    } catch (e) {
      showToast('Failed to save settings', 'error')
    }
  })

  // Add modal: medium switching + iTunes lookup
  document.getElementById('add-medium')?.addEventListener('change', e => {
    const isBook = e.target.value === 'book'
    document.querySelector('.isbn-group')?.classList.toggle('hidden', !isBook)
    document.querySelector('[data-action="lookup-isbn"]')?.classList.toggle('hidden', !isBook)
    document.querySelector('[data-action="lookup-media"]')?.classList.toggle('hidden', isBook)
    const label = document.getElementById('add-author-label')
    if (label) label.textContent = creatorLabel(e.target.value)
  })

  document.querySelector('[data-action="lookup-media"]')?.addEventListener('click', async () => {
    const medium = document.getElementById('add-medium')?.value
    const q = document.getElementById('add-title')?.value.trim()
    const box = document.querySelector('.lookup-results')
    if (!q || !box) return
    box.innerHTML = '<span class="loading"></span>'
    try {
      const res = await fetch(`/api/lookup?medium=${encodeURIComponent(medium)}&q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Lookup failed')
      const { results } = await res.json()
      if (!results.length) {
        box.innerHTML = '<span class="form-hint">No matches found.</span>'
        return
      }
      box.innerHTML = results.slice(0, 5).map((r, i) =>
        `<button class="lookup-result" data-i="${i}">${esc(r.title)}${r.author ? ` — ${esc(r.author)}` : ''}${r.year ? ` (${esc(r.year)})` : ''}</button>`
      ).join('')
      box.querySelectorAll('.lookup-result').forEach(btn => {
        btn.addEventListener('click', () => {
          const pick = results[Number(btn.dataset.i)]
          document.getElementById('add-title').value = pick.title
          document.getElementById('add-author').value = pick.author || ''
          state.lookupPick = pick
          box.innerHTML = ''
        })
      })
    } catch (e) {
      box.innerHTML = '<span class="form-hint">Lookup failed.</span>'
    }
  })

  // Quick add: Enter appends a pending item without re-rendering (the input keeps focus)
  document.querySelector('[data-action="quick-add"]')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const input = e.target
    const title = input.value.trim()
    if (!title) return
    const item = { title, medium: activeMedium() }
    state.quickQueue.push(item)
    input.value = ''
    const quickBar = input.closest('.quick-add')
    quickBar.insertAdjacentHTML('beforebegin', quickPendingRow(item))
    const btn = quickBar.querySelector('[data-action="resolve-quick"]')
    btn.classList.remove('hidden')
    btn.textContent = `Resolve ${state.quickQueue.length} pending`
  })

  document.querySelector('[data-action="resolve-quick"]')?.addEventListener('click', async () => {
    const queue = [...state.quickQueue]
    if (!queue.length) return
    let added = 0
    let misses = 0
    for (const q of queue) {
      let payload = { title: q.title, medium: q.medium, tags: [] }
      try {
        const res = await fetch(`/api/lookup?medium=${encodeURIComponent(q.medium)}&q=${encodeURIComponent(q.title)}`)
        const best = res.ok ? (await res.json()).results[0] : null
        if (best) {
          payload = {
            title: best.title, author: best.author || undefined, isbn: best.isbn || undefined,
            year: best.year || undefined, coverUrl: best.coverUrl || undefined,
            medium: q.medium, tags: []
          }
        } else {
          misses++
        }
      } catch (e) {
        misses++
      }
      try {
        const created = await api.createBook(payload)
        state.books.push(created)
        added++
      } catch (e) {
        console.error('Quick add failed:', e)
      }
    }
    state.quickQueue = []
    render()
    showToast(`Added ${added}${misses ? ` · ${misses} unmatched (kept as typed)` : ''}`)
  })

  // Inline field editing - save on blur, Enter commits, Escape reverts
  document.querySelectorAll('.detail [data-field]').forEach(el => {
    if (el.tagName === 'SELECT') {
      el.addEventListener('change', () => saveField(el))
      return
    }
    el.addEventListener('blur', () => saveField(el))
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        el.blur()
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        el.value = el.dataset.original || ''
        el.blur()
      }
    })
  })

  // Author route from the detail
  document.querySelector('[data-action="author-route"]')?.addEventListener('click', () => {
    if (!state.selected?.author) return
    history.replaceState(null, '', `#/author/${slugify(state.selected.author)}`)
    applyHash()
  })

  // Delete book
  document.querySelector('[data-action="delete-book"]')?.addEventListener('click', async () => {
    if (!state.selected) return

    const book = state.selected
    const confirmed = await showConfirm('Remove Book', `Are you sure you want to remove "${book.title}" from your bookshelf?`)
    if (!confirmed) return

    try {
      await api.deleteBook(book.id)

      // Remove from local state
      const list = state.detailSource === 'shelf' ? detailList() : null
      const removedAt = list ? list.findIndex(b => b.id === book.id) : -1
      state.books = state.books.filter(b => b.id !== book.id)
      state.detailOpen = false
      state.selected = null
      if (removedAt >= 0) state.shelf.index = removedAt < list.length - 1 ? removedAt : Math.max(0, removedAt - 1)
      // The removed item's own link would now resolve to nothing
      if (['title', 'isbn'].includes(parseRoute(location.hash)?.kind)) clearHash()

      showToast(`"${book.title}" removed`)
      render()
    } catch (e) {
      console.error('Failed to delete book:', e)
      showToast('Failed to remove book: ' + e.message, 'error')
    }
  })

  // Confirm dialog buttons
  document.querySelector('[data-action="confirm-ok"]')?.addEventListener('click', () => answerConfirm(true))
  document.querySelector('[data-action="confirm-cancel"]')?.addEventListener('click', () => answerConfirm(false))

  // Rating buttons (supports half stars)
  document.querySelectorAll('[data-action="set-rating"]').forEach(el => {
    el.addEventListener('click', async () => {
      if (!state.selected) return
      const rating = parseFloat(el.dataset.rating)
      try {
        const updatedBook = await api.updateBook(state.selected.id, { ...state.selected, rating })
        updateBookInState(updatedBook)
        showToast(`Rating saved: ${rating} stars`)
      } catch (e) {
        console.error('Failed to save rating:', e)
        showToast('Failed to save rating', 'error')
      }
    })
  })

  document.querySelector('[data-action="clear-rating"]')?.addEventListener('click', async () => {
    if (!state.selected) return
    try {
      const updatedBook = await api.updateBook(state.selected.id, { ...state.selected, rating: null })
      updateBookInState(updatedBook)
      showToast('Rating cleared')
    } catch (e) {
      showToast('Failed to clear rating', 'error')
    }
  })

  // Notes - save on blur
  document.querySelector('[data-action="notes"]')?.addEventListener('blur', async (e) => {
    if (!state.selected) return
    const notes = e.target.value.trim()
    if (notes === (state.selected.notes || '')) return // No change
    try {
      const updatedBook = await api.updateBook(state.selected.id, { ...state.selected, notes: notes || null })
      updateBookInState(updatedBook)
      showToast('Notes saved')
    } catch (e) {
      showToast('Failed to save notes', 'error')
    }
  })

  // Close modal - backdrop only closes on direct clicks, not bubbled ones
  document.querySelectorAll('[data-action="close-modal"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('modal-backdrop') && e.target !== el) return
      state.modalOpen = false
      state.modalStatus = null
      render()
    })
  })

  // Open cover picker
  document.querySelector('[data-action="open-cover-picker"]')?.addEventListener('click', async () => {
    state.coverPickerOpen = true
    state.coverLoading = true
    state.coverOptions = []
    render()

    try {
      const options = await searchCovers(state.selected)
      state.coverOptions = options
    } catch (e) {
      console.error('Cover search failed:', e)
    }

    state.coverLoading = false
    render()
  })

  // Close cover picker - backdrop only closes on direct clicks, not bubbled ones
  document.querySelectorAll('[data-action="close-cover-picker"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('modal-backdrop') && e.target !== el) return
      state.coverPickerOpen = false
      state.coverOptions = []
      render()
    })
  })

  // Manually linked cover URL
  document.querySelector('[data-action="use-cover-url"]')?.addEventListener('click', async () => {
    const url = document.getElementById('cover-url-input')?.value.trim()
    if (!url || !state.selected) return
    const bookId = state.selected.id
    state.coverPickerOpen = false
    state.coverOptions = []
    render()
    try {
      const updatedBook = await api.updateCover(bookId, url)
      syncBookState(updatedBook)
      render()
      showToast('Cover linked')
    } catch (e) {
      showToast('Failed to save cover: ' + e.message, 'error')
    }
  })

  // Refresh covers
  document.querySelector('[data-action="refresh-covers"]')?.addEventListener('click', async () => {
    state.coverLoading = true
    state.coverOptions = []
    render()

    try {
      const options = await searchCovers(state.selected)
      state.coverOptions = options
    } catch (e) {
      console.error('Cover search failed:', e)
    }

    state.coverLoading = false
    render()
  })

  // Select cover - save immediately to SQLite
  document.querySelectorAll('[data-action="select-cover"]').forEach(el => {
    el.addEventListener('click', async () => {
      const index = parseInt(el.dataset.index)
      const option = state.coverOptions[index]
      if (option && state.selected) {
        const bookId = state.selected.id
        const newCoverUrl = option.coverUrl

        state.coverPickerOpen = false
        state.coverOptions = []
        state.savingCover = true
        render()

        try {
          // Save to database
          const updatedBook = await api.updateCover(bookId, newCoverUrl)

          syncBookState(updatedBook)

          console.log(`✓ Cover updated for "${updatedBook.title}"`)
        } catch (e) {
          console.error('Failed to save cover:', e)
          showToast('Failed to save cover: ' + e.message, 'error')
        }

        state.savingCover = false
        render()
      }
    })
  })

  // Lookup ISBN
  document.querySelector('[data-action="lookup-isbn"]')?.addEventListener('click', async () => {
    const isbn = document.getElementById('add-isbn')?.value.trim().replace(/-/g, '')
    if (!isbn) {
      state.modalStatus = { type: 'error', message: 'Enter an ISBN first' }
      render()
      return
    }

    state.modalLoading = true
    state.modalStatus = null
    render()

    try {
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)
      const data = await res.json()
      const bookData = data[`ISBN:${isbn}`]

      if (!bookData) {
        throw new Error('Book not found')
      }

      state.modalLoading = false
      render()

      // Fill in fields
      document.getElementById('add-title').value = bookData.title || ''
      document.getElementById('add-author').value = bookData.authors?.[0]?.name || ''

      // Extract subjects as tags
      const subjects = bookData.subjects?.slice(0, 3).map(s => s.name.toLowerCase()).join(', ') || ''
      document.getElementById('add-tags').value = subjects

      state.modalStatus = { type: 'success', message: 'Found! Review and click Add Book.' }
      render()
    } catch (e) {
      state.modalLoading = false
      state.modalStatus = { type: 'error', message: e.message || 'Lookup failed' }
      render()
    }
  })

  // Save book - save immediately to SQLite
  document.querySelector('[data-action="save-book"]')?.addEventListener('click', async () => {
    const title = document.getElementById('add-title')?.value.trim()
    const author = document.getElementById('add-author')?.value.trim()
    const tags = document.getElementById('add-tags')?.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    const isbn = document.getElementById('add-isbn')?.value.trim().replace(/-/g, '') || null

    if (!title) {
      state.modalStatus = { type: 'error', message: 'Title is required' }
      render()
      return
    }

    state.modalLoading = true
    state.modalStatus = null
    render()

    const medium = document.getElementById('add-medium')?.value || 'book'
    const pick = state.lookupPick

    try {
      const newBook = await api.createBook({
        title, author, tags, isbn, medium,
        ...(pick && pick.title === title ? { year: pick.year, coverUrl: pick.coverUrl } : {})
      })
      state.books.push(newBook)

      state.modalOpen = false
      state.modalStatus = null
      state.modalLoading = false

      showToast(`"${newBook.title}" added`)
      render()
    } catch (e) {
      state.modalLoading = false
      state.modalStatus = { type: 'error', message: e.message || 'Failed to save book' }
      render()
    }
  })

}

function wallColumns() {
  const wall = document.querySelector('.wall')
  if (!wall || typeof getComputedStyle !== 'function') return 1
  const cols = getComputedStyle(wall).gridTemplateColumns
  if (!cols || cols === 'none') return 1
  return cols.split(' ').length
}

function onKeydown(e) {
  // Keys during IME composition belong to the IME (229 is the legacy composing keyCode)
  if (e.isComposing || e.keyCode === 229) return
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)
  if (e.key === 'Escape') {
    if (state.confirmOpen) { answerConfirm(false); return }
    if (state.helpOpen) { state.helpOpen = false; render(); return }
    if (state.coverPickerOpen) { state.coverPickerOpen = false; state.coverOptions = []; render(); return }
    if (state.modalOpen) { state.modalOpen = false; state.modalStatus = null; render(); return }
    if (state.loginOpen) { state.loginOpen = false; state.loginError = null; render(); return }
    if (state.settingsOpen) { state.settingsOpen = false; render(); return }
    if (state.importOpen) { closeImport(); return }
    if (state.detailOpen) { closeDetail(); return }
    if (state.route) { state.route = null; clearHash(); render(); return }
    if (state.q) { state.q = ''; document.querySelector('[data-action="search"]')?.blur(); render() }
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (typing) return
  if (state.confirmOpen || state.modalOpen || state.coverPickerOpen || state.importOpen || state.helpOpen || state.loginOpen || state.settingsOpen) return

  const filtered = getFilteredSorted()
  if (state.detailOpen) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      stepDetail(e.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (e.key === 'e' && !state.readOnly && state.selected) {
      e.preventDefault()
      document.querySelector('.detail [data-field="title"]')?.focus()
    }
    return
  }
  if (e.key === '/') {
    e.preventDefault()
    document.querySelector('[data-action="search"]')?.focus()
    return
  }
  if (state.view === 'shelf') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      shelfControl?.step(e.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (e.key === 'Enter') {
      // A focused button handles its own Enter. One that opens the detail must not
      // go on to press the Close button the detail focuses.
      if (shelfControl && !document.activeElement?.closest?.('button, a')) {
        e.preventDefault()
        shelfControl.open()
      }
      return
    }
    if (['ArrowUp', 'ArrowDown', 's', 'e'].includes(e.key)) return
  }
  const cols = state.view === 'covers' ? wallColumns() : 1
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
  if (move !== undefined) {
    e.preventDefault()
    state.selectedIndex = Math.max(0, Math.min(filtered.length - 1, (state.selectedIndex < 0 ? 0 : state.selectedIndex + move)))
    updateResults()
    document.querySelector('.kb-selected')?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (e.key === 'Enter' && state.selectedIndex >= 0) {
    // Keeps this Enter from going on to press the Close button the detail focuses
    e.preventDefault()
    const tile = document.querySelector('.kb-selected')
    openBook(filtered[state.selectedIndex]?.id, { from: tile ? { rect: tile.getBoundingClientRect(), rotate: 0 } : null })
    return
  }
  if (e.key === 'v') {
    switchView(VIEWS[(VIEWS.indexOf(state.view) + 1) % VIEWS.length])
    return
  }
  if (e.key === 's') {
    const i = SORT_OPTIONS.findIndex(o => o.key === state.sortBy)
    const next = SORT_OPTIONS[(i + 1) % SORT_OPTIONS.length]
    state.sortBy = next.key
    state.sortDir = next.dir
    state.selectedIndex = -1
    render()
    return
  }
  if (!state.readOnly && e.key === 'a') {
    state.modalOpen = true
    state.modalStatus = null
    render()
    return
  }
  if (!state.readOnly && e.key === 'i') {
    state.importOpen = true
    render()
    return
  }
  if (!state.readOnly && e.key === 'e' && state.selectedIndex >= 0) {
    e.preventDefault()
    openBook(filtered[state.selectedIndex].id)
    document.querySelector('.detail [data-field="title"]')?.focus()
    return
  }
  if (e.key === '?') {
    state.helpOpen = true
    render()
    return
  }
  if (/^[1-9]$/.test(e.key)) {
    const tag = getAllTags()[Number(e.key) - 1]
    if (!tag) return
    setTagRoute(state.tag === tag ? '' : tag)
  }
}

// Single document-level listener; the window guard keeps test module
// reloads and Vite HMR from stacking handlers.
if (window.__bookshelfKeydown) document.removeEventListener('keydown', window.__bookshelfKeydown)
window.__bookshelfKeydown = onKeydown
document.addEventListener('keydown', onKeydown)

// Init - load books from API, falling back to build-time embedded data
async function init() {
  try {
    state.books = await api.getBooks()
  } catch (e) {
    if (embeddedBooks) {
      state.books = embeddedBooks
      state.readOnly = true
    } else {
      console.error('Failed to load books:', e)
      state.error = e.message
    }
  }
  state.loading = false
  if (!state.readOnly && !state.error) {
    await refreshSession()
    try {
      const res = await fetch('/api/settings')
      if (res.ok) state.settings = { ...state.settings, ...(await res.json()) }
      if (state.settings.shelfName) document.title = state.settings.shelfName
    } catch (e) {
      // No settings endpoint (static build) - defaults apply
    }
  }
  if (parseRoute(location.hash)) applyHash()
  else render()
}

init()
