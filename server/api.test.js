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
    expect(list.books.map(b => b.title)).toEqual(['Dune'])
  })

  it('rejects a payload without a books array', async () => {
    const res = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })
    expect(res.status).toBe(400)
  })
})
