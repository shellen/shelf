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
      shelf INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      cover_url TEXT,
      rating REAL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS book_tags (
      book_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (book_id, tag),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
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

// Add rating and notes columns if they don't exist
try {
  db.exec(`ALTER TABLE books ADD COLUMN rating REAL`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE books ADD COLUMN notes TEXT`)
} catch (e) {
  // Column already exists
}

// Database connection is already open from migrations above

// Helper: get all books with their tags
export function getAllBooks() {
  const books = db.prepare(`
    SELECT id, shelf, title, author, isbn, cover_url as coverUrl, rating, notes
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
    SELECT id, shelf, title, author, isbn, cover_url as coverUrl, rating, notes
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
    INSERT OR REPLACE INTO books (id, shelf, title, author, isbn, cover_url, rating, notes, updated_at)
    VALUES (@id, @shelf, @title, @author, @isbn, @coverUrl, @rating, @notes, CURRENT_TIMESTAMP)
  `)

  const deleteTags = db.prepare('DELETE FROM book_tags WHERE book_id = ?')
  const insertTag = db.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag) VALUES (?, ?)')

  const save = db.transaction((b) => {
    insertBook.run({
      id: b.id,
      shelf: b.shelf || 1,
      title: b.title,
      author: b.author || null,
      isbn: b.isbn || null,
      coverUrl: b.coverUrl || null,
      rating: b.rating || null,
      notes: b.notes || null
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
