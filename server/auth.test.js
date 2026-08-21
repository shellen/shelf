// @vitest-environment node
// ABOUTME: Auth flow tests: password login, session cookie, write guarding.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { vi } from 'vitest'

let server, base, tmpDir

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-auth-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'auth.db')
  process.env.BOOKSHELF_PASSWORD = 'spice-flow'
  vi.resetModules()
  const { app } = await import('./api.js')
  server = app.listen(0)
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server?.close()
  delete process.env.BOOKSHELF_DB
  delete process.env.BOOKSHELF_PASSWORD
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const post = (url, body, cookie) => fetch(`${base}${url}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body)
})

describe('with BOOKSHELF_PASSWORD set', () => {
  it('reports auth in the session endpoint', async () => {
    const s = await (await fetch(`${base}/api/session`)).json()
    expect(s).toEqual({ authRequired: true, writable: false, unprotected: false })
  })

  it('leaves reads public', async () => {
    expect((await fetch(`${base}/api/books`)).status).toBe(200)
  })

  it('rejects writes without a session', async () => {
    expect((await post('/api/books', { title: 'Nope' })).status).toBe(401)
  })

  it('rejects a wrong password', async () => {
    expect((await post('/api/login', { password: 'wrong' })).status).toBe(401)
  })

  it('logs in, writes with the cookie, and logs out', async () => {
    const login = await post('/api/login', { password: 'spice-flow' })
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie')
    expect(setCookie).toContain('bookshelf_session=')
    expect(setCookie).toContain('HttpOnly')
    const cookie = setCookie.split(';')[0]

    const created = await post('/api/books', { title: 'Authed Book' }, cookie)
    expect(created.status).toBe(201)

    const session = await (await fetch(`${base}/api/session`, { headers: { Cookie: cookie } })).json()
    expect(session.writable).toBe(true)

    const logout = await post('/api/logout', {}, cookie)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('rejects a forged cookie', async () => {
    const res = await post('/api/books', { title: 'Forged' }, 'bookshelf_session=deadbeef')
    expect(res.status).toBe(401)
  })

  it('settings read publicly but write only with a session', async () => {
    const read = await fetch(`${base}/api/settings`)
    expect(read.status).toBe(200)
    expect((await read.json()).landing).toContain('book')

    const denied = await fetch(`${base}/api/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landing: ['album'] })
    })
    expect(denied.status).toBe(401)

    const login = await post('/api/login', { password: 'spice-flow' })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const saved = await fetch(`${base}/api/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ landing: ['album', 'book'] })
    })
    expect((await saved.json()).landing).toEqual(['album', 'book'])
  })
})
