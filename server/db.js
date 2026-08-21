/**
 * Database connection and helpers.
 * Backed by libSQL: a local file in dev/tests, Turso when TURSO_DATABASE_URL is set.
 */

import { createClient } from '@libsql/client'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function databaseUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL
  const filePath = process.env.BOOKSHELF_DB || path.join(ROOT, 'data', 'bookshelf.db')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  return `file:${filePath}`
}

const db = createClient({
  url: databaseUrl(),
  authToken: process.env.TURSO_AUTH_TOKEN
})

// Schema bootstrap + migrations, run once per process before the first query.
// Every statement is idempotent so serverless cold starts are safe.
let schemaReady = null

function ensureSchema() {
  if (!schemaReady) schemaReady = migrate()
  return schemaReady
}

async function migrate() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      cover_url TEXT,
      rating REAL,
      notes TEXT,
      date_read TEXT,
      date_added TEXT,
      pages INTEGER,
      year INTEGER,
      medium TEXT NOT NULL DEFAULT 'book',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS book_tags (
      book_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (book_id, tag),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)
  await db.execute('CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)')
  await db.execute('CREATE INDEX IF NOT EXISTS idx_books_author ON books(author)')
  await db.execute('CREATE INDEX IF NOT EXISTS idx_book_tags_tag ON book_tags(tag)')

  // Migrations for pre-existing databases. Index must go before the column:
  // DROP COLUMN fails while idx_books_shelf exists, with an error that also
  // says "no such column".
  await db.execute('DROP INDEX IF EXISTS idx_books_shelf')
  try {
    await db.execute('ALTER TABLE books DROP COLUMN shelf')
  } catch (e) {
    if (!/no such column/.test(e.message)) throw e
  }
  for (const col of ['rating REAL', 'notes TEXT', 'date_read TEXT', 'date_added TEXT', 'pages INTEGER', 'year INTEGER', `medium TEXT NOT NULL DEFAULT 'book'`]) {
    try {
      await db.execute(`ALTER TABLE books ADD COLUMN ${col}`)
    } catch (e) {
      if (!/duplicate column/.test(e.message)) throw e
    }
  }
}

const BOOK_COLUMNS = `id, title, author, isbn, cover_url, rating, notes, date_read, date_added, pages, year, medium`

function rowToBook(r) {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    isbn: r.isbn,
    coverUrl: r.cover_url,
    rating: r.rating,
    notes: r.notes,
    dateRead: r.date_read,
    dateAdded: r.date_added,
    pages: r.pages,
    year: r.year,
    medium: r.medium
  }
}

// Helper: get all books with their tags
export async function getAllBooks() {
  await ensureSchema()
  const books = (await db.execute(`SELECT ${BOOK_COLUMNS} FROM books ORDER BY title`)).rows.map(rowToBook)
  const tagRows = (await db.execute('SELECT book_id, tag FROM book_tags')).rows
  const tagsByBook = new Map()
  for (const r of tagRows) {
    if (!tagsByBook.has(r.book_id)) tagsByBook.set(r.book_id, [])
    tagsByBook.get(r.book_id).push(r.tag)
  }
  return books.map(b => ({ ...b, tags: tagsByBook.get(b.id) || [] }))
}

// Helper: get single book
export async function getBook(id) {
  await ensureSchema()
  const rs = await db.execute({ sql: `SELECT ${BOOK_COLUMNS} FROM books WHERE id = ?`, args: [id] })
  if (!rs.rows.length) return null
  const tags = (await db.execute({ sql: 'SELECT tag FROM book_tags WHERE book_id = ?', args: [id] })).rows.map(r => r.tag)
  return { ...rowToBook(rs.rows[0]), tags }
}

// Statements that write one book (row + tags). Returned rather than executed so
// callers can hand them to db.batch, which is atomic on every libSQL protocol --
// interactive transactions need a stateful connection and fail over plain HTTP.
function bookStatements(b) {
  const stmts = []
  stmts.push({
    sql: `INSERT OR REPLACE INTO books (id, title, author, isbn, cover_url, rating, notes, date_read, date_added, pages, year, medium, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: [
      b.id,
      b.title,
      b.author || null,
      b.isbn || null,
      b.coverUrl || null,
      b.rating || null,
      b.notes || null,
      b.dateRead || null,
      b.dateAdded || null,
      b.pages || null,
      b.year || null,
      MEDIA_KEYS.includes(b.medium) ? b.medium : 'book'
    ]
  })
  stmts.push({ sql: 'DELETE FROM book_tags WHERE book_id = ?', args: [b.id] })
  for (const tag of (b.tags || [])) {
    stmts.push({ sql: 'INSERT OR IGNORE INTO book_tags (book_id, tag) VALUES (?, ?)', args: [b.id, tag] })
  }
  return stmts
}

// Helper: create or update book
export async function saveBook(book) {
  await ensureSchema()
  await db.batch(bookStatements(book), 'write')
  return getBook(book.id)
}

// Helper: delete book
export async function deleteBook(id) {
  await ensureSchema()
  await db.execute({ sql: 'DELETE FROM book_tags WHERE book_id = ?', args: [id] })
  const rs = await db.execute({ sql: 'DELETE FROM books WHERE id = ?', args: [id] })
  return rs.rowsAffected > 0
}

// Helper: update book cover
export async function updateBookCover(id, coverUrl) {
  await ensureSchema()
  const rs = await db.execute({
    sql: 'UPDATE books SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [coverUrl, id]
  })
  return rs.rowsAffected > 0
}

const slugifyTitle = title =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'book'

function nextFreeId(title, taken) {
  const slug = slugifyTitle(title)
  let id = slug
  let n = 2
  while (taken.has(id)) id = `${slug}-${n++}`
  return id
}

// Helper: unique id from a title slug
export async function generateBookId(title) {
  await ensureSchema()
  const taken = new Set((await db.execute('SELECT id FROM books')).rows.map(r => r.id))
  return nextFreeId(title, taken)
}

const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()

const FILLABLE = ['isbn', 'rating', 'notes', 'dateRead', 'dateAdded', 'pages', 'year']
// (author is intentionally not fillable: it's part of the match key)

// Tag names that reveal what an imported item actually is
const MEDIA_TAG_HINTS = {
  audiobook: 'audiobook', audiobooks: 'audiobook', audible: 'audiobook',
  podcast: 'podcast', podcasts: 'podcast',
  movie: 'movie', movies: 'movie', film: 'movie', films: 'movie',
  album: 'album', albums: 'album', vinyl: 'album', records: 'album', music: 'album'
}

function mediumFromTags(tags) {
  for (const tag of (tags || [])) {
    const hit = MEDIA_TAG_HINTS[String(tag).toLowerCase()]
    if (hit) return hit
  }
  return 'book'
}

// Helper: bulk import with fill-in-blanks merging. Returns {added, filled, skipped}.
export async function importBooks(entries, { dryRun = false } = {}) {
  await ensureSchema()
  const existing = await getAllBooks()
  const byIsbn = new Map(existing.filter(b => b.isbn).map(b => [String(b.isbn), b]))
  const byKey = new Map(existing.map(b => [normKey(b.title) + '|' + normKey(b.author), b]))
  const takenIds = new Set(existing.map(b => b.id))

  const pending = []
  let added = 0, filled = 0, skipped = 0

  for (const entry of entries) {
    const match = (entry.isbn && byIsbn.get(String(entry.isbn)))
      || byKey.get(normKey(entry.title) + '|' + normKey(entry.author))

    if (!match) {
      if (!entry.title) throw new Error('import row missing title')
      const book = { ...entry, id: nextFreeId(entry.title, takenIds) }
      if (!book.medium) book.medium = mediumFromTags(entry.tags)
      takenIds.add(book.id)
      pending.push(...bookStatements(book))
      byKey.set(normKey(book.title) + '|' + normKey(book.author), book)
      if (book.isbn) byIsbn.set(String(book.isbn), book)
      added++
      continue
    }

    const updates = {}
    for (const f of FILLABLE) {
      const empty = match[f] === null || match[f] === undefined || match[f] === ''
      if (empty && entry[f] !== null && entry[f] !== undefined) updates[f] = entry[f]
    }
    const tags = Array.from(new Set([...(match.tags || []), ...(entry.tags || [])]))
    const tagsChanged = tags.length !== (match.tags || []).length

    if (Object.keys(updates).length || tagsChanged) {
      pending.push(...bookStatements({ ...match, ...updates, tags }))
      filled++
    } else {
      skipped++
    }
  }

  if (!dryRun && pending.length) await db.batch(pending, 'write')
  return { added, filled, skipped }
}

// Helper: set a book's ISBN
export async function updateBookIsbn(id, isbn) {
  await ensureSchema()
  const rs = await db.execute({
    sql: 'UPDATE books SET isbn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [isbn, id]
  })
  return rs.rowsAffected > 0
}

export const MEDIA_KEYS = ['book', 'audiobook', 'movie', 'podcast', 'album']

// Helper: instance settings (landing = ordered media sections on the landing
// page; shelfName = the display title, e.g. "Mary Steiner's Shelf")
export async function getSettings() {
  await ensureSchema()
  const rs = await db.execute(`SELECT key, value FROM settings WHERE key IN ('landing', 'shelfName')`)
  const stored = Object.fromEntries(rs.rows.map(r => [r.key, r.value]))
  return {
    landing: stored.landing ? JSON.parse(stored.landing) : [...MEDIA_KEYS],
    shelfName: stored.shelfName || ''
  }
}

export async function saveSettings(settings) {
  await ensureSchema()
  if (settings.landing !== undefined) {
    const landing = (settings.landing || []).filter(m => MEDIA_KEYS.includes(m))
    await db.execute({
      sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      args: ['landing', JSON.stringify(landing)]
    })
  }
  if (settings.shelfName !== undefined) {
    await db.execute({
      sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      args: ['shelfName', String(settings.shelfName).slice(0, 60)]
    })
  }
  return getSettings()
}

// Helper: get all tags
export async function getAllTags() {
  await ensureSchema()
  return (await db.execute('SELECT DISTINCT tag FROM book_tags ORDER BY tag')).rows.map(r => r.tag)
}

export default db
