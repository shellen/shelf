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
