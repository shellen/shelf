import './style.css'
import embeddedBooks from 'virtual:bookshelf-data'
import { parseGoodreadsCsv } from './goodreads.js'

// Escape data for safe interpolation into HTML templates (element and attribute contexts)
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

// Toast helper
function showToast(message, type = 'success') {
  state.toast = { message, type }
  render()
  setTimeout(() => {
    state.toast = null
    render()
  }, 3000)
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

// Helper to update a book in state
function updateBookInState(updatedBook) {
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
  render()
}

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
  view: 'covers',
  q: '',
  tag: '',
  sortBy: 'title',
  sortDir: 'asc',
  selectedIndex: -1,
  drawerOpen: false,
  selected: null,
  modalOpen: false,
  modalLoading: false,
  modalStatus: null,
  editingId: null,
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
  confirmAction: null,
  // Toast notification
  toast: null
}

// Computed
function getAllTags() {
  const set = new Set()
  state.books.forEach(b => (b.tags || []).forEach(t => set.add(t)))
  return Array.from(set).sort()
}

function getFilteredSorted() {
  const q = state.q.trim().toLowerCase()
  const tag = state.tag

  let out = state.books.filter(b => {
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

// Cover URL - check book's saved coverUrl first, then try local cached
function getCoverUrl(book) {
  // 1. Saved custom cover URL in book data
  if (book.coverUrl) {
    // Add cache-buster if not already present to avoid stale images
    const url = new URL(book.coverUrl, window.location.origin)
    return url.href
  }
  // 2. Try locally cached cover image (will use onerror fallback if missing)
  return getLocalCoverPath(book.id)
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

  const titleLines = wrapText(title, 18).map((line, i) =>
    `<tspan x="60" dy="${i === 0 ? 0 : 58}">${escapeXml(line)}</tspan>`
  ).join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
      <rect width="600" height="900" fill="#ffffff"/>
      <rect x="9" y="9" width="582" height="882" fill="none" stroke="#000000" stroke-width="18"/>
      <rect x="60" y="70" width="480" height="18" fill="#ff2e2e"/>
      <text x="60" y="190" font-family="'Arial Black', Inter, system-ui" font-size="46" fill="#000000" font-weight="900" style="text-transform:uppercase" letter-spacing="-1">
        ${titleLines}
      </text>
      <text x="60" y="620" font-family="Menlo, monospace" font-size="22" fill="#000000">
        ${escapeXml(author)}
      </text>
      <rect x="60" y="700" width="420" height="10" fill="#000000"/>
      <rect x="60" y="728" width="360" height="10" fill="#000000"/>
      <rect x="60" y="756" width="400" height="10" fill="#000000"/>
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

  document.querySelector('#app').innerHTML = `
    <div class="header">
      <div class="header-inner">
        <div class="header-row">
          <div class="header-title">
            <h1>Bookshelf</h1>
          </div>
          <div class="header-controls">
            <div class="search-wrap">
              <input type="text" class="search-input" placeholder="Search title / author / tags" value="${esc(state.q)}" data-action="search">
              <button class="search-clear ${state.q ? '' : 'hidden'}" data-action="clear-search">&times;</button>
            </div>
            <select class="select select-tag" data-action="tag">
              <option value="">All tags</option>
              ${allTags.map(t => `<option value="${esc(t)}" ${state.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
            <select class="select select-sort" data-action="sort">
              ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${state.sortBy === o.key ? 'selected' : ''}>${o.label}${state.sortBy === o.key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</option>`).join('')}
            </select>
            <div class="view-toggle">
              <button class="view-btn ${state.view === 'covers' ? 'active' : ''}" data-action="view" data-view="covers">Covers</button>
              <button class="view-btn ${state.view === 'list' ? 'active' : ''}" data-action="view" data-view="list">List</button>
            </div>
            <button class="btn" data-action="reset">Reset</button>
            ${state.readOnly ? '' : '<button class="btn" data-action="import">Import</button>'}
            ${state.readOnly ? '' : '<button class="btn btn-primary" data-action="add-book">+ Add Book</button>'}
          </div>
        </div>
      </div>
    </div>

    <div id="results">${renderResults(filtered)}</div>
    ${renderStatusBar(filtered)}
    ${state.drawerOpen ? renderDrawer() : ''}
    ${state.modalOpen ? renderModal() : ''}
    ${state.importOpen ? renderImportModal() : ''}
    ${state.coverPickerOpen ? renderCoverPicker() : ''}
    ${state.confirmOpen ? renderConfirmDialog() : ''}
    ${state.helpOpen ? renderHelpOverlay() : ''}
    ${state.toast ? renderToast() : ''}
  `

  attachEventListeners()
}

function renderResults(filtered) {
  if (!filtered.length && state.books.length) {
    return `
      <div class="empty-state">
        <p>No books match your filters.</p>
        <button class="btn" data-action="reset">Clear filters</button>
      </div>
    `
  }
  return state.view === 'covers' ? renderCoversView(filtered) : renderListView(filtered)
}

function renderStatusBar(filtered) {
  const total = state.books.length
  const shown = filtered.length
  const opt = SORT_OPTIONS.find(o => o.key === state.sortBy) || SORT_OPTIONS[0]
  return `
    <div class="status-bar">
      ${shown === total ? `${total} BOOKS` : `${shown}/${total} BOOKS`}
      / SORTED BY ${esc(opt.label.toUpperCase())} ${state.sortDir === 'asc' ? '↑' : '↓'}
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
  const bar = document.querySelector('.status-bar')
  if (bar) bar.outerHTML = renderStatusBar(filtered)
  const clearBtn = document.querySelector('[data-action="clear-search"]')
  if (clearBtn) clearBtn.classList.toggle('hidden', !state.q)
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

function renderToast() {
  return `
    <div class="toast toast-${state.toast.type}">
      ${esc(state.toast.message)}
    </div>
  `
}

function renderCoversView(books) {
  return `
    <div class="wall">
      ${books.map((b, i) => `
        <div class="cover-tile ${i === state.selectedIndex ? 'kb-selected' : ''}" data-action="open-book" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.title)}${b.author ? ` by ${esc(b.author)}` : ''}">
          <div class="cover-aspect" style="background-image:url('${generatePlaceholder(b).replace(/'/g, "\\'")}')">
            <img class="cover-img" src="${esc(getCoverUrl(b))}" alt="Cover for ${esc(b.title)}" loading="lazy"
                 onerror="this.onerror=null; this.src='${generatePlaceholder(b).replace(/'/g, "\\'")}'"
            >
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
      </div>
    </div>
  `
}

function renderDrawer() {
  const b = state.selected
  if (!b) return ''

  const coverUrl = getCoverUrl(b)
  const rating = b.rating || 0

  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <div class="drawer-panel">
      <div class="drawer-header">
        <h2>Book</h2>
        <button class="drawer-close" data-action="close-drawer">&times;</button>
      </div>
      <div class="drawer-content">
        <div class="drawer-book">
          <div class="drawer-cover">
            <img class="drawer-cover-img" src="${esc(coverUrl)}" alt="Cover for ${esc(b.title)}"
                 onerror="this.onerror=null; this.src='${generatePlaceholder(b).replace(/'/g, "\\'")}'"
            >
            ${state.readOnly ? '' : `
            <button class="btn drawer-change-cover" data-action="open-cover-picker" ${state.savingCover ? 'disabled' : ''}>
              ${state.savingCover ? '<span class="loading"></span>' : 'Change Cover'}
            </button>`}
          </div>
          <div class="drawer-details">
            <div class="drawer-title">${esc(b.title)}</div>
            <div class="drawer-author">${esc(b.author) || '—'}</div>
            <div class="drawer-rating">
              ${[1,2,3,4,5].map(star => {
                const halfValue = star - 0.5
                const fullValue = star
                // Determine fill state: empty, half, or full
                let fillClass = ''
                if (rating >= fullValue) {
                  fillClass = 'filled'
                } else if (rating >= halfValue) {
                  fillClass = 'half-filled'
                }
                return `
                  <span class="star-wrapper">
                    <span class="star-display ${fillClass}">★</span>
                    ${state.readOnly ? '' : `
                    <button class="star-hit star-hit-left" data-action="set-rating" data-rating="${halfValue}" title="${halfValue} stars"></button>
                    <button class="star-hit star-hit-right" data-action="set-rating" data-rating="${fullValue}" title="${fullValue} stars"></button>`}
                  </span>
                `
              }).join('')}
              ${rating > 0 && !state.readOnly ? `<button class="star-clear" data-action="clear-rating">Clear</button>` : ''}
              ${rating > 0 ? `<span class="rating-value">${rating}</span>` : ''}
            </div>
            <div class="drawer-tags">
              ${(b.tags || []).map(t => `<span class="drawer-tag">${esc(t)}</span>`).join('')}
            </div>
            <div class="drawer-meta">
              ${[
                b.year ? esc(b.year) : null,
                b.pages ? `${esc(b.pages)} pages` : null,
                b.dateRead ? `read ${esc(b.dateRead)}` : null,
                b.isbn ? `ISBN ${esc(b.isbn)}` : null
              ].filter(Boolean).join(' &bull; ') || '&nbsp;'}
            </div>
            <div class="drawer-notes">
              <label class="notes-label">Notes</label>
              <textarea class="notes-input" data-action="notes" placeholder="${state.readOnly ? '' : 'Add your notes...'}" ${state.readOnly ? 'readonly' : ''}>${esc(b.notes)}</textarea>
            </div>
            <div class="drawer-links">
              <a class="drawer-link" href="${esc(bookshopLink(b))}" target="_blank" rel="noreferrer">Bookshop.org search &rarr;</a>
              <a class="drawer-link" href="${esc(amazonLink(b))}" target="_blank" rel="noreferrer">Amazon search &rarr;</a>
              <a class="drawer-link" href="${esc(openLibraryLink(b))}" target="_blank" rel="noreferrer">Open Library search &rarr;</a>
            </div>
            ${state.readOnly ? '' : `
            <div class="drawer-actions">
              <button class="btn" data-action="edit-book">Edit Book</button>
              <button class="btn btn-danger" data-action="delete-book">Remove Book</button>
            </div>`}
          </div>
        </div>
      </div>
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
          <button class="drawer-close" data-action="close-cover-picker">&times;</button>
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
  const editing = state.editingId ? state.books.find(b => b.id === state.editingId) : null
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>${editing ? 'Edit Book' : 'Add Book'}</h2>
          <button class="drawer-close" data-action="close-modal">&times;</button>
        </div>
        ${state.modalStatus ? `<div class="status ${state.modalStatus.type}">${esc(state.modalStatus.message)}</div>` : ''}
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">ISBN (optional)</label>
            <input type="text" class="form-input" id="add-isbn" placeholder="9780143127741" value="${esc(editing?.isbn)}">
            <div class="form-hint">Enter ISBN to auto-fill title & author</div>
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-input" id="add-title" placeholder="The Design of Everyday Things" value="${esc(editing?.title)}">
          </div>
          <div class="form-group">
            <label class="form-label">Author</label>
            <input type="text" class="form-input" id="add-author" placeholder="Don Norman" value="${esc(editing?.author)}">
          </div>
          <div class="form-group">
            <label class="form-label">Tags</label>
            <input type="text" class="form-input" id="add-tags" placeholder="design, ux" value="${esc((editing?.tags || []).join(', '))}">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-modal">Cancel</button>
          <button class="btn" data-action="lookup-isbn" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : ''}Lookup ISBN
          </button>
          <button class="btn btn-primary" data-action="save-book" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : editing ? 'Save Changes' : 'Add Book'}
          </button>
        </div>
      </div>
    </div>
  `
}

function resetFilters() {
  state.q = ''
  state.tag = ''
  state.sortBy = 'title'
  state.sortDir = 'asc'
  state.selectedIndex = -1
  render()
}

function openBook(id) {
  const book = state.books.find(b => b.id === id)
  if (book) {
    state.selected = book
    state.drawerOpen = true
    render()
  }
}

function renderHelpOverlay() {
  const rows = [
    ['/', 'focus search'],
    ['← → ↑ ↓', 'navigate the wall or list'],
    ['Enter', 'open selected book'],
    ['← →', 'previous / next book while a book is open'],
    ['Esc', 'close panels; then clear search'],
    ['v', 'toggle Covers / List'],
    ['s', 'cycle sort field'],
    ['a', 'add a book'],
    ['e', 'edit selected book'],
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
          <button class="drawer-close" data-action="close-import">&times;</button>
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

async function loadImportText(text) {
  const { books, failed } = parseGoodreadsCsv(text)
  state.importBooks = books
  state.importFailed = failed
  state.importLoading = false
  try {
    const res = await fetch('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books, dryRun: true })
    })
    state.importPreview = res.ok ? await res.json() : null
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
    updateResults()
  })

  // Clear search
  document.querySelector('[data-action="clear-search"]')?.addEventListener('click', () => {
    state.q = ''
    render()
  })

  // Tag select
  document.querySelector('[data-action="tag"]')?.addEventListener('change', e => {
    state.tag = e.target.value
    state.selectedIndex = -1
    render()
  })

  // Sort select
  document.querySelector('[data-action="sort"]')?.addEventListener('change', e => {
    setSort(e.target.value)
  })

  // View toggle
  document.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view
      render()
    })
  })

  // Reset
  document.querySelector('.header [data-action="reset"]')?.addEventListener('click', resetFilters)

  // Add book button
  document.querySelector('[data-action="add-book"]')?.addEventListener('click', () => {
    state.modalOpen = true
    state.modalStatus = null
    render()
  })

  // Import button
  document.querySelector('.header [data-action="import"]')?.addEventListener('click', () => {
    state.importOpen = true
    render()
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
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: state.importBooks })
      })
      if (!res.ok) throw new Error('Import failed')
      const counts = await res.json()
      state.books = await api.getBooks()
      closeImport()
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
    if (el) openBook(el.dataset.id)
  })

  document.querySelector('#results')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = e.target.closest('[data-action="open-book"]')
    if (!el) return
    e.preventDefault()
    openBook(el.dataset.id)
  })

  // Close drawer
  document.querySelectorAll('[data-action="close-drawer"]').forEach(el => {
    el.addEventListener('click', () => {
      state.drawerOpen = false
      state.selected = null
      render()
    })
  })

  // Edit book
  document.querySelector('[data-action="edit-book"]')?.addEventListener('click', () => {
    if (!state.selected) return
    state.editingId = state.selected.id
    state.modalOpen = true
    state.modalStatus = null
    render()
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
      state.books = state.books.filter(b => b.id !== book.id)
      state.drawerOpen = false
      state.selected = null

      showToast(`"${book.title}" removed`)
      render()
    } catch (e) {
      console.error('Failed to delete book:', e)
      showToast('Failed to remove book: ' + e.message, 'error')
    }
  })

  // Confirm dialog buttons
  document.querySelector('[data-action="confirm-ok"]')?.addEventListener('click', () => {
    state.confirmOpen = false
    if (state.confirmAction) state.confirmAction(true)
    state.confirmAction = null
    render()
  })

  document.querySelector('[data-action="confirm-cancel"]')?.addEventListener('click', () => {
    state.confirmOpen = false
    if (state.confirmAction) state.confirmAction(false)
    state.confirmAction = null
    render()
  })

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
      state.editingId = null
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

          // Update local state - create new object to ensure React-like immutability
          const bookIndex = state.books.findIndex(b => b.id === bookId)
          if (bookIndex !== -1) {
            // Create a new array with the updated book
            state.books = [
              ...state.books.slice(0, bookIndex),
              { ...updatedBook },
              ...state.books.slice(bookIndex + 1)
            ]
            // Update selected with a fresh copy
            state.selected = { ...updatedBook }
          }

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

    try {
      if (state.editingId) {
        const updatedBook = await api.updateBook(state.editingId, { title, author, tags, isbn })
        state.modalOpen = false
        state.modalLoading = false
        state.editingId = null
        updateBookInState(updatedBook)
        showToast(`"${updatedBook.title}" updated`)
      } else {
        const newBook = await api.createBook({ title, author, tags, isbn })
        state.books.push(newBook)

        state.modalOpen = false
        state.modalStatus = null
        state.modalLoading = false

        console.log(`✓ Book added: "${newBook.title}"`)
        render()
      }
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
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)
  if (e.key === 'Escape') {
    if (state.helpOpen) { state.helpOpen = false; render(); return }
    if (state.coverPickerOpen) { state.coverPickerOpen = false; state.coverOptions = []; render(); return }
    if (state.modalOpen) { state.modalOpen = false; state.modalStatus = null; state.editingId = null; render(); return }
    if (state.importOpen) { closeImport(); return }
    if (state.drawerOpen) { state.drawerOpen = false; state.selected = null; render(); return }
    if (state.q) { state.q = ''; document.querySelector('[data-action="search"]')?.blur(); render() }
    return
  }
  if (typing) return
  if (state.confirmOpen || state.modalOpen || state.coverPickerOpen || state.importOpen || state.helpOpen) return

  const filtered = getFilteredSorted()
  if (e.key === '/') {
    e.preventDefault()
    document.querySelector('[data-action="search"]')?.focus()
    return
  }
  if (state.drawerOpen) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const i = filtered.findIndex(b => b.id === state.selected?.id)
      const next = filtered[i + delta]
      if (next) { state.selectedIndex = i + delta; openBook(next.id) }
      return
    }
    if (e.key === 'e' && !state.readOnly && state.selected) {
      state.editingId = state.selected.id
      state.modalOpen = true
      state.modalStatus = null
      render()
    }
    return
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
    openBook(filtered[state.selectedIndex]?.id)
    return
  }
  if (e.key === 'v') {
    state.view = state.view === 'covers' ? 'list' : 'covers'
    render()
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
    state.selected = filtered[state.selectedIndex]
    state.editingId = state.selected.id
    state.modalOpen = true
    state.modalStatus = null
    render()
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
    state.tag = state.tag === tag ? '' : tag
    state.selectedIndex = -1
    render()
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
  render()
}

init()
