// @vitest-environment node
// ABOUTME: A hosted deploy with no password must announce itself as unprotected,
// ABOUTME: while a local no-password shelf stays quiet.

import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

async function session({ hosted, password }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-unprot-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'u.db')
  if (hosted) process.env.VERCEL = '1'; else delete process.env.VERCEL
  if (password) process.env.BOOKSHELF_PASSWORD = password; else delete process.env.BOOKSHELF_PASSWORD
  vi.resetModules()
  const { app } = await import('./api.js')
  const server = app.listen(0)
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/session`)
  const body = await res.json()
  server.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  return body
}

afterEach(() => {
  delete process.env.VERCEL
  delete process.env.BOOKSHELF_PASSWORD
  delete process.env.BOOKSHELF_DB
})

describe('unprotected deploy detection', () => {
  it('flags a hosted shelf with no password', async () => {
    expect(await session({ hosted: true, password: null }))
      .toEqual({ authRequired: false, writable: true, unprotected: true })
  })

  it('stays quiet once the hosted shelf has a password', async () => {
    const s = await session({ hosted: true, password: 'spice-flow' })
    expect(s.unprotected).toBe(false)
    expect(s.authRequired).toBe(true)
  })

  it('stays quiet for a local no-password shelf', async () => {
    const s = await session({ hosted: false, password: null })
    expect(s.unprotected).toBe(false)
    expect(s.writable).toBe(true)
  })
})
