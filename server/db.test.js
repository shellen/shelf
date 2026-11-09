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

  it('keeps two albums titled entirely in Japanese apart', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    const albums = [
      { title: '風の谷のナウシカ', author: '久石譲', medium: 'album', tags: [] },
      { title: '天空の城ラピュタ', author: '久石譲', medium: 'album', tags: [] }
    ]
    expect(await importBooks(albums)).toEqual({ added: 2, filled: 0, skipped: 0 })
    expect((await getAllBooks()).map(b => b.title).sort()).toEqual(['天空の城ラピュタ', '風の谷のナウシカ'])
  })

  it('matches a stored item whose name differs only by a Latin accent', async () => {
    const { importBooks, saveBook, getBook } = await loadDb()
    await saveBook({ id: 'homogenic', title: 'Homogenic', author: 'Björk', medium: 'album', tags: [] })
    expect(await importBooks([{ title: 'Homogenic', author: 'Bjork', medium: 'album', year: 1997, tags: [] }]))
      .toEqual({ added: 0, filled: 1, skipped: 0 })
    expect((await getBook('homogenic')).year).toBe(1997)
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

  it('auto-categorizes imports by media tags', async () => {
    const { importBooks, getBook } = await loadDb()
    const base = { author: null, isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }
    await importBooks([
      { ...base, title: 'Project Hail Mary', tags: ['audiobook', 'sci-fi'] },
      { ...base, title: 'Serial', tags: ['podcasts'] },
      { ...base, title: 'Dune Part Two', tags: ['movies', 'sci-fi'] },
      { ...base, title: 'Abbey Road', tags: ['vinyl'] },
      { ...base, title: 'Plain Book', tags: ['fiction'] },
    ])
    expect((await getBook('project-hail-mary')).medium).toBe('audiobook')
    expect((await getBook('serial')).medium).toBe('podcast')
    expect((await getBook('dune-part-two')).medium).toBe('movie')
    expect((await getBook('abbey-road')).medium).toBe('album')
    expect((await getBook('plain-book')).medium).toBe('book')
  })
})

describe('settings', () => {
  it('returns defaults when unset and round-trips values', async () => {
    const { getSettings, saveSettings } = await loadDb()
    expect((await getSettings()).landing).toEqual(['book', 'audiobook', 'movie', 'podcast', 'album'])
    expect((await getSettings()).shelfName).toBe('')
    await saveSettings({ landing: ['album', 'book'], shelfName: "Mary Steiner's Shelf" })
    expect((await getSettings()).landing).toEqual(['album', 'book'])
    expect((await getSettings()).shelfName).toBe("Mary Steiner's Shelf")
  })

  it('ignores unknown media keys on save', async () => {
    const { getSettings, saveSettings } = await loadDb()
    await saveSettings({ landing: ['album', 'vhs', 'book'] })
    expect((await getSettings()).landing).toEqual(['album', 'book'])
  })
})

describe('updateBook', () => {
  async function seeded() {
    const mod = await loadDb()
    await mod.saveBook({ id: 'blue', title: 'Blue', author: 'Joni Mitchell', medium: 'album', coverUrl: 'https://art/blue.jpg', rating: 4, tags: ['folk'] })
    await mod.default.execute(`UPDATE books SET created_at = '2020-01-01 00:00:00' WHERE id = 'blue'`)
    return mod
  }

  it('writes only the fields it is given, so a cover saved meanwhile is never put back', async () => {
    const mod = await seeded()
    await mod.default.execute('CREATE TABLE cover_writes (n INTEGER)')
    await mod.default.execute(`CREATE TRIGGER cover_insert AFTER INSERT ON books BEGIN INSERT INTO cover_writes VALUES (1); END`)
    await mod.default.execute(`CREATE TRIGGER cover_update AFTER UPDATE OF cover_url ON books BEGIN INSERT INTO cover_writes VALUES (1); END`)

    const book = await mod.updateBook('blue', { notes: 'A perfect record' })

    expect(book).toMatchObject({ notes: 'A perfect record', coverUrl: 'https://art/blue.jpg', rating: 4, tags: ['folk'] })
    expect((await mod.default.execute('SELECT COUNT(*) AS n FROM cover_writes')).rows[0].n).toBe(0)
    expect((await mod.default.execute(`SELECT created_at FROM books WHERE id = 'blue'`)).rows[0].created_at).toBe('2020-01-01 00:00:00')
  })

  it('replaces the tags only when tags are given', async () => {
    const mod = await seeded()
    expect((await mod.updateBook('blue', { rating: 5 })).tags).toEqual(['folk'])
    expect((await mod.updateBook('blue', { tags: ['jazz', 'canadian'] })).tags.sort()).toEqual(['canadian', 'jazz'])
  })

  it('stores fields the way saveBook does', async () => {
    const mod = await seeded()
    const book = await mod.updateBook('blue', { notes: '', medium: 'vinyl', coverUrl: 'https://art/new.jpg', year: 1971 })
    expect(book).toMatchObject({ notes: null, medium: 'book', coverUrl: 'https://art/new.jpg', year: 1971 })
  })

  it('ignores fields that are not part of an item', async () => {
    const mod = await seeded()
    const book = await mod.updateBook('blue', { id: 'other', createdAt: 'x', title: 'Blue (Remastered)' })
    expect(book).toMatchObject({ id: 'blue', title: 'Blue (Remastered)' })
    expect(await mod.getBook('other')).toBeNull()
  })

  it('returns null for an item that does not exist', async () => {
    const mod = await seeded()
    expect(await mod.updateBook('nope', { notes: 'x' })).toBeNull()
  })

  it('leaves no tags behind for an item that does not exist', async () => {
    const mod = await seeded()
    expect(await mod.updateBook('nope', { tags: ['ghost'] })).toBeNull()
    expect((await mod.default.execute(`SELECT COUNT(*) AS n FROM book_tags WHERE book_id = 'nope'`)).rows[0].n).toBe(0)
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
