/**
 * Database connection and helpers
 */

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = process.env.BOOKSHELF_DB || path.join(ROOT, 'data', 'bookshelf.db')

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  console.log('📦 Initializing database...')
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS book_tags (
      book_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (book_id, tag),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
    CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
    CREATE INDEX IF NOT EXISTS idx_book_tags_tag ON book_tags(tag);
  `)
  db.close()
  console.log('✅ Database created')
}

// Run migrations for existing databases
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Migrations for existing databases. Index must go before the column: DROP COLUMN
// fails while idx_books_shelf exists, with an error that also says "no such column".
db.exec('DROP INDEX IF EXISTS idx_books_shelf')
try {
  db.exec('ALTER TABLE books DROP COLUMN shelf')
} catch (e) {
  if (!/no such column/.test(e.message)) throw e
}
for (const col of ['rating REAL', 'notes TEXT', 'date_read TEXT', 'date_added TEXT', 'pages INTEGER', 'year INTEGER']) {
  try {
    db.exec(`ALTER TABLE books ADD COLUMN ${col}`)
  } catch (e) {
    if (!/duplicate column/.test(e.message)) throw e
  }
}

// Helper: get all books with their tags
export function getAllBooks() {
  const books = db.prepare(`
    SELECT id, title, author, isbn, cover_url as coverUrl, rating, notes,
           date_read as dateRead, date_added as dateAdded, pages, year
    FROM books
    ORDER BY title
  `).all()

  // Get tags for each book
  const getTagsStmt = db.prepare('SELECT tag FROM book_tags WHERE book_id = ?')

  return books.map(book => ({
    ...book,
    tags: getTagsStmt.all(book.id).map(r => r.tag)
  }))
}

// Helper: get single book
export function getBook(id) {
  const book = db.prepare(`
    SELECT id, title, author, isbn, cover_url as coverUrl, rating, notes,
           date_read as dateRead, date_added as dateAdded, pages, year
    FROM books WHERE id = ?
  `).get(id)

  if (!book) return null

  const tags = db.prepare('SELECT tag FROM book_tags WHERE book_id = ?')
    .all(id)
    .map(r => r.tag)

  return { ...book, tags }
}

// Helper: create or update book
export function saveBook(book) {
  const insertBook = db.prepare(`
    INSERT OR REPLACE INTO books (id, title, author, isbn, cover_url, rating, notes, date_read, date_added, pages, year, updated_at)
    VALUES (@id, @title, @author, @isbn, @coverUrl, @rating, @notes, @dateRead, @dateAdded, @pages, @year, CURRENT_TIMESTAMP)
  `)

  const deleteTags = db.prepare('DELETE FROM book_tags WHERE book_id = ?')
  const insertTag = db.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag) VALUES (?, ?)')

  const save = db.transaction((b) => {
    insertBook.run({
      id: b.id,
      title: b.title,
      author: b.author || null,
      isbn: b.isbn || null,
      coverUrl: b.coverUrl || null,
      rating: b.rating || null,
      notes: b.notes || null,
      dateRead: b.dateRead || null,
      dateAdded: b.dateAdded || null,
      pages: b.pages || null,
      year: b.year || null
    })

    deleteTags.run(b.id)
    for (const tag of (b.tags || [])) {
      insertTag.run(b.id, tag)
    }

    return getBook(b.id)
  })

  return save(book)
}

// Helper: delete book
export function deleteBook(id) {
  const stmt = db.prepare('DELETE FROM books WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}

// Helper: update book cover
export function updateBookCover(id, coverUrl) {
  const stmt = db.prepare(`
    UPDATE books SET cover_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
  const result = stmt.run(coverUrl, id)
  return result.changes > 0
}

// Helper: unique id from a title slug
export function generateBookId(title) {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'book'
  let id = slug
  let n = 2
  while (getBook(id)) id = `${slug}-${n++}`
  return id
}

const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()

const FILLABLE = ['isbn', 'rating', 'notes', 'dateRead', 'dateAdded', 'pages', 'year']
// (author is intentionally not fillable: it's part of the match key)

// Helper: bulk import with fill-in-blanks merging. Returns {added, filled, skipped}.
export function importBooks(entries, { dryRun = false } = {}) {
  const apply = (items) => {
    let added = 0, filled = 0, skipped = 0
    const existing = getAllBooks()
    const byIsbn = new Map(existing.filter(b => b.isbn).map(b => [String(b.isbn), b]))
    const byKey = new Map(existing.map(b => [normKey(b.title) + '|' + normKey(b.author), b]))

    for (const entry of items) {
      const match = (entry.isbn && byIsbn.get(String(entry.isbn)))
        || byKey.get(normKey(entry.title) + '|' + normKey(entry.author))

      if (!match) {
        if (!entry.title) throw new Error('import row missing title')
        const book = { ...entry, id: dryRun ? normKey(entry.title) : generateBookId(entry.title) }
        if (!dryRun) saveBook(book)
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
        if (!dryRun) saveBook({ ...match, ...updates, tags })
        filled++
      } else {
        skipped++
      }
    }
    return { added, filled, skipped }
  }
  return dryRun ? apply(entries) : db.transaction(apply)(entries)
}

// Helper: set a book's ISBN
export function updateBookIsbn(id, isbn) {
  const stmt = db.prepare(`
    UPDATE books SET isbn = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
  const result = stmt.run(isbn, id)
  return result.changes > 0
}

// Helper: get all tags
export function getAllTags() {
  const results = db.prepare(`
    SELECT DISTINCT tag FROM book_tags ORDER BY tag
  `).all()
  return results.map(r => r.tag)
}

export default db
