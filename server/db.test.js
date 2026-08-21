// @vitest-environment node
// ABOUTME: Tests for database helpers against a throwaway SQLite file.

import { describe, it, expect, afterEach } from 'vitest'
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
    await mod.getAllBooks() // force schema bootstrap
    const cols = (await mod.default.execute('PRAGMA table_info(books)')).rows.map(c => c.name)
    expect(cols).not.toContain('shelf')
    for (const c of ['date_read', 'date_added', 'pages', 'year']) expect(cols).toContain(c)
  })

  it('drops the shelf column from a legacy database', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-test-'))
    const dbPath = path.join(tmpDir, 'legacy.db')
    const { createClient } = await import('@libsql/client')
    const legacy = createClient({ url: `file:${dbPath}` })
    await legacy.execute(`
      CREATE TABLE books (id TEXT PRIMARY KEY, shelf INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL, author TEXT, isbn TEXT, cover_url TEXT, rating REAL, notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)
    `)
    await legacy.execute('CREATE TABLE book_tags (book_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (book_id, tag))')
    await legacy.execute('CREATE INDEX idx_books_shelf ON books(shelf)')
    await legacy.execute(`INSERT INTO books (id, shelf, title) VALUES ('s1-old', 3, 'Old Book')`)
    legacy.close()

    process.env.BOOKSHELF_DB = dbPath
    vi.resetModules()
    const mod = await import('./db.js')
    expect((await mod.getBook('s1-old')).title).toBe('Old Book')
    const cols = (await mod.default.execute('PRAGMA table_info(books)')).rows.map(c => c.name)
    expect(cols).not.toContain('shelf')
  })

  it('round-trips the new metadata fields through saveBook', async () => {
    const { saveBook, getBook } = await loadDb()
    await saveBook({ id: 'meta-book', title: 'Meta', tags: [], rating: 4.5, dateRead: '2025-01-15', dateAdded: '2024-12-01', pages: 320, year: 1965 })
    const b = await getBook('meta-book')
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
    expect(await generateBookId('The Design of Everyday Things!')).toBe('the-design-of-everyday-things')
  })
  it('suffixes on collision', async () => {
    const { generateBookId, saveBook } = await loadDb()
    await saveBook({ id: 'dune', title: 'Dune', tags: [] })
    expect(await generateBookId('Dune')).toBe('dune-2')
    await saveBook({ id: 'dune-2', title: 'Dune', tags: [] })
    expect(await generateBookId('Dune')).toBe('dune-3')
  })
})

describe('importBooks', () => {
  const dune = { title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', rating: 5, notes: 'Spice.', tags: ['sci-fi'], dateRead: '2024-07-04', dateAdded: '2023-01-02', pages: 412, year: 1965 }

  it('adds unmatched books with slug ids', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    expect(await importBooks([dune])).toEqual({ added: 1, filled: 0, skipped: 0 })
    const b = (await getAllBooks())[0]
    expect(b.id).toBe('dune')
    expect(b.rating).toBe(5)
  })

  it('fills only blank fields on an ISBN match and unions tags', async () => {
    const { importBooks, saveBook, getBook } = await loadDb()
    await saveBook({ id: 's4-dune', title: 'DUNE (movie tie-in)', isbn: '9780441172719', rating: 3, tags: ['fiction'] })
    expect(await importBooks([dune])).toEqual({ added: 0, filled: 1, skipped: 0 })
    const b = await getBook('s4-dune')
    expect(b.rating).toBe(3)               // non-empty: untouched
    expect(b.title).toBe('DUNE (movie tie-in)') // never overwritten
    expect(b.notes).toBe('Spice.')         // blank: filled
    expect(b.pages).toBe(412)
    expect(b.tags.sort()).toEqual(['fiction', 'sci-fi'])
  })

  it('matches by normalized title+author when there is no ISBN', async () => {
    const { importBooks, saveBook, getBook } = await loadDb()
    await saveBook({ id: 'x', title: 'Dune!', author: 'frank  herbert', tags: [] })
    expect(await importBooks([{ ...dune, isbn: null }])).toEqual({ added: 0, filled: 1, skipped: 0 })
    expect((await getBook('x')).year).toBe(1965)
  })

  it('skips matches with nothing to fill', async () => {
    const { importBooks } = await loadDb()
    await importBooks([dune])
    expect(await importBooks([dune])).toEqual({ added: 0, filled: 0, skipped: 1 })
  })

  it('dry run reports counts without writing', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    expect(await importBooks([dune], { dryRun: true })).toEqual({ added: 1, filled: 0, skipped: 0 })
    expect(await getAllBooks()).toEqual([])
  })

  it('rolls the whole batch back when a row is invalid', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    await expect(importBooks([dune, { author: 'No Title' }])).rejects.toThrow()
    expect(await getAllBooks()).toEqual([])   // first row rolled back too
  })
})

describe('medium', () => {
  it('defaults to book and round-trips other values', async () => {
    const { saveBook, getBook } = await loadDb()
    await saveBook({ id: 'dune', title: 'Dune', tags: [] })
    expect((await getBook('dune')).medium).toBe('book')
    await saveBook({ id: 'abbey-road', title: 'Abbey Road', medium: 'album', tags: [] })
    expect((await getBook('abbey-road')).medium).toBe('album')
  })

  it('imports default to book', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    await importBooks([{ title: 'Dune', author: 'Frank Herbert', isbn: null, rating: null, notes: null, tags: [], dateRead: null, dateAdded: null, pages: null, year: null }])
    expect((await getAllBooks())[0].medium).toBe('book')
  })
})

describe('settings', () => {
  it('returns defaults when unset and round-trips values', async () => {
    const { getSettings, saveSettings } = await loadDb()
    expect((await getSettings()).landing).toEqual(['book', 'audiobook', 'movie', 'podcast', 'album'])
    await saveSettings({ landing: ['album', 'book'] })
    expect((await getSettings()).landing).toEqual(['album', 'book'])
  })

  it('ignores unknown media keys on save', async () => {
    const { getSettings, saveSettings } = await loadDb()
    await saveSettings({ landing: ['album', 'vhs', 'book'] })
    expect((await getSettings()).landing).toEqual(['album', 'book'])
  })
})

describe('updateBookIsbn', () => {
  it('sets the isbn on a book that has none', async () => {
    const { saveBook, getBook, updateBookIsbn } = await loadDb()
    await saveBook({ id: 's1-test', title: 'Test Book', tags: [] })

    const changed = await updateBookIsbn('s1-test', '9780000000001')

    expect(changed).toBe(true)
    expect((await getBook('s1-test')).isbn).toBe('9780000000001')
  })

  it('returns false for an unknown book', async () => {
    const { updateBookIsbn } = await loadDb()
    expect(await updateBookIsbn('nope', '9780000000001')).toBe(false)
  })
})
