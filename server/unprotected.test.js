// @vitest-environment node
// ABOUTME: A hosted shelf with no credentials must refuse writes and say so,
// ABOUTME: while a local no-login shelf stays open and quiet.

import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const OWNER = 'shellen@gmail.com'

async function withShelf({ hosted, email, password }, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-unprot-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'u.db')
  if (hosted) process.env.VERCEL = '1'; else delete process.env.VERCEL
  if (email) process.env.SHELF_OWNER_EMAIL = email; else delete process.env.SHELF_OWNER_EMAIL
  if (password) process.env.SHELF_PASSWORD = password; else delete process.env.SHELF_PASSWORD
  vi.resetModules()
  const { app } = await import('./api.js')
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    return await fn({
      base,
      session: async () => (await fetch(`${base}/api/session`)).json(),
      write: (body = { title: 'Stranger Book' }) => fetch(`${base}/api/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    })
  } finally {
    server.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

afterEach(() => {
  delete process.env.VERCEL
  delete process.env.SHELF_OWNER_EMAIL
  delete process.env.SHELF_PASSWORD
  delete process.env.BOOKSHELF_DB
})

describe('hosted shelf with no credentials', () => {
  it('refuses anonymous writes instead of allowing them', async () => {
    await withShelf({ hosted: true }, async ({ session, write }) => {
      expect(await session()).toEqual({ authRequired: false, writable: false, unprotected: true })
      const res = await write()
      expect(res.status).toBe(401)
      expect((await res.json()).error).toMatch(/read-only until its owner/i)
    })
  })

  it('refuses reads to nobody: the shelf stays browsable', async () => {
    await withShelf({ hosted: true }, async ({ base }) => {
      expect((await fetch(`${base}/api/books`)).status).toBe(200)
    })
  })

  it('will not hand out a session, since there is nothing to verify against', async () => {
    await withShelf({ hosted: true }, async ({ base }) => {
      const res = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: OWNER, password: 'anything' })
      })
      expect(res.status).toBe(503)
      expect(res.headers.get('set-cookie')).toBeNull()
    })
  })

  it('treats a password with no email as unconfigured', async () => {
    await withShelf({ hosted: true, password: 'spice-flow' }, async ({ session, write }) => {
      expect((await session()).unprotected).toBe(true)
      expect((await write()).status).toBe(401)
    })
  })
})

describe('hosted shelf with credentials', () => {
  it('is protected and quiet', async () => {
    await withShelf({ hosted: true, email: OWNER, password: 'spice-flow' }, async ({ session, write }) => {
      expect(await session()).toEqual({ authRequired: true, writable: false, unprotected: false })
      expect((await write()).status).toBe(401)
    })
  })
})

describe('local shelf with no credentials', () => {
  it('stays writable and quiet, the deliberate laptop setup', async () => {
    await withShelf({ hosted: false }, async ({ session, write }) => {
      expect(await session()).toEqual({ authRequired: false, writable: true, unprotected: false })
      expect((await write()).status).toBe(201)
    })
  })
})
