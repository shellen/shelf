#!/usr/bin/env node
/**
 * Express API server for bookshelf CRUD operations
 */

import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { getAllBooks, getBook, saveBook, deleteBook, updateBookCover, getAllTags, generateBookId, importBooks } from './db.js'
import { authRequired, isWritable, verifyPassword, sessionCookie, clearedCookie } from './auth.js'

export const app = express()
const PORT = 3001

app.set('trust proxy', 1)
app.use(cors())
// Large limit: a full library export with reviews exceeds the 100kb default
app.use(express.json({ limit: '10mb' }))

// Reads are public; writes need a session when a password is configured
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.path === '/login' || req.path === '/logout') return next()
  if (!isWritable(req)) return res.status(401).json({ error: 'Login required' })
  next()
})

// GET /api/session - Auth status
app.get('/api/session', (req, res) => {
  res.json({ authRequired: authRequired(), writable: isWritable(req) })
})

// POST /api/login - Start a session
app.post('/api/login', (req, res) => {
  if (!authRequired()) return res.json({ ok: true })
  if (!verifyPassword(String(req.body?.password || ''))) {
    return res.status(401).json({ error: 'Wrong password' })
  }
  res.setHeader('Set-Cookie', sessionCookie(req))
  res.json({ ok: true })
})

// POST /api/logout - End the session
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearedCookie())
  res.json({ ok: true })
})

// GET /api/books - List all books
app.get('/api/books', async (req, res) => {
  try {
    const books = await getAllBooks()
    res.json({ books })
  } catch (e) {
    console.error('Error fetching books:', e)
    res.status(500).json({ error: 'Failed to fetch books' })
  }
})

// GET /api/books/:id - Get single book
app.get('/api/books/:id', async (req, res) => {
  try {
    const book = await getBook(req.params.id)
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
app.post('/api/books', async (req, res) => {
  try {
    const { title, author, tags, isbn, coverUrl } = req.body

    if (!title) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const book = await saveBook({ id: await generateBookId(title), title, author, tags: tags || [], isbn, coverUrl })
    res.status(201).json(book)
  } catch (e) {
    console.error('Error creating book:', e)
    res.status(500).json({ error: 'Failed to create book' })
  }
})

// PUT /api/books/:id - Update book
app.put('/api/books/:id', async (req, res) => {
  try {
    const existing = await getBook(req.params.id)
    if (!existing) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const book = await saveBook({ ...existing, ...req.body, id: req.params.id })
    res.json(book)
  } catch (e) {
    console.error('Error updating book:', e)
    res.status(500).json({ error: 'Failed to update book' })
  }
})

// PATCH /api/books/:id/cover - Update just the cover
app.patch('/api/books/:id/cover', async (req, res) => {
  try {
    const { coverUrl } = req.body

    const success = await updateBookCover(req.params.id, coverUrl)
    if (!success) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const book = await getBook(req.params.id)
    res.json(book)
  } catch (e) {
    console.error('Error updating cover:', e)
    res.status(500).json({ error: 'Failed to update cover' })
  }
})

// DELETE /api/books/:id - Delete book
app.delete('/api/books/:id', async (req, res) => {
  try {
    const success = await deleteBook(req.params.id)
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
app.get('/api/tags', async (req, res) => {
  try {
    const tags = await getAllTags()
    res.json({ tags })
  } catch (e) {
    console.error('Error fetching tags:', e)
    res.status(500).json({ error: 'Failed to fetch tags' })
  }
})

// POST /api/import - bulk import with fill-in-blanks merging
app.post('/api/import', async (req, res) => {
  try {
    const { books, dryRun } = req.body
    if (!Array.isArray(books)) {
      return res.status(400).json({ error: 'books array is required' })
    }
    res.json(await importBooks(books, { dryRun: !!dryRun }))
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
