// ABOUTME: Maps Goodreads library-export CSV rows onto bookshelf book fields.
// ABOUTME: Handles Excel-armored ISBNs, 0-means-unrated, shelf/tag normalization, date formats.

import { parseCsv } from './csv.js'

function cleanIsbn(v) {
  const m = String(v || '').match(/[0-9Xx]{10,13}/)
  return m ? m[0] : null
}

function toIso(v) {
  const m = String(v || '').match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function toPositiveInt(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function mapGoodreadsRow(row) {
  const title = (row['Title'] || '').trim()
  if (!title) return null

  const notes = [row['My Review'], row['Private Notes']]
    .map(s => (s || '').trim()).filter(Boolean).join('\n\n') || null

  const tags = Array.from(new Set(
    [...String(row['Bookshelves'] || '').split(','), row['Exclusive Shelf'] || '']
      .map(t => t.trim().toLowerCase()).filter(Boolean)
  ))

  return {
    title,
    author: (row['Author'] || '').trim() || null,
    isbn: cleanIsbn(row['ISBN13']) || cleanIsbn(row['ISBN']),
    rating: toPositiveInt(row['My Rating']),
    notes,
    tags,
    dateRead: toIso(row['Date Read']),
    dateAdded: toIso(row['Date Added']),
    pages: toPositiveInt(row['Number of Pages']),
    year: toPositiveInt(row['Original Publication Year']) || toPositiveInt(row['Year Published'])
  }
}

export function parseGoodreadsCsv(text) {
  const rows = parseCsv(text)
  const books = []
  const failed = []
  rows.forEach((row, i) => {
    const book = mapGoodreadsRow(row)
    if (book) books.push(book)
    else failed.push(i + 2) // +1 header row, +1 to 1-based
  })
  return { books, failed }
}
