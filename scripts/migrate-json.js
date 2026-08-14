#!/usr/bin/env node
/**
 * Migrate books from books.json to SQLite database
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'bookshelf.db')
const BOOKS_PATH = path.join(ROOT, 'books.json')

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found. Run "npm run db:init" first.')
  process.exit(1)
}

// Check if books.json exists
if (!fs.existsSync(BOOKS_PATH)) {
  console.error('❌ books.json not found.')
  process.exit(1)
}

const db = new Database(DB_PATH)
const booksData = JSON.parse(fs.readFileSync(BOOKS_PATH, 'utf-8'))

// Prepare statements
const insertBook = db.prepare(`
  INSERT OR REPLACE INTO books (id, shelf, title, author, isbn, cover_url)
  VALUES (@id, @shelf, @title, @author, @isbn, @coverUrl)
`)

const insertTag = db.prepare(`
  INSERT OR IGNORE INTO book_tags (book_id, tag)
  VALUES (@bookId, @tag)
`)

const deleteTagsForBook = db.prepare(`
  DELETE FROM book_tags WHERE book_id = ?
`)

// Migrate in a transaction
const migrate = db.transaction((books) => {
  let inserted = 0
  let updated = 0

  for (const book of books) {
    // Check if book exists
    const existing = db.prepare('SELECT id FROM books WHERE id = ?').get(book.id)

    insertBook.run({
      id: book.id,
      shelf: book.shelf || 1,
      title: book.title,
      author: book.author || null,
      isbn: book.isbn || null,
      coverUrl: book.coverUrl || null
    })

    // Update tags
    deleteTagsForBook.run(book.id)
    for (const tag of (book.tags || [])) {
      insertTag.run({ bookId: book.id, tag })
    }

    if (existing) {
      updated++
    } else {
      inserted++
    }
  }

  return { inserted, updated }
})

try {
  const result = migrate(booksData.books)
  console.log(`✅ Migration complete!`)
  console.log(`   ${result.inserted} books inserted`)
  console.log(`   ${result.updated} books updated`)
  console.log(`   Total: ${booksData.books.length} books`)
} catch (e) {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
} finally {
  db.close()
}
