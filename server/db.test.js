// @vitest-environment node
// ABOUTME: Tests for database helpers against a throwaway SQLite file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { vi } from 'vitest'

let tmpDir

async function loadDb() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-test-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'test.db')
  vi.resetModules()
  return await import('./db.js')
}

afterEach(() => {
  delete process.env.BOOKSHELF_DB
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = null
})

describe('schema migration', () => {
  it('has no shelf column and has the metadata columns', async () => {
    const mod = await loadDb()
    const cols = mod.default.prepare(`PRAGMA table_info(books)`).all().map(c => c.name)
    expect(cols).not.toContain('shelf')
    for (const c of ['date_read', 'date_added', 'pages', 'year']) expect(cols).toContain(c)
  })

  it('drops the shelf column from a legacy database', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-test-'))
    const dbPath = path.join(tmpDir, 'legacy.db')
    const Database = (await import('better-sqlite3')).default
    const legacy = new Database(dbPath)
    legacy.exec(`
      CREATE TABLE books (id TEXT PRIMARY KEY, shelf INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL, author TEXT, isbn TEXT, cover_url TEXT, rating REAL, notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE book_tags (book_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (book_id, tag));
      CREATE INDEX idx_books_shelf ON books(shelf);
      INSERT INTO books (id, shelf, title) VALUES ('s1-old', 3, 'Old Book');
    `)
    legacy.close()
    process.env.BOOKSHELF_DB = dbPath
    vi.resetModules()
    const mod = await import('./db.js')
    const cols = mod.default.prepare(`PRAGMA table_info(books)`).all().map(c => c.name)
    expect(cols).not.toContain('shelf')
    expect(mod.getBook('s1-old').title).toBe('Old Book')
  })

  it('round-trips the new metadata fields through saveBook', async () => {
    const { saveBook, getBook } = await loadDb()
    saveBook({ id: 'meta-book', title: 'Meta', tags: [], rating: 4.5, dateRead: '2025-01-15', dateAdded: '2024-12-01', pages: 320, year: 1965 })
    const b = getBook('meta-book')
    expect(b.dateRead).toBe('2025-01-15')
    expect(b.dateAdded).toBe('2024-12-01')
    expect(b.pages).toBe(320)
    expect(b.year).toBe(1965)
    expect(b.shelf).toBeUndefined()
  })
})

describe('generateBookId', () => {
  it('slugifies the title', async () => {
    const { generateBookId } = await loadDb()
    expect(generateBookId('The Design of Everyday Things!')).toBe('the-design-of-everyday-things')
  })
  it('suffixes on collision', async () => {
    const { generateBookId, saveBook } = await loadDb()
    saveBook({ id: 'dune', title: 'Dune', tags: [] })
    expect(generateBookId('Dune')).toBe('dune-2')
    saveBook({ id: 'dune-2', title: 'Dune', tags: [] })
    expect(generateBookId('Dune')).toBe('dune-3')
  })
})

describe('updateBookIsbn', () => {
  it('sets the isbn on a book that has none', async () => {
    const { saveBook, getBook, updateBookIsbn } = await loadDb()
    saveBook({ id: 's1-test', shelf: 1, title: 'Test Book', tags: [] })

    const changed = updateBookIsbn('s1-test', '9780000000001')

    expect(changed).toBe(true)
    expect(getBook('s1-test').isbn).toBe('9780000000001')
  })

  it('returns false for an unknown book', async () => {
    const { updateBookIsbn } = await loadDb()
    expect(updateBookIsbn('nope', '9780000000001')).toBe(false)
  })
})
