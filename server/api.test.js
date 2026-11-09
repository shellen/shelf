// @vitest-environment node
// ABOUTME: Endpoint tests running the Express app on an ephemeral port
// ABOUTME: against a throwaway SQLite database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let server, base, tmpDir

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-api-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'api.db')
  const { app } = await import('./api.js')
  server = app.listen(0)
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server?.close()
  delete process.env.BOOKSHELF_DB
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/books media', () => {
  it('passes medium and year through', async () => {
    const res = await fetch(`${base}/api/books`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Abbey Road', author: 'The Beatles', medium: 'album', year: 1969, coverUrl: 'https://art/x.jpg' })
    })
    expect(res.status).toBe(201)
    const book = await res.json()
    expect(book.medium).toBe('album')
    expect(book.year).toBe(1969)
  })
})

describe('POST /api/import', () => {
  const dune = { title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', rating: 5, notes: null, tags: ['sci-fi'], dateRead: null, dateAdded: null, pages: 412, year: 1965 }

  it('imports and reports counts', async () => {
    const res = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books: [dune] })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 1, filled: 0, skipped: 0 })
    const list = await (await fetch(`${base}/api/books`)).json()
    expect(list.books.map(b => b.title)).toContain('Dune')
  })

  it('rejects a payload without a books array', async () => {
    const res = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/books/:id', () => {
  const json = { 'Content-Type': 'application/json' }

  it('changes only the fields sent, leaving the rest of the row as it was', async () => {
    const { default: db } = await import('./db.js')
    const created = await (await fetch(`${base}/api/books`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ title: 'Blue', author: 'Joni Mitchell', medium: 'album', coverUrl: 'https://art/blue.jpg' })
    })).json()
    await db.execute({ sql: `UPDATE books SET created_at = '2020-01-01 00:00:00' WHERE id = ?`, args: [created.id] })

    const res = await fetch(`${base}/api/books/${created.id}`, { method: 'PUT', headers: json, body: JSON.stringify({ notes: 'A perfect record' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ notes: 'A perfect record', coverUrl: 'https://art/blue.jpg' })
    const row = (await db.execute({ sql: 'SELECT created_at FROM books WHERE id = ?', args: [created.id] })).rows[0]
    expect(row.created_at).toBe('2020-01-01 00:00:00')
  })

  it('accepts a request with no body, changing nothing', async () => {
    const created = await (await fetch(`${base}/api/books`, {
      method: 'POST', headers: json, body: JSON.stringify({ title: 'Court and Spark', medium: 'album' })
    })).json()
    const res = await fetch(`${base}/api/books/${created.id}`, { method: 'PUT' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ title: 'Court and Spark', medium: 'album' })
  })

  it('answers 404 for an item that does not exist', async () => {
    const res = await fetch(`${base}/api/books/nope`, { method: 'PUT', headers: json, body: JSON.stringify({ notes: 'x' }) })
    expect(res.status).toBe(404)
  })
})
