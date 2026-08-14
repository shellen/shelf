# Goodreads Import, Metadata Sorting, Brutalist Redesign, Keyboard Shortcuts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the shelf-number concept in favor of rich sortable metadata, import Goodreads CSV exports through an in-app modal with fill-in-blanks merging, restyle the app as a brutalist print zine, and add core+power keyboard shortcuts.

**Architecture:** Backend stays Express + better-sqlite3 with idempotent in-file migrations; a new bulk `/api/import` endpoint owns merge semantics inside one transaction (with a dry-run mode reused for the preview). Frontend stays a single vanilla-JS render loop; new pure modules `src/csv.js` and `src/goodreads.js` handle parsing/mapping and are unit-tested in isolation. The redesign is a `style.css` rewrite plus small template tweaks — DOM structure and class names are preserved so existing tests keep passing.

**Tech Stack:** Vanilla JS, Vite (+ vite-plugin-singlefile, existing virtual data module), Express, better-sqlite3, Vitest + happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-14-import-redesign-shortcuts-design.md`

**Verification baseline:** `npm test` currently passes 13 tests. It must pass (with updated expectations) after every task.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/db.js` (modify) | Schema migration (drop shelf, add metadata), `generateBookId`, `importBooks` merge logic |
| `server/db.test.js` (modify) | Migration, id, and merge tests against throwaway DB |
| `server/api.js` (modify) | Export `app`; guard `listen`; shelf-free `POST /api/books`; new `POST /api/import` |
| `server/api.test.js` (create) | Endpoint tests via `app.listen(0)` + fetch |
| `src/csv.js` (create) | RFC-4180 CSV parser, header-keyed rows |
| `src/csv.test.js` (create) | Parser edge cases |
| `src/goodreads.js` (create) | Goodreads row → book mapping, whole-file parse with failure rows |
| `src/goodreads.test.js` (create) | Mapping edge cases |
| `src/main.js` (modify) | Shelf removal, sort config + direction, import modal, shortcuts, status bar |
| `src/main.test.js` (modify) | Updated fixtures + new behavior tests |
| `src/style.css` (rewrite) | Brutalist design system |
| `index.html` (modify) | Inter 900 weight |
| `README.md` (modify) | Sync docs |

---

### Task 0: Feature branch

- [ ] **Step 0.1:** Commit the pending `.gitignore` change (`.superpowers/` entry) if still uncommitted: `git add .gitignore && git commit -m "Ignore brainstorm session artifacts"`
- [ ] **Step 0.2:** `cd "/Users/shellen/Documents/Claude Stuff/bookshelf" && git checkout -b feat/import-redesign-shortcuts`

---

### Task 1: Schema migration — drop shelf, add metadata columns

**Files:** Modify `server/db.js`, `server/db.test.js`

- [ ] **Step 1.1: Write failing tests** — append to `server/db.test.js`:

```js
describe('schema migration', () => {
  it('has no shelf column and has the metadata columns', async () => {
    const mod = await loadDb()
    const cols = mod.default.prepare(`PRAGMA table_info(books)`).all().map(c => c.name)
    expect(cols).not.toContain('shelf')
    for (const c of ['date_read', 'date_added', 'pages', 'year']) expect(cols).toContain(c)
  })

  it('drops the shelf column from a legacy database', async () => {
    // Build a legacy-shaped DB first, then reload the module against it
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-test-'))
    const dbPath = path.join(tmpDir, 'legacy.db')
    const Database = (await import('better-sqlite3')).default
    const legacy = new Database(dbPath)
    legacy.exec(`
      CREATE TABLE books (id TEXT PRIMARY KEY, shelf INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL, author TEXT, isbn TEXT, cover_url TEXT, rating REAL, notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE book_tags (book_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (book_id, tag));
      CREATE INDEX idx_books_shelf ON books(shelf);
      INSERT INTO books (id, shelf, title) VALUES ('s1-old', 3, 'Old Book');
    `)
    legacy.close()
    process.env.BOOKSHELF_DB = dbPath
    vi.resetModules()
    const mod = await import('./db.js')
    const cols = mod.default.prepare(`PRAGMA table_info(books)`).all().map(c => c.name)
    expect(cols).not.toContain('shelf')
    expect(mod.getBook('s1-old').title).toBe('Old Book')
  })

  it('round-trips the new metadata fields through saveBook', async () => {
    const { saveBook, getBook } = await loadDb()
    saveBook({ id: 'meta-book', title: 'Meta', tags: [], rating: 4.5, dateRead: '2025-01-15', dateAdded: '2024-12-01', pages: 320, year: 1965 })
    const b = getBook('meta-book')
    expect(b.dateRead).toBe('2025-01-15')
    expect(b.dateAdded).toBe('2024-12-01')
    expect(b.pages).toBe(320)
    expect(b.year).toBe(1965)
    expect(b.shelf).toBeUndefined()
  })
})
```

- [ ] **Step 1.2:** Run `npx vitest run server/db.test.js` — expect the three new tests FAIL (shelf still present / unknown columns).
- [ ] **Step 1.3: Implement in `server/db.js`.** (a) In the fresh-DB bootstrap `CREATE TABLE books`, remove `shelf INTEGER NOT NULL DEFAULT 1`, remove `CREATE INDEX ... idx_books_shelf`, and add the four new columns (`date_read TEXT, date_added TEXT, pages INTEGER, year INTEGER`). (b) Replace the rating/notes try/catch migration block with:

```js
// Migrations for existing databases. Index must go before the column: DROP COLUMN
// fails while idx_books_shelf exists, with an error that also says "no such column".
db.exec('DROP INDEX IF EXISTS idx_books_shelf')
try {
  db.exec('ALTER TABLE books DROP COLUMN shelf')
} catch (e) {
  if (!/no such column/.test(e.message)) throw e
}
for (const col of ['rating REAL', 'notes TEXT', 'date_read TEXT', 'date_added TEXT', 'pages INTEGER', 'year INTEGER']) {
  try {
    db.exec(`ALTER TABLE books ADD COLUMN ${col}`)
  } catch (e) {
    if (!/duplicate column/.test(e.message)) throw e
  }
}
```

(c) Update both SELECTs (`getAllBooks`, `getBook`) to `SELECT id, title, author, isbn, cover_url as coverUrl, rating, notes, date_read as dateRead, date_added as dateAdded, pages, year`, dropping `shelf`, and update `ORDER BY title` stays. (d) Update `saveBook`'s INSERT to the new column list (`@dateRead` → `date_read` etc.), delete the `shelf` line, and default the new fields to null via `b.dateRead || null` etc.

- [ ] **Step 1.4:** `npx vitest run server/db.test.js` — all pass.
- [ ] **Step 1.5:** `npm test` — frontend tests still pass (fixtures may carry a stray `shelf` key; that's harmless until Task 6). Note: `main.test.js` asserts `add-shelf` input — it will still pass because the modal is unchanged so far.
- [ ] **Step 1.6:** Commit: `git add server/db.js server/db.test.js && git commit -m "Drop shelf column, add date_read/date_added/pages/year metadata"`

---

### Task 2: `generateBookId` — slug ids with collision suffixes

**Files:** Modify `server/db.js`, `server/db.test.js`, `server/api.js`

- [ ] **Step 2.1: Failing tests** (`server/db.test.js`):

```js
describe('generateBookId', () => {
  it('slugifies the title', async () => {
    const { generateBookId } = await loadDb()
    expect(generateBookId('The Design of Everyday Things!')).toBe('the-design-of-everyday-things')
  })
  it('suffixes on collision', async () => {
    const { generateBookId, saveBook } = await loadDb()
    saveBook({ id: 'dune', title: 'Dune', tags: [] })
    expect(generateBookId('Dune')).toBe('dune-2')
    saveBook({ id: 'dune-2', title: 'Dune', tags: [] })
    expect(generateBookId('Dune')).toBe('dune-3')
  })
})
```

- [ ] **Step 2.2:** Run — FAIL (`generateBookId is not a function`).
- [ ] **Step 2.3: Implement** in `server/db.js`:

```js
// Helper: unique id from a title slug
export function generateBookId(title) {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'book'
  let id = slug
  let n = 2
  while (getBook(id)) id = `${slug}-${n++}`
  return id
}
```

- [ ] **Step 2.4:** In `server/api.js` `POST /api/books`: import `generateBookId`, delete the inline slug/`s${shelf}-` lines and the `shelf` destructure/validation, and build the book as `saveBook({ id: generateBookId(title), title, author, tags: tags || [], isbn, coverUrl })`. Delete the 409 duplicate check (collision now auto-suffixes; two same-titled books are legitimate).
- [ ] **Step 2.5:** `npm test` — green. Commit: `"Generate shelf-free book ids with collision suffixes"`

---

### Task 3: CSV parser

**Files:** Create `src/csv.js`, `src/csv.test.js`

- [ ] **Step 3.1: Failing tests** — `src/csv.test.js`:

```js
// ABOUTME: Tests for the RFC-4180 CSV parser.
import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv.js'

describe('parseCsv', () => {
  it('maps rows to objects keyed by header', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })
  it('handles quoted fields with commas', () => {
    expect(parseCsv('a,b\n"x, y",2')[0].a).toBe('x, y')
  })
  it('handles embedded newlines in quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",2')[0].a).toBe('line1\nline2')
  })
  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')[0].a).toBe('say "hi"')
  })
  it('handles CRLF line endings and trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }])
  })
  it('keeps Excel-armored values intact for later cleaning', () => {
    expect(parseCsv('isbn\n"=""0143127741"""')[0].isbn).toBe('="0143127741"')
  })
})
```

- [ ] **Step 3.2:** Run `npx vitest run src/csv.test.js` — FAIL (module missing).
- [ ] **Step 3.3: Implement `src/csv.js`:**

```js
// ABOUTME: Minimal RFC-4180 CSV parser producing one object per row,
// ABOUTME: keyed by the header row. Handles quotes, escapes, CRLF, embedded newlines.

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }

  const [header, ...data] = rows
  if (!header) return []
  return data
    .filter(r => r.length > 1 || (r[0] || '') !== '')
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
```

- [ ] **Step 3.4:** Run — all pass. **Step 3.5:** Commit: `"Add RFC-4180 CSV parser"`

---

### Task 4: Goodreads row mapping

**Files:** Create `src/goodreads.js`, `src/goodreads.test.js`

- [ ] **Step 4.1: Failing tests** — `src/goodreads.test.js`:

```js
// ABOUTME: Tests for Goodreads CSV row -> book mapping.
import { describe, it, expect } from 'vitest'
import { mapGoodreadsRow, parseGoodreadsCsv } from './goodreads.js'

const ROW = {
  'Title': 'Dune', 'Author': 'Frank Herbert',
  'ISBN': '="0441172717"', 'ISBN13': '="9780441172719"',
  'My Rating': '5', 'Number of Pages': '412',
  'Year Published': '1990', 'Original Publication Year': '1965',
  'Date Read': '2024/07/04', 'Date Added': '2023/01/02',
  'Bookshelves': 'sci-fi, classics', 'Exclusive Shelf': 'read',
  'My Review': 'Spice must flow.', 'Private Notes': 'Reread someday.'
}

describe('mapGoodreadsRow', () => {
  it('maps the full row', () => {
    expect(mapGoodreadsRow(ROW)).toEqual({
      title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719',
      rating: 5, notes: 'Spice must flow.\n\nReread someday.',
      tags: ['sci-fi', 'classics', 'read'],
      dateRead: '2024-07-04', dateAdded: '2023-01-02', pages: 412, year: 1965
    })
  })
  it('treats rating 0 as unrated', () => {
    expect(mapGoodreadsRow({ ...ROW, 'My Rating': '0' }).rating).toBeNull()
  })
  it('falls back to ISBN then null on empty armor', () => {
    expect(mapGoodreadsRow({ ...ROW, 'ISBN13': '=""' }).isbn).toBe('0441172717')
    expect(mapGoodreadsRow({ ...ROW, 'ISBN13': '=""', 'ISBN': '=""' }).isbn).toBeNull()
  })
  it('falls back to Year Published when no original year', () => {
    expect(mapGoodreadsRow({ ...ROW, 'Original Publication Year': '' }).year).toBe(1990)
  })
  it('returns null without a title', () => {
    expect(mapGoodreadsRow({ ...ROW, 'Title': ' ' })).toBeNull()
  })
})

describe('parseGoodreadsCsv', () => {
  it('collects books and 1-based failed row numbers', () => {
    const csv = 'Title,Author\nDune,Frank Herbert\n,Nobody\nFlow,Mihaly'
    const { books, failed } = parseGoodreadsCsv(csv)
    expect(books.map(b => b.title)).toEqual(['Dune', 'Flow'])
    expect(failed).toEqual([3])
  })
})
```

- [ ] **Step 4.2:** Run — FAIL. **Step 4.3: Implement `src/goodreads.js`:**

```js
// ABOUTME: Maps Goodreads library-export CSV rows onto bookshelf book fields.
// ABOUTME: Handles Excel-armored ISBNs, 0-means-unrated, shelf/tag normalization, date formats.

import { parseCsv } from './csv.js'

function cleanIsbn(v) {
  const m = String(v || '').match(/[0-9Xx]{10,13}/)
  return m ? m[0] : null
}

function toIso(v) {
  const m = String(v || '').match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function toPositiveInt(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function mapGoodreadsRow(row) {
  const title = (row['Title'] || '').trim()
  if (!title) return null

  const notes = [row['My Review'], row['Private Notes']]
    .map(s => (s || '').trim()).filter(Boolean).join('\n\n') || null

  const tags = Array.from(new Set(
    [...String(row['Bookshelves'] || '').split(','), row['Exclusive Shelf'] || '']
      .map(t => t.trim().toLowerCase()).filter(Boolean)
  ))

  return {
    title,
    author: (row['Author'] || '').trim() || null,
    isbn: cleanIsbn(row['ISBN13']) || cleanIsbn(row['ISBN']),
    rating: toPositiveInt(row['My Rating']),
    notes,
    tags,
    dateRead: toIso(row['Date Read']),
    dateAdded: toIso(row['Date Added']),
    pages: toPositiveInt(row['Number of Pages']),
    year: toPositiveInt(row['Original Publication Year']) || toPositiveInt(row['Year Published'])
  }
}

export function parseGoodreadsCsv(text) {
  const rows = parseCsv(text)
  const books = []
  const failed = []
  rows.forEach((row, i) => {
    const book = mapGoodreadsRow(row)
    if (book) books.push(book)
    else failed.push(i + 2) // +1 header row, +1 to 1-based
  })
  return { books, failed }
}
```

- [ ] **Step 4.4:** Run — pass. **Step 4.5:** Commit: `"Map Goodreads export rows to book fields"`

---

### Task 5: `importBooks` merge logic (+ dry run)

**Files:** Modify `server/db.js`, `server/db.test.js`

- [ ] **Step 5.1: Failing tests** (`server/db.test.js`):

```js
describe('importBooks', () => {
  const dune = { title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', rating: 5, notes: 'Spice.', tags: ['sci-fi'], dateRead: '2024-07-04', dateAdded: '2023-01-02', pages: 412, year: 1965 }

  it('adds unmatched books with slug ids', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    expect(importBooks([dune])).toEqual({ added: 1, filled: 0, skipped: 0 })
    const b = getAllBooks()[0]
    expect(b.id).toBe('dune')
    expect(b.rating).toBe(5)
  })

  it('fills only blank fields on an ISBN match and unions tags', async () => {
    const { importBooks, saveBook, getBook } = await loadDb()
    saveBook({ id: 's4-dune', title: 'DUNE (movie tie-in)', isbn: '9780441172719', rating: 3, tags: ['fiction'] })
    expect(importBooks([dune])).toEqual({ added: 0, filled: 1, skipped: 0 })
    const b = getBook('s4-dune')
    expect(b.rating).toBe(3)               // non-empty: untouched
    expect(b.title).toBe('DUNE (movie tie-in)') // never overwritten
    expect(b.notes).toBe('Spice.')         // blank: filled
    expect(b.pages).toBe(412)
    expect(b.tags.sort()).toEqual(['fiction', 'sci-fi'])
  })

  it('matches by normalized title+author when there is no ISBN', async () => {
    const { importBooks, saveBook, getBook } = await loadDb()
    saveBook({ id: 'x', title: 'Dune!', author: 'frank  herbert', tags: [] })
    expect(importBooks([{ ...dune, isbn: null }])).toEqual({ added: 0, filled: 1, skipped: 0 })
    expect(getBook('x').year).toBe(1965)
  })

  it('skips matches with nothing to fill', async () => {
    const { importBooks } = await loadDb()
    importBooks([dune])
    expect(importBooks([dune])).toEqual({ added: 0, filled: 0, skipped: 1 })
  })

  it('dry run reports counts without writing', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    expect(importBooks([dune], { dryRun: true })).toEqual({ added: 1, filled: 0, skipped: 0 })
    expect(getAllBooks()).toEqual([])
  })

  it('rolls the whole batch back when a row is invalid', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    expect(() => importBooks([dune, { author: 'No Title' }])).toThrow()
    expect(getAllBooks()).toEqual([])   // first row rolled back too
  })
})
```

- [ ] **Step 5.2:** Run — FAIL. **Step 5.3: Implement** in `server/db.js`:

```js
const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()

const FILLABLE = ['isbn', 'rating', 'notes', 'dateRead', 'dateAdded', 'pages', 'year']
// (author is intentionally not fillable: it's part of the match key — spec'd list only)

// Helper: bulk import with fill-in-blanks merging. Returns {added, filled, skipped}.
export function importBooks(entries, { dryRun = false } = {}) {
  const apply = (items) => {
    let added = 0, filled = 0, skipped = 0
    const existing = getAllBooks()
    const byIsbn = new Map(existing.filter(b => b.isbn).map(b => [String(b.isbn), b]))
    const byKey = new Map(existing.map(b => [normKey(b.title) + '|' + normKey(b.author), b]))

    for (const entry of items) {
      const match = (entry.isbn && byIsbn.get(String(entry.isbn)))
        || byKey.get(normKey(entry.title) + '|' + normKey(entry.author))

      if (!match) {
        if (!entry.title) throw new Error('import row missing title')
        const book = { ...entry, id: dryRun ? normKey(entry.title) : generateBookId(entry.title) }
        if (!dryRun) saveBook(book)
        byKey.set(normKey(book.title) + '|' + normKey(book.author), book)
        if (book.isbn) byIsbn.set(String(book.isbn), book)
        added++
        continue
      }

      const updates = {}
      for (const f of FILLABLE) {
        const empty = match[f] === null || match[f] === undefined || match[f] === ''
        if (empty && entry[f] !== null && entry[f] !== undefined) updates[f] = entry[f]
      }
      const tags = Array.from(new Set([...(match.tags || []), ...(entry.tags || [])]))
      const tagsChanged = tags.length !== (match.tags || []).length

      if (Object.keys(updates).length || tagsChanged) {
        if (!dryRun) saveBook({ ...match, ...updates, tags })
        filled++
      } else {
        skipped++
      }
    }
    return { added, filled, skipped }
  }
  return dryRun ? apply(entries) : db.transaction(apply)(entries)
}
```

- [ ] **Step 5.4:** Run — pass. **Step 5.5:** `npm test` green. Commit: `"Add importBooks with fill-in-blanks merging and dry run"`

---

### Task 6: `/api/import` endpoint (+ make `app` testable)

**Files:** Modify `server/api.js`; create `server/api.test.js`

- [ ] **Step 6.1:** In `server/api.js`: add `import { fileURLToPath } from 'url'`; add `importBooks` to the db import list; `export { app }`; wrap the `app.listen(...)` in `if (process.argv[1] === fileURLToPath(import.meta.url)) { ... }`.
- [ ] **Step 6.2: Failing test** — `server/api.test.js`:

```js
// @vitest-environment node
// ABOUTME: Endpoint tests running the Express app on an ephemeral port
// ABOUTME: against a throwaway SQLite database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let server, base, tmpDir

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-api-'))
  process.env.BOOKSHELF_DB = path.join(tmpDir, 'api.db')
  const { app } = await import('./api.js')
  server = app.listen(0)
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server?.close()
  delete process.env.BOOKSHELF_DB
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/import', () => {
  const dune = { title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', rating: 5, notes: null, tags: ['sci-fi'], dateRead: null, dateAdded: null, pages: 412, year: 1965 }

  it('imports and reports counts', async () => {
    const res = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books: [dune] })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 1, filled: 0, skipped: 0 })
    const list = await (await fetch(`${base}/api/books`)).json()
    expect(list.books.map(b => b.title)).toEqual(['Dune'])
  })

  it('rejects a payload without a books array', async () => {
    const res = await fetch(`${base}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 6.3:** Run `npx vitest run server/api.test.js` — FAIL (404). **Step 6.4: Implement** in `server/api.js` (before the health check):

```js
// POST /api/import - bulk import with fill-in-blanks merging
app.post('/api/import', (req, res) => {
  try {
    const { books, dryRun } = req.body
    if (!Array.isArray(books)) {
      return res.status(400).json({ error: 'books array is required' })
    }
    res.json(importBooks(books, { dryRun: !!dryRun }))
  } catch (e) {
    console.error('Error importing books:', e)
    res.status(500).json({ error: 'Failed to import books' })
  }
})
```

Also raise the JSON body limit: `app.use(express.json({ limit: '10mb' }))` (a big library export with reviews exceeds Express's 100kb default).

- [ ] **Step 6.5:** Run — pass; `npm test` green. Commit: `"Add /api/import bulk endpoint"`

---

### Task 7: Frontend shelf removal + metadata drawer line

**Files:** Modify `src/main.js`, `src/main.test.js`

- [ ] **Step 7.1: Update tests first** (`src/main.test.js`): remove `shelf` from the `BOOKS`/`HOSTILE` fixtures (add `dateRead: null, dateAdded: null, pages: null, year: null`; give Dune `year: 1965, pages: 412, rating: 5`); delete the `add-shelf` assertions in the edit test; in the list-sorting test the author-header click stays. Add:

```js
it('shows metadata instead of shelf in the drawer', async () => {
  await loadApp()
  document.querySelector('[data-id="s2-dune"]').click()
  const meta = document.querySelector('.drawer-meta').textContent
  expect(meta).not.toContain('Shelf')
  expect(meta).toContain('1965')
  expect(meta).toContain('412')
})
```

- [ ] **Step 7.2:** Run — new/changed tests FAIL. **Step 7.3: Implement** in `src/main.js`: delete the shelf `<input id="add-shelf">` form-row half and its reads in save/lookup handlers (keep the tags input, now full-width); drop `shelf` from the search haystack and from `getFilteredSorted`'s sort special-case (full sort rework is Task 8 — for now delete the `'shelf'` branch and the sort `<option>`); drawer meta line becomes exactly this:

```js
<div class="drawer-meta">
  ${[
    b.year ? esc(b.year) : null,
    b.pages ? `${esc(b.pages)} pages` : null,
    b.dateRead ? `read ${esc(b.dateRead)}` : null,
    b.isbn ? `ISBN ${esc(b.isbn)}` : null
  ].filter(Boolean).join(' &bull; ') || '&nbsp;'}
</div>
```

List view: replace the Shelf column with Rating and Year columns — header cells `data-sort="rating"` / `data-sort="year"` (grid template becomes `5fr 3fr 1fr 1fr 3fr` in `style.css` for `.list-header`/`.list-row`), row cells `${b.rating ? esc(b.rating) + '★' : '—'}` and `${b.year ? esc(b.year) : '—'}`. Remove `shelf` from the add/edit modal payloads.

- [ ] **Step 7.4:** `npm test` — green. **Step 7.5:** Commit: `"Remove shelf from UI; show metadata in drawer and list"`

---

### Task 8: Sort by metadata with directions

**Files:** Modify `src/main.js`, `src/main.test.js`

- [ ] **Step 8.1: Failing tests:**

```js
describe('metadata sorting', () => {
  beforeEach(() => loadApp())

  it('sorts by rating descending by default with nulls last', () => {
    document.querySelector('[data-view="list"]').click()
    document.querySelector('[data-sort="rating"]').click()
    const titles = [...document.querySelectorAll('.list-title button')].map(b => b.textContent)
    expect(titles[0]).toBe('Dune')            // rating 5
    expect(titles[titles.length - 1]).not.toBe('Dune') // null ratings sink
  })

  it('re-selecting the active sort flips direction', () => {
    document.querySelector('[data-view="list"]').click()
    document.querySelector('[data-sort="title"]').click() // active, flips to desc
    const titles = [...document.querySelectorAll('.list-title button')].map(b => b.textContent)
    expect(titles[0] > titles[titles.length - 1]).toBe(true)
  })
})
```

- [ ] **Step 8.2:** Run — FAIL. **Step 8.3: Implement:** add to `src/main.js`:

```js
const SORT_OPTIONS = [
  { key: 'title', label: 'Title', dir: 'asc', value: b => (b.title || '').toLowerCase() },
  { key: 'author', label: 'Author', dir: 'asc', value: b => (b.author || '').toLowerCase() || null },
  { key: 'rating', label: 'Rating', dir: 'desc', value: b => b.rating ?? null },
  { key: 'dateRead', label: 'Date Read', dir: 'desc', value: b => b.dateRead || null },
  { key: 'dateAdded', label: 'Date Added', dir: 'desc', value: b => b.dateAdded || null },
  { key: 'pages', label: 'Pages', dir: 'desc', value: b => b.pages ?? null },
  { key: 'year', label: 'Year', dir: 'desc', value: b => b.year ?? null },
]
```

State: `sortBy: 'title', sortDir: 'asc'`. Replace the sort body of `getFilteredSorted` with a comparator: nulls always last regardless of direction; compare with `<`/`>` (works for strings and numbers); tiebreak by title asc; apply `sortDir === 'desc'` by negation (but nulls stay last). `setSort(key)`: same key → flip `sortDir`; new key → that option's default `dir`; then `render()`. Wire: sort `<select>` options generated from `SORT_OPTIONS` (change handler calls `setSort` only when key differs — selects can't re-select); list-header `data-sort` clicks call `setSort` (this replaces the Task 7-interim direct assignment); header select shows `label` plus `↑/↓` on the active option; `resetFilters` restores `title/asc`.

- [ ] **Step 8.4:** `npm test` green (the Task-7 author-header test still passes — author asc default). **Step 8.5:** Commit: `"Sort by any metadata with per-field default directions"`

---

### Task 9: Import modal

**Files:** Modify `src/main.js`, `src/main.test.js`

- [ ] **Step 9.1: Failing tests:**

```js
describe('goodreads import', () => {
  beforeEach(() => loadApp())

  const CSV = 'Title,Author,My Rating\nNew Book,Someone,4\nDune,Frank Herbert,0\n,Broken,1'

  it('shows a preview after loading a file', async () => {
    document.querySelector('[data-action="import"]').click()
    await window.__loadImportText(CSV)          // test hook, see 9.3
    const preview = document.querySelector('.import-preview').textContent
    expect(preview).toContain('1 new')
    expect(preview).toContain('1 update')
    expect(preview).toContain('1 unparseable (rows 4)')
  })

  it('confirms via POST /api/import and refreshes', async () => {
    document.querySelector('[data-action="import"]').click()
    await window.__loadImportText(CSV)
    document.querySelector('[data-action="confirm-import"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
    const call = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/import') && !JSON.parse(o.body).dryRun)
    expect(JSON.parse(call[1].body).books).toHaveLength(2)
  })
})
```

Extend `loadApp`'s fetch stub: `POST /api/import` → if `dryRun` return `{added:1, filled:1, skipped:0}`, else return the same and remember the call; subsequent GET `/api/books` may re-run (return the fixture again).

- [ ] **Step 9.2:** Run — FAIL. **Step 9.3: Implement:** state `importOpen/importBooks/importFailed/importPreview/importLoading`; header button `<button class="btn" data-action="import">Import</button>` next to Add Book (both hidden in readOnly); `renderImportModal()` — brutalist-ruled modal with: hidden `<input type="file" accept=".csv" id="import-file">` + a `drop-zone` div (drop + click-to-pick), preview block `.import-preview` when loaded (`N new · M updates · K unparseable (rows …)`), Cancel + red `Confirm Import` (`data-action="confirm-import"`, disabled until preview). File handling:

```js
async function loadImportText(text) {
  const { books, failed } = parseGoodreadsCsv(text)
  state.importBooks = books
  state.importFailed = failed
  const res = await fetch('/api/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ books, dryRun: true })
  })
  state.importPreview = res.ok ? await res.json() : null
  render()
}
if (import.meta.env?.MODE === 'test') window.__loadImportText = loadImportText
```

(file input `change` and drop-zone `drop` both funnel `file.text().then(loadImportText)`; the `window.__loadImportText` hook exists because happy-dom can't populate `input.files`). Confirm handler POSTs without dryRun, closes, toasts `Imported: N added, M filled, K skipped`, re-fetches `state.books = await api.getBooks()`, `render()`. Import `parseGoodreadsCsv` at top of `main.js`. Esc-close and backdrop rules follow the existing modal pattern.

- [ ] **Step 9.4:** `npm test` green. **Step 9.5:** Commit: `"Add Goodreads import modal with dry-run preview"`

---

### Task 10: Brutalist redesign

**Files:** Rewrite `src/style.css`; modify `src/main.js` (status bar + placeholder), `index.html`

- [ ] **Step 10.1: Failing test** (structure only — visuals verified by eye):

```js
it('renders the status bar with count and sort', async () => {
  await loadApp()
  const bar = document.querySelector('.status-bar').textContent
  expect(bar).toContain('3 BOOKS')
  expect(bar).toContain('TITLE')
})
```

- [ ] **Step 10.1b: Update the two existing `.header-count` tests** in `src/main.test.js` — "shows all books in the cover wall" asserts `document.querySelector('.status-bar').textContent` contains `'3 BOOKS'`, and "filters results as the query is typed" asserts it contains `'1/3 BOOKS'`. Without this, Step 10.3 breaks them (null `.header-count`).
- [ ] **Step 10.2:** Run — FAIL. **Step 10.3: Template changes** (`src/main.js`): remove the `.header-count` span from the header AND replace `updateResults()`'s `.header-count` update with a status-bar refresh (replace the `.status-bar` element's `outerHTML` with `renderStatusBar(filtered)`); append `renderStatusBar()` after `#results` in `render()`:

```js
function renderStatusBar(filtered) {
  const total = state.books.length
  const shown = filtered.length
  const opt = SORT_OPTIONS.find(o => o.key === state.sortBy)
  return `
    <div class="status-bar">
      ${shown === total ? `${total} BOOKS` : `${shown}/${total} BOOKS`}
      / SORTED BY ${esc(opt.label.toUpperCase())} ${state.sortDir === 'asc' ? '↑' : '↓'}
      ${state.q ? ` / q: "${esc(state.q)}"` : ''}
      ${state.tag ? ` / tag: ${esc(state.tag)}` : ''}
    </div>
  `
}
```

`updateResults()` also refreshes it. Update the SVG placeholder: black 6px frame, white ground, all-caps Arial Black title, monospace author.

- [ ] **Step 10.4: Rewrite `src/style.css`** to the brutalist system. Tokens at top:

```css
:root {
  --ink: #000;
  --paper: #fff;
  --accent: #ff2e2e;
  --rule: 3px solid var(--ink);
  --display: 'Inter', 'Arial Black', system-ui, sans-serif;   /* weight 900, uppercase */
  --mono: ui-monospace, 'SF Mono', Menlo, monospace;
}
```

Required treatments (keep every existing class name and the responsive grid column counts): body white, black text, no border-radius anywhere, no box-shadows; header bordered bottom `var(--rule)`, `h1` 900/uppercase/tight tracking; search input + selects monospace with `var(--rule)` borders, focus = `background: #ffec42` (highlighter) instead of ring; buttons uppercase 900, `border: var(--rule)`, hover inverts to black/white, `.btn-primary` red bg white text, `.btn-danger` white bg red text red border; view toggle joined buttons sharing rules, active = black bg; wall tiles separated by `var(--rule)` gridlines (no gap, `border-right`/`border-bottom` on tiles), hover overlay = solid black band with white uppercase type (no gradient); list table hard-ruled rows; drawer/modals: white panels, `var(--rule)` borders, uppercase 900 headings, backdrop `rgba(0,0,0,.35)`; `.status-bar`: fixed bottom, full width, monospace 11px, white bg, top rule, `padding: 4px 12px` (give `body` bottom padding so content clears it); `.empty-state` mono; keyboard selection `.kb-selected` (Task 11) = `outline: var(--rule); outline-offset: -3px` plus red corner tick via `::after`; mobile: keep the wrap behavior from the current file (search full-width row etc.).
- [ ] **Step 10.5:** `index.html`: change the Inter link to weights `400;700;900`.
- [ ] **Step 10.6:** `npm test` green; `npm run dev` + eyeball desktop and mobile against the chosen mockup (`.superpowers/brainstorm/*/design-direction-v3.html`, option 1). **Step 10.7:** Commit: `"Brutalist redesign: hard rules, mono metadata, red accent, status bar"`

---

### Task 11: Keyboard shortcuts — navigation core

**Files:** Modify `src/main.js`, `src/main.test.js`

- [ ] **Step 11.1: Failing tests:**

```js
describe('keyboard shortcuts', () => {
  beforeEach(() => loadApp())
  const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

  it('slash focuses search; typing there suspends shortcuts', () => {
    press('/')
    expect(document.activeElement.dataset.action).toBe('search')
    press('v')                                   // must NOT toggle view
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('covers')
  })

  it('arrows move the selection and Enter opens', () => {
    press('ArrowRight')
    press('ArrowRight')
    const selected = document.querySelector('.kb-selected')
    expect(selected).not.toBeNull()
    press('Enter')
    expect(document.querySelector('.drawer-title').textContent)
      .toBe(selected.getAttribute('aria-label').split(' by ')[0])
  })

  it('left/right walk prev/next while the drawer is open', () => {
    press('ArrowRight'); press('Enter')
    const first = document.querySelector('.drawer-title').textContent
    press('ArrowRight')
    expect(document.querySelector('.drawer-title').textContent).not.toBe(first)
  })

  it('v toggles view and s cycles sort at default direction', () => {
    press('v')
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('list')
    press('s')
    expect(document.querySelector('.status-bar').textContent).toContain('AUTHOR ↑')
  })

  it('Escape closes the drawer, then clears the search', () => {
    press('ArrowRight'); press('Enter')
    press('Escape')
    expect(document.querySelector('.drawer-panel')).toBeNull()
    const input = document.querySelector('[data-action="search"]')
    input.focus(); input.value = 'dune'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
    press('Escape')
    expect(document.querySelector('[data-action="search"]').value).toBe('')
  })
})
```

- [ ] **Step 11.2:** Run — FAIL. **Step 11.3: Implement:** `state.selectedIndex = -1` (reset to -1 in `resetFilters`, on search/tag change). **Move keyboard handling out of `attachEventListeners`** into a single module-level `document.addEventListener('keydown', onKeydown)` registered once at startup (this also fixes the existing bug where every render stacked another Escape listener). `onKeydown` logic:

```js
function onKeydown(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)
  if (e.key === 'Escape') {
    if (state.helpOpen) { state.helpOpen = false; render(); return }
    if (state.coverPickerOpen) { state.coverPickerOpen = false; state.coverOptions = []; render(); return }
    if (state.modalOpen) { state.modalOpen = false; state.modalStatus = null; state.editingId = null; render(); return }
    if (state.importOpen) { state.importOpen = false; state.importBooks = []; state.importPreview = null; render(); return }
    if (state.drawerOpen) { state.drawerOpen = false; state.selected = null; render(); return }
    if (state.q) { state.q = ''; document.querySelector('[data-action="search"]')?.blur(); render() }
    return
  }
  if (typing) return
  if (state.confirmOpen || state.modalOpen || state.coverPickerOpen || state.importOpen || state.helpOpen) return

  const filtered = getFilteredSorted()
  if (e.key === '/') { e.preventDefault(); document.querySelector('[data-action="search"]')?.focus(); return }
  if (state.drawerOpen) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const i = filtered.findIndex(b => b.id === state.selected?.id)
      const next = filtered[i + delta]
      if (next) { state.selectedIndex = i + delta; openBook(next.id) }
      return
    }
    if (e.key === 'e' && !state.readOnly && state.selected) {
      state.editingId = state.selected.id
      state.modalOpen = true
      state.modalStatus = null
      render()
    }
    return
  }
  const cols = state.view === 'covers' ? wallColumns() : 1
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
  if (move !== undefined) {
    e.preventDefault()
    state.selectedIndex = Math.max(0, Math.min(filtered.length - 1, (state.selectedIndex < 0 ? 0 : state.selectedIndex + move)))
    updateResults()
    document.querySelector('.kb-selected')?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (e.key === 'Enter' && state.selectedIndex >= 0) { openBook(filtered[state.selectedIndex]?.id); return }
  if (e.key === 'v') { state.view = state.view === 'covers' ? 'list' : 'covers'; render(); return }
  if (e.key === 's') { const i = SORT_OPTIONS.findIndex(o => o.key === state.sortBy); const next = SORT_OPTIONS[(i + 1) % SORT_OPTIONS.length]; state.sortBy = next.key; state.sortDir = next.dir; render(); return }
  if (!state.readOnly && e.key === 'a') { state.modalOpen = true; state.modalStatus = null; render(); return }
  if (!state.readOnly && e.key === 'i') { state.importOpen = true; render(); return }
  if (!state.readOnly && e.key === 'e' && state.selectedIndex >= 0) { state.selected = filtered[state.selectedIndex]; state.editingId = state.selected.id; state.modalOpen = true; render(); return }
}
```

`wallColumns()`: `getComputedStyle(document.querySelector('.wall')).gridTemplateColumns.split(' ').length`, falling back to 1 when unavailable (happy-dom). Tile/row templates add `class="... ${i === state.selectedIndex ? 'kb-selected' : ''}"` — pass the index from the `map`. Delete the old Escape block from `attachEventListeners`. Register the listener via a window-scoped guard so test module reloads (and Vite HMR) don't stack handlers:

```js
if (window.__bookshelfKeydown) document.removeEventListener('keydown', window.__bookshelfKeydown)
window.__bookshelfKeydown = onKeydown
document.addEventListener('keydown', onKeydown)
```

Selection reset: `state.selectedIndex = -1` (no selection) whenever `q`, `tag`, or sort changes — the spec's "resets to 0" is amended to "clears" (no phantom selection ring before the user touches the keyboard); the spec file gets a one-line update in Task 13.

- [ ] **Step 11.4:** `npm test` green. **Step 11.5:** Commit: `"Add keyboard navigation: arrows, enter, /, v, s, a, i, e"`

---

### Task 12: Help overlay + number-key tag filters

**Files:** Modify `src/main.js`, `src/main.test.js`, `src/style.css`

- [ ] **Step 12.1: Failing tests:**

```js
it('? opens the help overlay listing shortcuts', async () => {
  await loadApp()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
  expect(document.querySelector('.help-overlay').textContent).toContain('navigate')
})

it('number keys toggle tag filters', async () => {
  await loadApp()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
  expect(document.querySelectorAll('.cover-tile').length).toBe(1) // first tag alphabetically
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
  expect(document.querySelectorAll('.cover-tile').length).toBe(3)
})
```

- [ ] **Step 12.2:** Run — FAIL. **Step 12.3: Implement:** `state.helpOpen`; `?` toggles; Esc closes it (top of Esc priority); `renderHelpOverlay()` — brutalist panel, two-column mono table of every shortcut with one-line descriptions (include "arrows — navigate the wall"); digits `1`–`9` map to `getAllTags()[n-1]`: same tag → clear, else set `state.tag`, reset `selectedIndex`, `render()`. `.help-overlay` styles: fixed inset, white panel, `var(--rule)` border.
- [ ] **Step 12.4:** `npm test` green. **Step 12.5:** Commit: `"Add help overlay and number-key tag filters"`

---

### Task 13: Docs, build verification, wrap-up

- [ ] **Step 13.0:** Update the spec's shortcut section: selection "resets to 0" → "clears (no selection)" to match implementation.
- [ ] **Step 13.1:** Update `README.md`: remove shelf from the data-format example and prose (id no longer encodes shelf; note legacy ids persist); add Import section (Goodreads CSV steps, fill-in-blanks semantics); add keyboard shortcut table; note new sort fields; update the features list.
- [ ] **Step 13.2:** `npm test` — full suite green, output pristine.
- [ ] **Step 13.3:** `npm run build:quick`; serve `dist/` without the API (`python3 -m http.server`) and verify: read-only fallback works, no Import/Add buttons, `a`/`i`/`e` inert, arrows + Enter + `v` + `?` still work, brutalist styling intact, status bar correct.
- [ ] **Step 13.4:** `npm run dev`; verify against the real DB in the browser: import a real `goodreads_library_export.csv` if Jason provides one (otherwise a synthetic fixture), sort by each new field, walk books with arrows.
- [ ] **Step 13.5:** Commit docs; offer merge to `main` (superpowers:finishing-a-development-branch).
