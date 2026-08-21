// @vitest-environment node
// ABOUTME: Hosted setup drives two CLIs we cannot run here, so the flow is
// ABOUTME: exercised against a fake executor that records what it was asked.

import { describe, it, expect } from 'vitest'
import { runSetup, parseArgs, looksLikeEmail } from './setup-vercel.js'

// Stands in for turso and vercel, answering the way the real tools do.
function fakeCli({ dbExists = false, missing = [] } = {}) {
  const calls = []
  const exec = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, input: opts.input })
    if (missing.includes(cmd)) throw new Error(`spawn ${cmd} ENOENT`)
    const line = `${cmd} ${args.join(' ')}`
    if (line.startsWith('turso db create') && dbExists) {
      throw new Error('turso db failed (exit 1): database "shelf" already exists')
    }
    if (line.includes('db show')) return 'libsql://shelf-shellen.turso.io\n'
    if (line.includes('tokens create')) return 'ey.a-real-looking-token\n'
    if (line.startsWith('vercel env rm')) throw new Error('env var not found')
    return ''
  }
  return { exec, calls }
}

const base = { log: () => {}, prompt: async () => 'shellen@gmail.com', dbName: 'shelf', deploy: true }
const envCall = (calls, key) => calls.find(c => c.args.join(' ') === `env add ${key} production`)

describe('runSetup', () => {
  it('creates the database, sets all four variables, then deploys', async () => {
    const { exec, calls } = fakeCli()
    const result = await runSetup({ ...base, exec, email: 'shellen@gmail.com' })

    expect(calls.some(c => c.args.join(' ') === 'db create shelf')).toBe(true)
    for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SHELF_OWNER_EMAIL', 'SHELF_PASSWORD']) {
      expect(envCall(calls, key), `${key} was never set`).toBeTruthy()
    }
    expect(calls.at(-1)).toMatchObject({ cmd: 'vercel', args: ['--prod'] })
    expect(result).toMatchObject({ url: 'libsql://shelf-shellen.turso.io', deployed: true })
  })

  it('passes secrets through stdin, never as command arguments', async () => {
    const { exec, calls } = fakeCli()
    await runSetup({ ...base, exec, email: 'shellen@gmail.com', password: 'super-secret' })

    expect(envCall(calls, 'SHELF_PASSWORD').input).toBe('super-secret')
    expect(envCall(calls, 'TURSO_AUTH_TOKEN').input).toBe('ey.a-real-looking-token')
    // A secret in argv would be visible to anyone who can list processes.
    const everyArgument = calls.flatMap(c => c.args).join(' ')
    expect(everyArgument).not.toContain('super-secret')
    expect(everyArgument).not.toContain('ey.a-real-looking-token')
  })

  it('carries on when the database already exists', async () => {
    const { exec, calls } = fakeCli({ dbExists: true })
    await runSetup({ ...base, exec, email: 'shellen@gmail.com' })
    expect(envCall(calls, 'TURSO_DATABASE_URL').input).toBe('libsql://shelf-shellen.turso.io')
  })

  it('clears an existing variable before setting it, so re-running works', async () => {
    const { exec, calls } = fakeCli()
    await runSetup({ ...base, exec, email: 'shellen@gmail.com' })
    const rm = calls.findIndex(c => c.args.join(' ') === 'env rm SHELF_PASSWORD production --yes')
    const add = calls.findIndex(c => c.args.join(' ') === 'env add SHELF_PASSWORD production')
    expect(rm).toBeGreaterThan(-1)
    expect(rm).toBeLessThan(add)
  })

  it('generates a password when none is given', async () => {
    const { exec, calls } = fakeCli()
    await runSetup({ ...base, exec, email: 'shellen@gmail.com' })
    expect(envCall(calls, 'SHELF_PASSWORD').input).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('asks for the email when it was not supplied', async () => {
    const { exec, calls } = fakeCli()
    await runSetup({ ...base, exec, prompt: async () => '  Shellen@Gmail.com  ' })
    expect(envCall(calls, 'SHELF_OWNER_EMAIL').input).toBe('Shellen@Gmail.com')
  })

  it('stops before touching anything when a required CLI is absent', async () => {
    const { exec, calls } = fakeCli({ missing: ['turso'] })
    await expect(runSetup({ ...base, exec, email: 'shellen@gmail.com' }))
      .rejects.toThrow(/turso is not installed/)
    expect(calls.some(c => c.cmd === 'vercel')).toBe(false)
  })

  it('rejects an email that is not one, before creating anything', async () => {
    const { exec, calls } = fakeCli()
    await expect(runSetup({ ...base, exec, email: 'not-an-email' })).rejects.toThrow(/does not look like an email/)
    expect(calls.some(c => c.args.includes('create'))).toBe(false)
  })

  it('skips the deploy when asked, and says the setup is not live yet', async () => {
    const { exec, calls } = fakeCli()
    const lines = []
    const result = await runSetup({ ...base, exec, email: 'shellen@gmail.com', deploy: false, log: m => lines.push(m) })
    expect(calls.some(c => c.args.join(' ') === '--prod')).toBe(false)
    expect(result.deployed).toBe(false)
    expect(lines.join('\n')).toMatch(/not deployed/)
  })

  it('runs nothing at all on a dry run', async () => {
    const { exec, calls } = fakeCli()
    await runSetup({ ...base, exec, email: 'shellen@gmail.com', dryRun: true })
    expect(calls).toHaveLength(0)
  })
})

describe('parseArgs', () => {
  it('defaults to the shelf database and a real deploy', () => {
    expect(parseArgs([])).toEqual({ dbName: 'shelf', email: null, password: null, dryRun: false, deploy: true })
  })

  it('accepts both spellings, and the flags', () => {
    expect(parseArgs(['--db', 'books']).dbName).toBe('books')
    expect(parseArgs(['--db=books']).dbName).toBe('books')
    expect(parseArgs(['--email=a@b.co']).email).toBe('a@b.co')
    expect(parseArgs(['--dry-run']).dryRun).toBe(true)
    expect(parseArgs(['--no-deploy']).deploy).toBe(false)
  })

  it('rejects nonsense rather than guessing', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/)
  })
})

describe('looksLikeEmail', () => {
  it('accepts ordinary addresses and rejects the rest', () => {
    expect(looksLikeEmail('shellen@gmail.com')).toBe(true)
    expect(looksLikeEmail('  a@b.co  ')).toBe(true)
    for (const bad of ['', null, 'shellen', 'shellen@', '@gmail.com', 'a b@c.co']) {
      expect(looksLikeEmail(bad), `${bad} should be rejected`).toBe(false)
    }
  })
})
