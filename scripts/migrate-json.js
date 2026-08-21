#!/usr/bin/env node
// ABOUTME: Imports books.json entries into the database via the shared db layer.
// ABOUTME: Existing ids are overwritten; the shelf field from old exports is ignored.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { saveBook, getBook } from '../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BOOKS_PATH = path.join(ROOT, 'books.json')

if (!fs.existsSync(BOOKS_PATH)) {
  console.error('❌ books.json not found.')
  process.exit(1)
}

const { books } = JSON.parse(fs.readFileSync(BOOKS_PATH, 'utf-8'))
let inserted = 0
let updated = 0

for (const book of books) {
  const existing = await getBook(book.id)
  await saveBook({
    id: book.id,
    title: book.title,
    author: book.author || null,
    isbn: book.isbn || null,
    coverUrl: book.coverUrl || null,
    tags: book.tags || []
  })
  if (existing) updated++
  else inserted++
}

console.log(`✅ Migration complete! ${inserted} inserted, ${updated} updated, ${books.length} total`)
