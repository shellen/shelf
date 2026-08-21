// ABOUTME: Owner sign-in: one email + password pair held in the environment.
// ABOUTME: A deterministic HMAC cookie means no session store, so it works
// ABOUTME: across serverless instances.

import crypto from 'crypto'

const SALT = 'bookshelf-auth-v1'
const COOKIE = 'bookshelf_session'

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

const normalizeEmail = email => String(email || '').trim().toLowerCase()

export function ownerEmail() {
  return normalizeEmail(process.env.SHELF_OWNER_EMAIL)
}

// SHELF_PASSWORD is the current name; BOOKSHELF_PASSWORD stays honoured so an
// instance deployed under the old name keeps working.
export function ownerPassword() {
  return process.env.SHELF_PASSWORD || process.env.BOOKSHELF_PASSWORD || ''
}

// Sign-in is configured only when both halves are present. A password with no
// email (or the reverse) is a half-finished setup, not a usable credential.
export function authRequired() {
  return !!(ownerEmail() && ownerPassword())
}

// A hosted deploy is reachable by strangers, so missing credentials there are a
// misconfiguration rather than the deliberate no-login local setup.
export function isHosted() {
  return !!(process.env.VERCEL || process.env.SHELF_HOSTED)
}

// True when a hosted shelf has no usable credentials: writes are refused
// outright, because nobody can sign in to authorise them.
export function isUnprotected() {
  return isHosted() && !authRequired()
}

// The token binds both halves, so changing either signs existing sessions out.
function sessionToken(email, password) {
  const key = crypto.createHash('sha256').update(password + SALT).digest()
  return crypto.createHmac('sha256', key).update(`bookshelf-session-v1:${email}`).digest('hex')
}

function requestCookie(req) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return rest.join('=')
  }
  return null
}

export function isWritable(req) {
  // No credentials: open on a local shelf, closed on a hosted one. Failing shut
  // means forgetting to configure sign-in can never expose a public shelf.
  if (!authRequired()) return !isHosted()
  const cookie = requestCookie(req)
  return !!cookie && safeEqual(cookie, sessionToken(ownerEmail(), ownerPassword()))
}

// Both halves are compared even when the email is already wrong, so a caller
// cannot learn which half they got right from how long the answer took.
export function verifyCredentials(givenEmail, givenPassword) {
  if (!authRequired()) return false
  const emailOk = safeEqual(normalizeEmail(givenEmail), ownerEmail())
  const passwordOk = safeEqual(givenPassword, ownerPassword())
  return emailOk && passwordOk
}

export function sessionCookie(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  const token = sessionToken(ownerEmail(), ownerPassword())
  return `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function clearedCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
}
