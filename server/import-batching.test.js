// @vitest-environment node
// ABOUTME: A full-library import must survive being larger than one request can
// ABOUTME: carry, which is what review text in book notes makes it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir, db

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-import-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'i.db')
  vi.resetModules()
  db = await import('./db.js')
})

afterEach(() => {
  delete process.env.BOOKSHELF_DB
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// One chunk as the browser sends it, each book carrying a long review.
const library = (count, { review = 'x'.repeat(2000) } = {}) =>
  Array.from({ length: count }, (_, i) => ({
    title: `Book ${i}`,
    author: `Author ${i % 40}`,
    notes: review,
    tags: ['to-read', 'owned', `shelf-${i % 12}`]
  }))

describe('importing a library too large for one request', () => {
  it('writes every book of a 250-book chunk with full reviews', async () => {
    const books = library(250)
    expect(JSON.stringify(books).length).toBeGreaterThan(500_000)

    expect(await db.importBooks(books)).toEqual({ added: 250, filled: 0, skipped: 0 })

    const saved = await db.getAllBooks()
    expect(saved).toHaveLength(250)
    expect(saved.every(b => b.notes?.length === 2000)).toBe(true)
    expect(saved.every(b => b.tags.length === 3)).toBe(true)
  })

  it('re-running the same import changes nothing, so a partial run can be retried', async () => {
    const books = library(120)
    await db.importBooks(books)
    expect(await db.importBooks(books)).toEqual({ added: 0, filled: 0, skipped: 120 })
    expect(await db.getAllBooks()).toHaveLength(120)
  })

  it('fills blanks on a second pass without duplicating rows', async () => {
    await db.importBooks([{ title: 'Dune', author: 'Frank Herbert', tags: ['scifi'] }])
    const res = await db.importBooks([{ title: 'Dune', author: 'Frank Herbert', year: 1965, tags: ['classic'] }])

    expect(res).toEqual({ added: 0, filled: 1, skipped: 0 })
    const all = await db.getAllBooks()
    expect(all).toHaveLength(1)
    expect(all[0].year).toBe(1965)
    expect(all[0].tags.sort()).toEqual(['classic', 'scifi'])
  })

  it('touches nothing on a dry run', async () => {
    expect(await db.importBooks(library(80), { dryRun: true })).toEqual({ added: 80, filled: 0, skipped: 0 })
    expect(await db.getAllBooks()).toHaveLength(0)
  })
})
