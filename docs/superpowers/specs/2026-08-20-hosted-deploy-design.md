# Truly-Free Hosted Deploy (Vercel + Turso)

**Date:** 2026-08-20
**Status:** Approved by Jason ("truly free matters most"; Stage 1 skipped in favor of Stage 2)

## Goal

Anyone can launch their own writable, authed bookshelf with a one-click Vercel deploy
button, backed by Turso's free tier. Local dev stays file-based and zero-config.

## Database layer

Replace `better-sqlite3` with `@libsql/client` — one async client for both worlds:

- `TURSO_DATABASE_URL` env selects the backend: unset → `file:data/bookshelf.db`
  (local dev, tests); `libsql://...` → hosted Turso. `TURSO_AUTH_TOKEN` for remote.
- The `BOOKSHELF_DB` env override (used by tests) keeps working: it maps to
  `file:<path>`.
- All `server/db.js` exports become async; call sites (`server/api.js` handlers,
  the Vite virtual data module, `scripts/fetch-covers.js`, `scripts/migrate-json.js`,
  tests) await them. `scripts/init-db.js` is deleted — schema bootstrap is automatic.
- Schema bootstrap + migrations run lazily once per process via a memoized
  `ensureSchema()` awaited before the first query. All statements are idempotent
  (`CREATE TABLE IF NOT EXISTS`, guarded `ALTER TABLE`) so cold starts are safe.
- `importBooks` uses an interactive libsql transaction (`client.transaction('write')`).
- `better-sqlite3` is removed from dependencies.

## Auth

- `BOOKSHELF_PASSWORD` env. Unset → app is writable with no login (local dev
  unchanged). Set → reads stay public, writes require a session.
- `POST /api/login {password}` → on match, sets an HttpOnly SameSite=Lax cookie
  whose value is `HMAC-SHA256(sha256(password + fixed salt), "bookshelf-session-v1")`
  — deterministic across serverless instances, no session store needed.
  `POST /api/logout` clears it. `GET /api/session` → `{ authRequired, writable }`.
- Middleware guards mutating methods on `/api/*` (except `/api/login`) with 401
  when a password is configured and the cookie is absent/invalid.
  Comparisons use `crypto.timingSafeEqual`.
- Frontend: `init()` fetches `/api/session`. Password set + not logged in →
  reuse the existing `readOnly` affordance-hiding, plus a LOG IN header button
  opening a brutalist password modal; success re-checks the session and unlocks.
  LOG OUT appears in the header when writable-by-login.

## Vercel packaging

- `api/index.js` exports the Express `app` (already exported for tests) as the
  serverless handler; `vercel.json` rewrites `/api/(.*)` to it and serves the
  Vite build (`dist/`) statically.
- The build-time embedded data module works unchanged (its `load()` hook is
  already async); on Vercel builds it reads from Turso.
- Covers: `public/covers/` ships with the repo/build; remote cover URLs (the
  cover picker, Goodreads-imported books) work everywhere. `fetch-covers`
  remains a local CLI concern.

## Deploy story (README)

1. Create a free Turso account + database (`turso db create bookshelf`), copy
   URL + token. No card.
2. Click "Deploy with Vercel" (button pre-fills `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`, `BOOKSHELF_PASSWORD` prompts). No card.
3. Open the app, log in, import a Goodreads CSV.

Requires the repo to be public on GitHub for the clone URL (button holds a
placeholder until then).

## Testing

Existing suites converted to async DB calls; new tests: auth middleware
(401 on writes without cookie, login sets/clears session, no-password mode
writable), session endpoint, frontend login flow (modal → unlock).

## Out of scope

- Multi-user accounts/OAuth (single shared password by design).
- Cover file uploads on hosted instances.
- Stage 1 (Docker/Railway) — dropped per Jason.
