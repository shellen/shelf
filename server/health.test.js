// @vitest-environment node
// ABOUTME: The health probe must tell the owner what the database will actually
// ABOUTME: allow, and must leave no trace of having asked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir, app, server, base

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-health-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'h.db')
  vi.resetModules()
  ;({ app } = await import('./api.js'))
  server = app.listen(0)
  base = `http://127.0.0.1:${server.address().port}`
})

afterEach(() => {
  server?.close()
  delete process.env.BOOKSHELF_DB
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('health probe', () => {
  it('reports a working database as readable and writable', async () => {
    const body = await (await fetch(`${base}/api/health`)).json()
    expect(body.status).toBe('ok')
    expect(body.database).toEqual({ kind: 'file', readable: true, writable: true })
  })

  it('leaves no probe row behind in settings', async () => {
    await fetch(`${base}/api/health`)
    const settings = await (await fetch(`${base}/api/settings`)).json()
    expect(Object.keys(settings)).not.toContain('_probe')
  })

  it('explains a hosted deploy that fell back to a file database', async () => {
    process.env.VERCEL = '1'
    process.env.SHELF_OWNER_EMAIL = 'shellen@gmail.com'
    process.env.SHELF_PASSWORD = 'spice-flow'
    vi.resetModules()
    const { app: hosted } = await import('./api.js')
    const s2 = hosted.listen(0)
    const url = `http://127.0.0.1:${s2.address().port}`
    try {
      const login = await fetch(`${url}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'shellen@gmail.com', password: 'spice-flow' })
      })
      const cookie = login.headers.get('set-cookie').split(';')[0]
      const body = await (await fetch(`${url}/api/health`, { headers: { Cookie: cookie } })).json()
      expect(body.database.kind).toBe('file')
      expect(body.database.hint).toMatch(/TURSO_DATABASE_URL is not set/)
    } finally {
      s2.close()
      delete process.env.VERCEL
      delete process.env.SHELF_OWNER_EMAIL
      delete process.env.SHELF_PASSWORD
    }
  })

  it('says nothing about Turso when running locally on a file', async () => {
    const body = await (await fetch(`${base}/api/health`)).json()
    expect(body.database.hint).toBeUndefined()
  })

  it('withholds the probe from callers who cannot write', async () => {
    process.env.VERCEL = '1'
    vi.resetModules()
    const { app: hosted } = await import('./api.js')
    const s2 = hosted.listen(0)
    try {
      const body = await (await fetch(`http://127.0.0.1:${s2.address().port}/api/health`)).json()
      expect(body.status).toBe('ok')
      expect(body.database).toBeUndefined()
    } finally {
      s2.close()
      delete process.env.VERCEL
    }
  })
})
