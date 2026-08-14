import './style.css'
import embeddedBooks from 'virtual:bookshelf-data'

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
  drawerOpen: false,
  selected: null,
  modalOpen: false,
  modalLoading: false,
  modalStatus: null,
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
    const hay = [b.title || '', b.author || '', ...(b.tags || []), String(b.shelf || '')].join(' ').toLowerCase()
    return hay.includes(q)
  })

  out.sort((a, b) => {
    if (state.sortBy === 'shelf') return (a.shelf ?? 999) - (b.shelf ?? 999) || (a.title || '').localeCompare(b.title || '')
    if (state.sortBy === 'author') return (a.author || '').localeCompare(b.author || '') || (a.title || '').localeCompare(b.title || '')
    return (a.title || '').localeCompare(b.title || '')
  })

  return out
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
      <rect width="600" height="900" fill="#e4e4e7"/>
      <rect x="26" y="26" width="548" height="848" fill="#f4f4f5"/>
      <rect x="60" y="70" width="480" height="12" fill="#d4d4d8"/>
      <text x="60" y="170" font-family="Inter, system-ui" font-size="44" fill="#09090b" font-weight="800">
        ${titleLines}
      </text>
      <text x="60" y="620" font-family="Inter, system-ui" font-size="22" fill="#52525b" font-weight="700">
        ${escapeXml(author)}
      </text>
      <rect x="60" y="700" width="420" height="10" fill="#d4d4d8"/>
      <rect x="60" y="728" width="360" height="10" fill="#d4d4d8"/>
      <rect x="60" y="756" width="400" height="10" fill="#d4d4d8"/>
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
        <p>${state.error}</p>
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
            <span class="header-count">${filtered.length} shown &bull; ${state.books.length} total</span>
          </div>
          <div class="header-controls">
            <div class="search-wrap">
              <input type="text" class="search-input" placeholder="Search title / author / tags" value="${state.q}" data-action="search">
              <button class="search-clear ${state.q ? '' : 'hidden'}" data-action="clear-search">&times;</button>
            </div>
            <select class="select select-tag" data-action="tag">
              <option value="">All tags</option>
              ${allTags.map(t => `<option value="${t}" ${state.tag === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <select class="select select-sort" data-action="sort">
              <option value="title" ${state.sortBy === 'title' ? 'selected' : ''}>Title</option>
              <option value="author" ${state.sortBy === 'author' ? 'selected' : ''}>Author</option>
              <option value="shelf" ${state.sortBy === 'shelf' ? 'selected' : ''}>Shelf</option>
            </select>
            <div class="view-toggle">
              <button class="view-btn ${state.view === 'covers' ? 'active' : ''}" data-action="view" data-view="covers">Covers</button>
              <button class="view-btn ${state.view === 'list' ? 'active' : ''}" data-action="view" data-view="list">List</button>
            </div>
            <button class="btn" data-action="reset">Reset</button>
            ${state.readOnly ? '' : '<button class="btn btn-primary" data-action="add-book">+ Add Book</button>'}
          </div>
        </div>
      </div>
    </div>

    <div id="results">${renderResults(filtered)}</div>
    ${state.drawerOpen ? renderDrawer() : ''}
    ${state.modalOpen ? renderModal() : ''}
    ${state.coverPickerOpen ? renderCoverPicker() : ''}
    ${state.confirmOpen ? renderConfirmDialog() : ''}
    ${state.toast ? renderToast() : ''}
  `

  attachEventListeners()
}

function renderResults(filtered) {
  return state.view === 'covers' ? renderCoversView(filtered) : renderListView(filtered)
}

// Update only the results region so header controls (like the search input) keep focus
function updateResults() {
  const filtered = getFilteredSorted()
  const results = document.querySelector('#results')
  if (results) results.innerHTML = renderResults(filtered)
  const count = document.querySelector('.header-count')
  if (count) count.innerHTML = `${filtered.length} shown &bull; ${state.books.length} total`
  const clearBtn = document.querySelector('[data-action="clear-search"]')
  if (clearBtn) clearBtn.classList.toggle('hidden', !state.q)
}

function renderConfirmDialog() {
  return `
    <div class="modal-backdrop confirm-backdrop">
      <div class="confirm-dialog">
        <h3>${state.confirmTitle}</h3>
        <p>${state.confirmMessage}</p>
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
      ${state.toast.message}
    </div>
  `
}

function renderCoversView(books) {
  return `
    <div class="wall">
      ${books.map(b => `
        <div class="cover-tile" data-action="open-book" data-id="${b.id}">
          <div class="cover-aspect">
            <img class="cover-img" src="${getCoverUrl(b)}" alt="Cover for ${b.title}" loading="lazy"
                 onerror="this.onerror=null; this.src='${generatePlaceholder(b).replace(/'/g, "\\'")}'"
            >
          </div>
          <div class="cover-overlay">
            <div class="cover-info">
              <div class="cover-title">${b.title}</div>
              <div class="cover-author">${b.author || '—'}</div>
              <div class="cover-tags">
                ${(b.tags || []).map(t => `<span class="cover-tag">${t}</span>`).join('')}
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
          <div>Title</div>
          <div>Author</div>
          <div style="text-align:right">Shelf</div>
          <div>Tags</div>
        </div>
        ${books.map(b => `
          <div class="list-row">
            <div class="list-title"><button data-action="open-book" data-id="${b.id}">${b.title}</button></div>
            <div class="list-author">${b.author || '—'}</div>
            <div class="list-shelf">${b.shelf}</div>
            <div class="list-tags">
              ${(b.tags || []).map(t => `<span class="list-tag">${t}</span>`).join('')}
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
            <img class="drawer-cover-img" src="${coverUrl}" alt="Cover for ${b.title}"
                 onerror="this.onerror=null; this.src='${generatePlaceholder(b).replace(/'/g, "\\'")}'"
            >
            ${state.readOnly ? '' : `
            <button class="btn drawer-change-cover" data-action="open-cover-picker" ${state.savingCover ? 'disabled' : ''}>
              ${state.savingCover ? '<span class="loading"></span>' : 'Change Cover'}
            </button>`}
          </div>
          <div class="drawer-details">
            <div class="drawer-title">${b.title}</div>
            <div class="drawer-author">${b.author || '—'}</div>
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
              ${(b.tags || []).map(t => `<span class="drawer-tag">${t}</span>`).join('')}
            </div>
            <div class="drawer-meta">
              Shelf <span>${b.shelf}</span>
              ${b.isbn ? ` &bull; ISBN <span>${b.isbn}</span>` : ''}
            </div>
            <div class="drawer-notes">
              <label class="notes-label">Notes</label>
              <textarea class="notes-input" data-action="notes" placeholder="${state.readOnly ? '' : 'Add your notes...'}" ${state.readOnly ? 'readonly' : ''}>${b.notes || ''}</textarea>
            </div>
            <div class="drawer-links">
              <a class="drawer-link" href="${bookshopLink(b)}" target="_blank" rel="noreferrer">Bookshop.org search &rarr;</a>
              <a class="drawer-link" href="${amazonLink(b)}" target="_blank" rel="noreferrer">Amazon search &rarr;</a>
              <a class="drawer-link" href="${openLibraryLink(b)}" target="_blank" rel="noreferrer">Open Library search &rarr;</a>
            </div>
            ${state.readOnly ? '' : `
            <div class="drawer-actions">
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
          <h2>Choose Cover for "${b.title}"</h2>
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
                    <img src="${opt.thumbUrl || opt.coverUrl}" alt="${opt.title}" loading="lazy"
                         onerror="this.parentElement.classList.add('cover-option-error')">
                  </div>
                  <div class="cover-option-info">
                    <div class="cover-option-title">${opt.title}</div>
                    <div class="cover-option-author">${opt.author || '—'}</div>
                    <div class="cover-option-source">${opt.source}</div>
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
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal-panel" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Add Book</h2>
          <button class="drawer-close" data-action="close-modal">&times;</button>
        </div>
        ${state.modalStatus ? `<div class="status ${state.modalStatus.type}">${state.modalStatus.message}</div>` : ''}
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">ISBN (optional)</label>
            <input type="text" class="form-input" id="add-isbn" placeholder="9780143127741">
            <div class="form-hint">Enter ISBN to auto-fill title & author</div>
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-input" id="add-title" placeholder="The Design of Everyday Things">
          </div>
          <div class="form-group">
            <label class="form-label">Author</label>
            <input type="text" class="form-input" id="add-author" placeholder="Don Norman">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Shelf</label>
              <input type="number" class="form-input" id="add-shelf" value="1" min="1">
            </div>
            <div class="form-group">
              <label class="form-label">Tags</label>
              <input type="text" class="form-input" id="add-tags" placeholder="design, ux">
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="close-modal">Cancel</button>
          <button class="btn" data-action="lookup-isbn" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : ''}Lookup ISBN
          </button>
          <button class="btn btn-primary" data-action="save-book" ${state.modalLoading ? 'disabled' : ''}>
            ${state.modalLoading ? '<span class="loading"></span>' : ''}Add Book
          </button>
        </div>
      </div>
    </div>
  `
}

function attachEventListeners() {
  // Search input
  document.querySelector('[data-action="search"]')?.addEventListener('input', e => {
    state.q = e.target.value
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
    render()
  })

  // Sort select
  document.querySelector('[data-action="sort"]')?.addEventListener('change', e => {
    state.sortBy = e.target.value
    render()
  })

  // View toggle
  document.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view
      render()
    })
  })

  // Reset
  document.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    state.q = ''
    state.tag = ''
    state.sortBy = 'title'
    render()
  })

  // Add book button
  document.querySelector('[data-action="add-book"]')?.addEventListener('click', () => {
    state.modalOpen = true
    state.modalStatus = null
    render()
  })

  // Open book - delegated so results can re-render without re-attaching listeners
  document.querySelector('#results')?.addEventListener('click', e => {
    const el = e.target.closest('[data-action="open-book"]')
    if (!el) return
    const book = state.books.find(b => b.id === el.dataset.id)
    if (book) {
      state.selected = book
      state.drawerOpen = true
      render()
    }
  })

  // Close drawer
  document.querySelectorAll('[data-action="close-drawer"]').forEach(el => {
    el.addEventListener('click', () => {
      state.drawerOpen = false
      state.selected = null
      render()
    })
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

  // Close modal
  document.querySelectorAll('[data-action="close-modal"]').forEach(el => {
    el.addEventListener('click', () => {
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

  // Close cover picker
  document.querySelectorAll('[data-action="close-cover-picker"]').forEach(el => {
    el.addEventListener('click', () => {
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
    const shelf = parseInt(document.getElementById('add-shelf')?.value) || 1
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
      // Create via API
      const newBook = await api.createBook({ title, author, shelf, tags, isbn })

      // Add to local state
      state.books.push(newBook)

      state.modalOpen = false
      state.modalStatus = null
      state.modalLoading = false

      console.log(`✓ Book added: "${newBook.title}"`)
      render()
    } catch (e) {
      state.modalLoading = false
      state.modalStatus = { type: 'error', message: e.message || 'Failed to add book' }
      render()
    }
  })

  // ESC key to close modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.coverPickerOpen) {
        state.coverPickerOpen = false
        state.coverOptions = []
        render()
      } else if (state.modalOpen) {
        state.modalOpen = false
        state.modalStatus = null
        render()
      } else if (state.drawerOpen) {
        state.drawerOpen = false
        state.selected = null
        render()
      }
    }
  })
}

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
