#!/usr/bin/env node
/**
 * Express API server for bookshelf CRUD operations
 */

import express from 'express'
import cors from 'cors'
import { getAllBooks, getBook, saveBook, deleteBook, updateBookCover, getAllTags } from './db.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

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
    const { title, author, shelf, tags, isbn, coverUrl } = req.body

    if (!title) {
      return res.status(400).json({ error: 'Title is required' })
    }

    // Generate ID from shelf and title
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
    const id = `s${shelf || 1}-${slug}`

    // Check for duplicate
    const existing = getBook(id)
    if (existing) {
      return res.status(409).json({ error: 'Book with this ID already exists' })
    }

    const book = saveBook({ id, title, author, shelf: shelf || 1, tags: tags || [], isbn, coverUrl })
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`📚 Bookshelf API running at http://localhost:${PORT}`)
})
