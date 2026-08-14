#!/usr/bin/env node
/**
 * Express API server for bookshelf CRUD operations
 */

import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { getAllBooks, getBook, saveBook, deleteBook, updateBookCover, getAllTags, generateBookId, importBooks } from './db.js'

export const app = express()
const PORT = 3001

app.use(cors())
// Large limit: a full library export with reviews exceeds the 100kb default
app.use(express.json({ limit: '10mb' }))

// GET /api/books - List all books
app.get('/api/books', (req, res) => {
  try {
    const books = getAllBooks()
    res.json({ books })
  } catch (e) {
    console.error('Error fetching books:', e)
    res.status(500).json({ error: 'Failed to fetch books' })
  }
})

// GET /api/books/:id - Get single book
app.get('/api/books/:id', (req, res) => {
  try {
    const book = getBook(req.params.id)
    if (!book) {
      return res.status(404).json({ error: 'Book not found' })
    }
    res.json(book)
  } catch (e) {
    console.error('Error fetching book:', e)
    res.status(500).json({ error: 'Failed to fetch book' })
  }
})

// POST /api/books - Create new book
app.post('/api/books', (req, res) => {
  try {
    const { title, author, tags, isbn, coverUrl } = req.body

    if (!title) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const book = saveBook({ id: generateBookId(title), title, author, tags: tags || [], isbn, coverUrl })
    res.status(201).json(book)
  } catch (e) {
    console.error('Error creating book:', e)
    res.status(500).json({ error: 'Failed to create book' })
  }
})

// PUT /api/books/:id - Update book
app.put('/api/books/:id', (req, res) => {
  try {
    const existing = getBook(req.params.id)
    if (!existing) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const book = saveBook({ ...existing, ...req.body, id: req.params.id })
    res.json(book)
  } catch (e) {
    console.error('Error updating book:', e)
    res.status(500).json({ error: 'Failed to update book' })
  }
})

// PATCH /api/books/:id/cover - Update just the cover
app.patch('/api/books/:id/cover', (req, res) => {
  try {
    const { coverUrl } = req.body

    const success = updateBookCover(req.params.id, coverUrl)
    if (!success) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const book = getBook(req.params.id)
    res.json(book)
  } catch (e) {
    console.error('Error updating cover:', e)
    res.status(500).json({ error: 'Failed to update cover' })
  }
})

// DELETE /api/books/:id - Delete book
app.delete('/api/books/:id', (req, res) => {
  try {
    const success = deleteBook(req.params.id)
    if (!success) {
      return res.status(404).json({ error: 'Book not found' })
    }
    res.status(204).send()
  } catch (e) {
    console.error('Error deleting book:', e)
    res.status(500).json({ error: 'Failed to delete book' })
  }
})

// GET /api/tags - Get all unique tags
app.get('/api/tags', (req, res) => {
  try {
    const tags = getAllTags()
    res.json({ tags })
  } catch (e) {
    console.error('Error fetching tags:', e)
    res.status(500).json({ error: 'Failed to fetch tags' })
  }
})

// POST /api/import - bulk import with fill-in-blanks merging
app.post('/api/import', (req, res) => {
  try {
    const { books, dryRun } = req.body
    if (!Array.isArray(books)) {
      return res.status(400).json({ error: 'books array is required' })
    }
    res.json(importBooks(books, { dryRun: !!dryRun }))
  } catch (e) {
    console.error('Error importing books:', e)
    res.status(500).json({ error: 'Failed to import books' })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`📚 Bookshelf API running at http://localhost:${PORT}`)
  })
}
