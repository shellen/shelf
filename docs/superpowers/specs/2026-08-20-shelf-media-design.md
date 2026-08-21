# Shelf: Multi-Media, Shared Cover Sources, OpenGraph Pages

**Date:** 2026-08-20
**Status:** Building from Jason's brief (media + covers + OG + rename)

## Rename

Bookshelf → **Shelf**. Masthead `SHELF*`, `<title>Shelf</title>`, README. Package
name follows; the repo/directory name is untouched.

## Media model

- `books.medium TEXT NOT NULL DEFAULT 'book'` (idempotent migration). Values:
  `book | audiobook | movie | podcast | album`.
- The `author` column stays; its display label varies by medium (Author /
  Author / Director / Host / Artist). No schema churn for per-medium fields —
  year/rating/notes/tags apply everywhere; pages/ISBN render only when present.
- Goodreads import writes `medium: 'book'`.
- A `settings` table (`key TEXT PRIMARY KEY, value TEXT`) holds instance
  configuration. `landing` = ordered array of media keys shown as sections on
  the landing page. Default: all five. Owner-editable (auth-gated PUT).

## Landing page & navigation

- A medium tab strip under the header: `ALL` plus a tab per medium that has
  items. Tabs navigate to `#/medium/<key>` (new route kind — shareable, OG-able).
- `ALL` (the landing view) renders one brutalist section per configured medium,
  in the owner's configured order, heading + wall grid each; media with no
  items are skipped. A single-medium library renders exactly as today.
- Owner config UI: a **Shelf Settings** modal (visible when writable): toggle
  + reorder the landing sections. Persists via `PUT /api/settings`.
- Album/podcast tiles are square (`aspect-ratio: 1`) inside their sections;
  mixed contexts (search results, ALL-view) letterbox square art in the
  standard 2:3 cell via `object-fit: contain`.

## Metadata lookup (add form)

- The Add modal gains a Medium select. Books keep ISBN lookup. Other media get
  a **Lookup** that searches the iTunes Search API — chosen because it covers
  audiobooks, movies, podcasts, and albums with **no API key**, preserving the
  one-click deploy story (TMDB would force every deployer to provision a key).
- Proxied server-side (`GET /api/lookup?medium=&q=`) to avoid CORS and to keep
  a single place for rate limiting/politeness. Returns title, creator, year,
  and artwork URL (100px art upscaled to 600px via Apple's URL convention).

## Covers without storing images

Display-time resolution, never copying bytes to the service:

- `getCoverUrl` becomes a candidate chain walked by the tile's error handler:
  1. stored `coverUrl` (user-picked, iTunes artwork, or user-pasted URL)
  2. local `/covers/<id>.jpg` cache (dev/static builds)
  3. **Open Library covers by ISBN** (`covers.openlibrary.org/b/isbn/<isbn>-L.jpg`)
     — the API's designed hotlink use; free
  4. generated placeholder
- Hosted deployments therefore need no image storage at all: iTunes artwork
  URLs for non-books, Open Library ISBN covers for books, both served from
  their origins.
- The cover picker gains a **paste an image URL** field for hard-to-find art
  (the user's fair-use judgment; we store only the URL and hotlink it).
- Attribution: help overlay + README credit Open Library and Apple as cover
  sources per their usage terms.

## OpenGraph pages

Hash routes are invisible to crawlers, so shared links get real paths:

- Vercel rewrites `/title/*`, `/author/*`, `/tags/*`, `/isbn/*`, `/medium/*`
  to `api/page.js`, which resolves the route against the database (reusing
  `src/routes.js`) and returns a minimal HTML page: OG tags (`og:title`,
  `og:description` — creator/year/rating/count, `og:image` — resolved cover,
  `og:type`, `twitter:card`) plus `<meta http-equiv="refresh">`/JS redirect to
  the app's equivalent `#/` route. Crawlers read the tags; humans bounce to
  the app. Edge-cached (`s-maxage`).
- The app itself links/shares hash URLs as today; `index.html` gets static
  site-level OG tags.
- The static single-file build is unaffected (no server, no OG pages).

## Testing

TDD per slice: medium round-trip + settings in db tests; lookup proxy + settings
auth in API tests; og page builder as a pure function with unit tests; frontend:
tab strip, sectioned landing order, medium in add modal, cover candidate chain,
`#/medium/` route.

## Out of scope

- Per-visitor (as opposed to per-instance) landing preferences.
- TMDB integration, Letterboxd/other importers.
- Uploading image files.
