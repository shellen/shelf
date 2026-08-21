// ABOUTME: Single-password session auth. A deterministic HMAC cookie means no
// ABOUTME: session store, so it works across serverless instances.

import crypto from 'crypto'

const SALT = 'bookshelf-auth-v1'
const COOKIE = 'bookshelf_session'

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

function sessionToken(password) {
  const key = crypto.createHash('sha256').update(password + SALT).digest()
  return crypto.createHmac('sha256', key).update('bookshelf-session-v1').digest('hex')
}

function requestCookie(req) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return rest.join('=')
  }
  return null
}

export function authRequired() {
  return !!process.env.BOOKSHELF_PASSWORD
}

// A hosted deploy is reachable by strangers, so an unset password there is a
// misconfiguration rather than the deliberate no-login local setup.
export function isHosted() {
  return !!(process.env.VERCEL || process.env.SHELF_HOSTED)
}

export function isUnprotected() {
  return isHosted() && !authRequired()
}

export function isWritable(req) {
  const password = process.env.BOOKSHELF_PASSWORD
  if (!password) return true
  const cookie = requestCookie(req)
  return !!cookie && safeEqual(cookie, sessionToken(password))
}

export function verifyPassword(given) {
  const password = process.env.BOOKSHELF_PASSWORD
  return !!password && safeEqual(given, password)
}

export function sessionCookie(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  return `${COOKIE}=${sessionToken(process.env.BOOKSHELF_PASSWORD)}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function clearedCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
}
