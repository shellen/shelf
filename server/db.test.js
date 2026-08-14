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
