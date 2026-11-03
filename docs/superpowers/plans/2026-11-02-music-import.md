# Music Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Jason import his albums and podcasts from an Apple Music `Library.xml` or Spotify's `YourLibrary.json` through the existing Import box, then find their covers in the background.

**Architecture:** Pure, separately tested modules do the work: `src/match.js` (the Unicode-aware match key, shared with the server's import merge), `src/musicimport.js` (the two readers and file-type detection), `src/covers.js` (candidate choice, query, matching and the paced lookup loop) and `src/toast.js` (the toast slot, with a persistent progress mode). `src/main.js` only wires them in: the Import box dispatches by detected type, shows a source line and one-line errors, and after Confirm (or from a new **Find missing covers** menu item) runs the cover finder against `/api/lookup` and `PUT /api/books/:id`. The server's import, chunking and merge are unchanged apart from the shared key.

**Tech Stack:** Vanilla JS (ES modules), Vite 7, Express 4 + libSQL on the server, vitest 4 + happy-dom 20 (including happy-dom's `DOMParser` for XML), vitest fake timers.

**Spec:** `docs/superpowers/specs/2026-11-02-music-import-design.md`. Read it fully before starting. Where this plan and the spec disagree, stop and ask Jason.

---

## Ground rules (read once)

- **Branch:** `wip/paper-gallery-makeover` (already checked out). Never commit to `main`.
- **Baseline:** `npx vitest run` → `Test Files 20 passed (20)`, `Tests 399 passed (399)`, and nothing else printed (no warnings, no errors, no stray logs). Every task ends with the full suite green and that pristine output. Each task states the expected new total.
- **Jason's rules that bite here:**
  - TDD for every behaviour: write the failing test, watch it fail for the stated reason, write the minimal code, watch it pass.
  - Every new code file starts with two `// ABOUTME: ` lines.
  - Style: no semicolons, 2-space indent, single quotes, template strings. Match the surrounding code.
  - Comments describe what the code does now. Never "new", "moved", "used to", "improved".
  - **Never delete or weaken a test.** If an existing test fails, stop and raise it with Jason.
  - Never mock what you are testing. Stubbing `fetch` at the network boundary (as `loadApp` in `src/main.test.js` does) and passing fake `lookup`/`save` functions into `findCovers` is fine.
- **Commits:** one per task (two where marked). Stage files by name, never `git add -A` or `git add .`. Message style: one plain imperative sentence describing the user-visible effect, no `feat:` prefix, then the co-author line as a second `-m`:
  ```bash
  git commit -m "Keep albums titled in other scripts apart when importing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  Commits are SSH-signed through 1Password. If signing fails (for example `1Password: failed to fill whole buffer`), stop and ask Jason to unlock 1Password. **Never bypass signing** (no `--no-gpg-sign`, no `-c commit.gpgsign=false`), and never skip hooks.
- **Run one test file:** `npx vitest run src/covers.test.js`. **One describe or test by name:** `npx vitest run src/main.test.js -t "import box"`.
- **Never commit anything from `data/`.** `Library.xml` and `YourLibrary.json` hold Jason's personal library. `.gitignore` already covers `data/*`; never force-add past it.
- **Never write to Jason's database.** Never click Confirm Import or Find missing covers, and never send POST/PUT/PATCH/DELETE to the dev server, while it runs against Jason's database (`data/bookshelf.db` or Turso). Only Jason does that. To exercise writes by hand, start a throwaway database: `BOOKSHELF_DB="$(mktemp -d)/shelf.db" npm run dev`, with `TURSO_DATABASE_URL` unset (`server/db.js` uses Turso whenever that variable is set, ignoring `BOOKSHELF_DB`).
- **Steps marked "Controller runs this, not a subagent"** need Jason in the conversation (his files, his decisions, his approval). A subagent stops before them and reports back.

## How the pieces fit (orientation for someone new to this codebase)

- `src/main.js` is one big module: a global `state` object, `render()` rebuilds the page from string templates, and `attachEventListeners()` rewires listeners after each render. Header buttons are wired with selectors scoped to `.header [data-action="…"]`. The avatar dropdown closes itself in a capture-phase listener, so menu item handlers just do their job.
- Import today: `loadImportText(text)` parses a Goodreads CSV with `parseGoodreadsCsv` (`src/goodreads.js`), posts the entries in chunks of 250 with `dryRun: true` via `postImportChunks` to get preview counts, and Confirm posts them for real, reloads `state.books` with `api.getBooks()`, closes the box, and toasts the counts. Tests call it directly through `window.__loadImportText` (exposed only in test mode).
- Import entries are plain objects shaped like `mapGoodreadsRow`'s output: `{ title, author, isbn, rating, notes, tags, dateRead, dateAdded, pages, year }`. The server (`importBooks` in `server/db.js`) adds unmatched entries as they are (so an entry's `medium` is kept), fills blank `FILLABLE` fields on matches, and unions tags. Music entries add `medium` and use `null` for the book-only fields.
- `/api/lookup?medium=&q=` (in `server/api.js`) returns `{ results: [{ title, author, year, coverUrl }] }` from iTunes for albums and podcasts (`mapItunesResults` in `server/lookup.js`), or a 500 when iTunes fails.
- `api.updateBook(id, body)` in `src/main.js` does `PUT /api/books/:id`; the server merges the body over the stored item. `syncBookState(updated)` replaces the item in `state.books` without re-rendering; `updateResults()` redraws only the results area (rebuilding the shelf if it is showing), leaving an open detail overlay alone. `closeDetail()` calls `render()`, so anything held back while the detail was open shows when it closes.
- `src/shelf.js`'s `mountShelf()` returns the controller for the 3D shelf; `main.js` keeps the current one in `shelfControl`. Its internal `drag` is non-null from a press on the stage until the pointer is released.
- `src/main.test.js`'s `loadApp(books)` renders the whole app in happy-dom with `fetch` stubbed: `/api/import` always answers `{ added: 1, filled: 1, skipped: 0 }` per chunk, `PUT /api/books/:id` echoes the merged item, and `/api/lookup` answers Abbey Road unless a test replaces the answer. Tests replace parts of the stub by wrapping `fetch.getMockImplementation()` (see `holdSaves` in the shelf tests). `loadApp` itself needs real timers.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/match.js` | create | `normKey`: the normalised match key used by the server merge, the music readers and the cover matcher |
| `src/match.test.js` | create | Tests for `normKey` in any script |
| `server/db.js` | modify | Uses the shared `normKey` instead of its own ASCII-only one |
| `server/db.test.js` | modify | Import keeps two all-Japanese albums apart |
| `src/musicimport.js` | create | `parseSpotifyLibrary`, `parseAppleLibrary`, `detectImportFile` |
| `src/musicimport.test.js` | create | Reader and detection tests, with a hand-built plist fixture |
| `src/toast.js` | create | The toast slot: brief toasts, and one persistent progress toast that updates in place |
| `src/toast.test.js` | create | Toast tests with fake timers |
| `src/covers.js` | create | Which items a lookup could find a cover for, the lookup query, matching results, the save body, progress text, and the paced `findCovers` loop |
| `src/covers.test.js` | create | Cover-finding tests with fake timers |
| `src/main.js` | modify | Import box copy, dispatch by type, source line, `state.importError`; toast import; `api.lookup`; cover run wiring, coalesced redraws and the **Find missing covers** menu item |
| `src/shelf.js` | modify | The shelf controller reports whether a press or drag is under way |
| `src/shelf.test.js` | modify | Test for that report |
| `src/main.test.js` | modify | `import box` and `finding covers` integration suites |
| `docs/superpowers/specs/2026-11-02-music-import-design.md` | modify | Records the Apple key names confirmed against Jason's file, and the measured parse time |
| `README.md` | modify | Features list mentions Apple Music and Spotify import (wording approved by Jason) |

---

# Milestone A: Work that doesn't need Jason's files

### Task 1: A match key that works in every script

`normKey` keeps only `[a-z0-9 ]` today, so "Björk" becomes "bjrk" and an all-Japanese title becomes an empty key. This task builds the shared, Unicode-aware version; Task 2 switches the server to it.

**Files:**
- Create: `src/match.js`, `src/match.test.js`

- [ ] **Step 1: Write the failing test.** Create `src/match.test.js`:

```js
// ABOUTME: Tests for the normalised match key shared by the import merge,
// ABOUTME: the music readers and the cover finder.

import { describe, it, expect } from 'vitest'
import { normKey } from './match.js'

describe('normKey', () => {
  it('lowercases, drops punctuation and collapses spaces', () => {
    expect(normKey('  Dune:  The   Novel! ')).toBe('dune the novel')
  })

  it('treats a missing value as an empty key', () => {
    expect(normKey(null)).toBe('')
    expect(normKey(undefined)).toBe('')
  })

  it('drops accents from Latin letters', () => {
    expect(normKey('Björk')).toBe('bjork')
    expect(normKey('Sigur Rós')).toBe('sigur ros')
  })

  it('keeps letters and numbers in any script', () => {
    expect(normKey('Кино')).toBe('кино')
    expect(normKey('坂本龍一')).toBe('坂本龍一')
    expect(normKey('１９８４')).toBe('1984')
  })

  it('keeps vowel signs, so titles that differ only by one get different keys', () => {
    expect(normKey('काल')).toBe('काल')
    expect(normKey('काल')).not.toBe(normKey('कल'))
    expect(normKey('กี')).not.toBe(normKey('ก'))
  })

  it('keeps the marks of non-Latin letters, so Мой and Мои stay apart', () => {
    expect(normKey('Мой')).toBe('мой')
    expect(normKey('Мой')).not.toBe(normKey('Мои'))
  })

  it('gives two different all-Japanese album titles different keys', () => {
    const a = normKey('風の谷のナウシカ')
    const b = normKey('天空の城ラピュタ')
    expect(a).not.toBe('')
    expect(b).not.toBe('')
    expect(a).not.toBe(b)
  })

  it('keeps voiced kana distinct from their unvoiced forms', () => {
    expect(normKey('がっこう')).toBe('がっこう')
    expect(normKey('がっこう')).not.toBe(normKey('かっこう'))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/match.test.js` → FAIL with `Failed to resolve import "./match.js" from "src/match.test.js". Does the file exist?`

- [ ] **Step 3: Create `src/match.js`.** `NFKD` splits "ö" into "o" plus a combining diaeresis (U+0308), "й" into "и" plus a combining breve (U+0306), and "が" into "か" plus a combining voiced mark (U+3099). The Latin combining diacritics (U+0300–U+036F) are removed only where they follow a Latin letter, so "Björk" becomes "bjork" while "й" keeps its breve and `NFC` puts "й" and "が" back together. `NFKD` also folds full-width digits to ASCII. The last filter keeps letters (`\p{L}`), combining marks (`\p{M}`) and numbers (`\p{N}`) in any script: Devanagari and Thai vowel signs are marks, not letters, so without `\p{M}` "काल" and "कल" would share a key. Write the ranges as `\u` escapes, exactly as below, never as pasted invisible characters.

```js
// ABOUTME: The normalised match key shared by the server's import merge and the browser's music import.
// ABOUTME: Keeps letters, marks and numbers in any script, drops accents from Latin letters, folds case and spacing.

export const normKey = s => String(s || '')
  .normalize('NFKD')
  .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, '$1')
  .normalize('NFC')
  .toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, '')
  .replace(/\s+/g, ' ')
  .trim()
```

- [ ] **Step 4: Run it.** `npx vitest run src/match.test.js` → `Tests 8 passed (8)`. Then `npx vitest run` → `Tests 407 passed (407)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/match.js src/match.test.js
git commit -m "Match titles and names written in any script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The server's import uses the shared key

**Files:**
- Modify: `server/db.js` (imports at lines 6–10; delete the local `normKey` at about line 205)
- Test: `server/db.test.js` (inside `describe('importBooks', …)`, just above `it('rolls the whole batch back when a row is invalid', …)` at about line 125)

Server tests run under `// @vitest-environment node` and get a throwaway database from `loadDb()`, which points `BOOKSHELF_DB` at a temp file and re-imports `./db.js`.

- [ ] **Step 1: Write the failing test.** In `server/db.test.js`, insert above `it('rolls the whole batch back when a row is invalid', …)`:

```js
  it('keeps two albums titled entirely in Japanese apart', async () => {
    const { importBooks, getAllBooks } = await loadDb()
    const albums = [
      { title: '風の谷のナウシカ', author: '久石譲', medium: 'album', tags: [] },
      { title: '天空の城ラピュタ', author: '久石譲', medium: 'album', tags: [] }
    ]
    expect(await importBooks(albums)).toEqual({ added: 2, filled: 0, skipped: 0 })
    expect((await getAllBooks()).map(b => b.title).sort()).toEqual(['天空の城ラピュタ', '風の谷のナウシカ'])
  })

```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run server/db.test.js` → 1 failed: `AssertionError: expected { added: 1, filled: +0, skipped: 1 } to deeply equal { added: 2, filled: +0, skipped: +0 }` (both albums reduce to the key `|`, so the second "matches" the first).

- [ ] **Step 3: Switch the server to the shared key.** In `server/db.js`, add below `import { isHosted } from './auth.js'`:

```js
import { normKey } from '../src/match.js'
```

and delete this line (and the blank line after it), about line 205:

```js
const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
```

Leave `slugifyTitle` alone: ids are a separate concern (an all-Japanese title gets the id `book`, `book-2`, …, which are still unique).

Vercel needs nothing new: `api/index.js` imports `server/api.js`, which imports `server/db.js`, and the bundler follows the `../src/match.js` import exactly as it already follows `server/og.js` → `../src/routes.js` for `api/page.js`.

- [ ] **Step 4: Run it.** `npx vitest run server/db.test.js` → all pass. Check the server still loads in plain Node: `BOOKSHELF_DB="$(mktemp -d)/check.db" node -e "import('./server/api.js').then(() => console.log('server loads'))"` → prints `server loads`. Then `npx vitest run` → `Tests 408 passed (408)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add server/db.js server/db.test.js
git commit -m "Keep albums titled in other scripts apart when importing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Read Spotify's YourLibrary.json

**Files:**
- Create: `src/musicimport.js`, `src/musicimport.test.js`

- [ ] **Step 1: Write the failing test.** Create `src/musicimport.test.js`:

```js
// ABOUTME: Tests for the music library readers (Spotify's YourLibrary.json, Apple Music's Library.xml)
// ABOUTME: and for telling an import file's type from its contents.

import { describe, it, expect } from 'vitest'
import { parseSpotifyLibrary } from './musicimport.js'

// The fields every import entry carries, as parseGoodreadsCsv's entries do
const BLANK = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }

describe('parseSpotifyLibrary', () => {
  const spotify = data => parseSpotifyLibrary(JSON.stringify(data))

  it('makes an album of each saved album, tagged with its source', () => {
    const { books, failed } = spotify({
      albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }]
    })
    expect(books).toEqual([
      { ...BLANK, title: 'In Rainbows', author: 'Radiohead', medium: 'album', tags: ['spotify'] }
    ])
    expect(failed).toEqual([])
  })

  it('makes an album of each liked song\'s album, so a liked single becomes an album', () => {
    const { books } = spotify({
      tracks: [{ artist: 'Robyn', album: 'Dancing On My Own', track: 'Dancing On My Own', uri: 'spotify:track:1' }]
    })
    expect(books.map(b => [b.title, b.author, b.medium])).toEqual([['Dancing On My Own', 'Robyn', 'album']])
  })

  it('lists an album once however it is spelled across saved albums and liked songs', () => {
    const { books } = spotify({
      albums: [{ artist: 'Björk', album: 'Homogenic', uri: 'spotify:album:2' }],
      tracks: [
        { artist: 'Bjork', album: 'Homogenic', track: 'Jóga', uri: 'spotify:track:2' },
        { artist: 'björk', album: 'HOMOGENIC!', track: 'Bachelorette', uri: 'spotify:track:3' }
      ]
    })
    expect(books.map(b => [b.title, b.author])).toEqual([['Homogenic', 'Björk']])
  })

  it('keeps albums of the same name by different artists apart', () => {
    const { books } = spotify({
      albums: [
        { artist: 'Weezer', album: 'Weezer', uri: 'spotify:album:3' },
        { artist: 'Peter Gabriel', album: 'Weezer', uri: 'spotify:album:4' }
      ]
    })
    expect(books).toHaveLength(2)
  })

  it('makes a podcast of each followed show, with its publisher as the creator', () => {
    const { books } = spotify({
      shows: [{ name: 'Radiolab', publisher: 'WNYC Studios', uri: 'spotify:show:1' }]
    })
    expect(books).toEqual([
      { ...BLANK, title: 'Radiolab', author: 'WNYC Studios', medium: 'podcast', tags: ['spotify'] }
    ])
  })

  it('skips records with no album or show name', () => {
    const { books } = spotify({
      albums: [{ artist: 'Nobody', album: '  ', uri: 'spotify:album:5' }],
      tracks: [{ artist: 'Nobody', track: 'Untitled', uri: 'spotify:track:4' }],
      shows: [{ publisher: 'Nobody', uri: 'spotify:show:2' }]
    })
    expect(books).toEqual([])
  })

  it('ignores the arrays it does not import', () => {
    const { books } = spotify({
      albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }],
      episodes: [{ name: 'Episode 1', show: 'Radiolab' }],
      bannedTracks: [{ artist: 'X', album: 'Y', track: 'Z' }],
      other: ['anything']
    })
    expect(books.map(b => b.title)).toEqual(['In Rainbows'])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/musicimport.test.js` → FAIL with `Failed to resolve import "./musicimport.js" from "src/musicimport.test.js". Does the file exist?`

- [ ] **Step 3: Create `src/musicimport.js`.** Saved albums come first so their spelling wins; the first record for a key is kept.

```js
// ABOUTME: Reads music library exports into import entries: Spotify's YourLibrary.json
// ABOUTME: and Apple Music's Library.xml, and tells an import file's type from its contents.

import { normKey } from './match.js'

// The fields every import entry carries, as parseGoodreadsCsv's entries do
const BLANK = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }

const entry = fields => ({ ...BLANK, ...fields })
const clean = v => String(v ?? '').trim()
const listOf = v => Array.isArray(v) ? v : []
const albumKey = (title, artist) => `${normKey(title)}|${normKey(artist)}`

export function parseSpotifyLibrary(text) {
  const data = JSON.parse(text)
  const albums = new Map()
  for (const record of [...listOf(data.albums), ...listOf(data.tracks)]) {
    const title = clean(record?.album)
    if (!title) continue
    const author = clean(record.artist) || null
    const key = albumKey(title, author)
    if (!albums.has(key)) albums.set(key, entry({ title, author, medium: 'album', tags: ['spotify'] }))
  }
  const podcasts = listOf(data.shows).flatMap(show => {
    const title = clean(show?.name)
    return title ? [entry({ title, author: clean(show.publisher) || null, medium: 'podcast', tags: ['spotify'] })] : []
  })
  return { books: [...albums.values(), ...podcasts], failed: [] }
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/musicimport.test.js` → `Tests 7 passed (7)`. Then `npx vitest run` → `Tests 415 passed (415)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/musicimport.js src/musicimport.test.js
git commit -m "Read albums and podcasts from Spotify's library file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Tell an import file's type from its contents

**Files:**
- Modify: `src/musicimport.js` (append at the end)
- Test: `src/musicimport.test.js` (change the import line; append a `describe`)

- [ ] **Step 1: Write the failing test.** In `src/musicimport.test.js`, change the import line to:

```js
import { parseSpotifyLibrary, detectImportFile } from './musicimport.js'
```

and append at the end of the file:

```js
describe('detectImportFile', () => {
  const PLIST_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Major Version</key><integer>1</integer>
\t<key>Tracks</key>
\t<dict>`

  it('recognises an Apple Music library by its plist header and Tracks key', () => {
    expect(detectImportFile(`${PLIST_HEAD}</dict></dict></plist>`)).toBe('apple')
  })

  it('looks for the Apple header only in the first 4 KB', () => {
    expect(detectImportFile(`${' '.repeat(4096)}${PLIST_HEAD}</dict></dict></plist>`)).toBe(null)
  })

  it('does not take a plist without Tracks for a music library', () => {
    expect(detectImportFile('<?xml version="1.0"?><plist version="1.0"><dict><key>Name</key><string>x</string></dict></plist>')).toBe(null)
  })

  it('recognises a Spotify library by an albums, tracks or shows key, even when it is cut short', () => {
    expect(detectImportFile('{"albums": []}')).toBe('spotify')
    expect(detectImportFile('\n  {\n  "tracks" : [ {"artist": "Robyn", "album": "Body Ta')).toBe('spotify')
    expect(detectImportFile('{"other": [], "shows": []}')).toBe('spotify')
  })

  it('looks for Spotify\'s keys only in the first 4 KB', () => {
    expect(detectImportFile(`{"other": "${'x'.repeat(4096)}", "albums": []}`)).toBe(null)
  })

  it('recognises a Goodreads export by its Title column', () => {
    expect(detectImportFile('Book Id,Title,Author,My Rating\n1,Dune,Frank Herbert,5')).toBe('goodreads')
  })

  it('still recognises a plain Title,Author CSV as Goodreads', () => {
    expect(detectImportFile('Title,Author\nDune,Frank Herbert')).toBe('goodreads')
    expect(detectImportFile('"Title","Author"\r\n"Dune","Frank Herbert"')).toBe('goodreads')
  })

  it('returns null for unrelated XML, JSON and CSV', () => {
    expect(detectImportFile('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>')).toBe(null)
    expect(detectImportFile('{"playlists": [], "name": "albums"}')).toBe(null)
    expect(detectImportFile('null')).toBe(null)
    expect(detectImportFile('[{"albums": []}]')).toBe(null)
    expect(detectImportFile('Name,Artist\nIn Rainbows,Radiohead')).toBe(null)
    expect(detectImportFile('')).toBe(null)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/musicimport.test.js` → 8 failed, each with `TypeError: detectImportFile is not a function`.

- [ ] **Step 3: Append to `src/musicimport.js`.** Detection reads only the first 4 KB. A Spotify file is JSON starting with `{` that has an `"albums"`, `"tracks"` or `"shows"` key (the key followed by `:`, so the word as a value doesn't count). It is not parsed here, so a truncated or invalid `YourLibrary.json` is still recognised and its reader reports it as damaged (Task 7). The Goodreads parser keys rows by the exact header text and requires a `Title` column, so detection checks the same thing on the first line.

```js

// Which reader an import file needs, from its contents: 'apple', 'spotify', 'goodreads' or null.
// Only the first 4 KB are read, so a large file is never parsed just to name it, and a
// truncated Spotify file is still recognised (its reader then reports it as damaged).
export function detectImportFile(text) {
  const head = text.slice(0, 4096)
  if (head.includes('<plist') && head.includes('<key>Tracks</key>')) return 'apple'
  if (/^\s*\{/.test(head) && /"(albums|tracks|shows)"\s*:/.test(head)) return 'spotify'
  const header = head.split(/\r?\n/, 1)[0].split(',').map(f => f.trim().replace(/^"(.*)"$/, '$1'))
  if (header.includes('Title')) return 'goodreads'
  return null
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/musicimport.test.js` → `Tests 15 passed (15)`. Then `npx vitest run` → `Tests 423 passed (423)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/musicimport.js src/musicimport.test.js
git commit -m "Recognise Goodreads, Apple Music and Spotify files by their contents" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The Import box offers every file type and says how to get each

**Files:**
- Modify: `src/main.js` `renderImportModal()` (about lines 1289–1318)
- Test: `src/main.test.js` (new `describe('import box', …)` inserted just above `describe('metadata sorting', …)`, about line 1943)

- [ ] **Step 1: Write the failing test.** In `src/main.test.js`, insert above `describe('metadata sorting', () => {`:

```js
describe('import box', () => {
  beforeEach(async () => {
    await loadApp()
    document.querySelector('[data-action="import"]').click()
  })

  it('offers every file type it reads', () => {
    expect(document.querySelector('.modal-header h2').textContent).toBe('Import')
    expect(document.querySelector('.drop-zone').textContent.trim()).toBe('Drop a Goodreads CSV, an Apple Music Library.xml or Spotify\'s YourLibrary.json here, or click to choose')
    expect(document.getElementById('import-file').getAttribute('accept')).toBe('.csv,.xml,.json')
  })

  it('tells how to export a library from each source', () => {
    expect([...document.querySelectorAll('.import-hint')].map(p => p.textContent)).toEqual([
      'Goodreads: My Books → Import and export → Export library.',
      'Apple Music: in the Music app, File → Library → Export Library…',
      'Spotify: Account → Privacy settings → Download your data, then unzip it and use YourLibrary.json.'
    ])
  })
})

```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/main.test.js -t "import box"` → 2 failed: `AssertionError: expected 'Import from Goodreads' to be 'Import'`, and `AssertionError: expected [] to deeply equal [ …(3) ]` (there are no `.import-hint` lines yet).

- [ ] **Step 3: Change the copy.** In `renderImportModal()` in `src/main.js`, replace

```js
          <h2>Import from Goodreads</h2>
```

with

```js
          <h2>Import</h2>
```

replace

```js
            ${state.importLoading ? '<span class="loading"></span> Reading file...' : 'Drop goodreads_library_export.csv here or click to choose'}
          </div>
          <input type="file" accept=".csv,text/csv" id="import-file" class="hidden">
```

with

```js
            ${state.importLoading ? '<span class="loading"></span> Reading file...' : 'Drop a Goodreads CSV, an Apple Music Library.xml or Spotify\'s YourLibrary.json here, or click to choose'}
          </div>
          <input type="file" accept=".csv,.xml,.json" id="import-file" class="hidden">
```

and replace the Goodreads-only hint

```js
          <p class="form-hint">Export from Goodreads: My Books &rarr; Tools &rarr; Import and Export &rarr; Export Library</p>
```

with one line per source (the wording is Jason's):

```js
          <p class="form-hint import-hint">Goodreads: My Books &rarr; Import and export &rarr; Export library.</p>
          <p class="form-hint import-hint">Apple Music: in the Music app, File &rarr; Library &rarr; Export Library&hellip;</p>
          <p class="form-hint import-hint">Spotify: Account &rarr; Privacy settings &rarr; Download your data, then unzip it and use YourLibrary.json.</p>
```

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "import box"` → 2 passed. Then `npx vitest run` → `Tests 425 passed (425)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Invite Apple Music and Spotify files in the Import box, with how to export each" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The Import box reads each file type and names its source

**Files:**
- Modify: `src/main.js`: imports (line 6), `state` (about lines 211–215), `renderImportModal()` preview, `loadImportText()` and `closeImport()` (about lines 1342–1363)
- Test: `src/main.test.js` (`describe('import box', …)`)

The tests drop a file on the drop zone the way a browser does. happy-dom has no real drag-and-drop, so the helper builds a `drop` event and gives it a `dataTransfer` whose one file only needs `text()`, which is all the app reads.

- [ ] **Step 1: Write the failing tests.** In `describe('import box', …)`, add these helpers right after the `beforeEach` block:

```js
  // Drops a file on the Import box as a browser does; text() is all the app reads from it
  function dropImportFile(text) {
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    const file = { text: typeof text === 'function' ? text : async () => text }
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } })
    document.querySelector('.drop-zone').dispatchEvent(drop)
  }

  // The drop zone stops saying "Reading file" once the file is read and previewed
  const fileRead = () => vi.waitFor(() => {
    if (document.querySelector('.drop-zone .loading')) throw new Error('still reading')
  })

  const confirmButton = () => document.querySelector('[data-action="confirm-import"]')

  const SPOTIFY = JSON.stringify({
    albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }],
    tracks: [{ artist: 'Robyn', album: 'Body Talk', track: 'Dancing On My Own', uri: 'spotify:track:1' }],
    shows: [{ name: 'Radiolab', publisher: 'WNYC Studios', uri: 'spotify:show:1' }],
    other: []
  })
```

and add these tests after `it('offers every file type it reads', …)`. (The stubbed `/api/import` answers `added: 1` per chunk whatever is sent, so every preview says "1 new".)

```js
  it('names a Goodreads library and its book count above the preview counts', async () => {
    dropImportFile('Title,Author\nDune,Frank Herbert\nFlow,Mihaly Csikszentmihalyi')
    await fileRead()
    expect(document.querySelector('.import-source').textContent).toBe('Goodreads library: 2 books')
    expect(document.querySelector('.import-preview').textContent).toContain('1 new')
    expect(confirmButton().disabled).toBe(false)
  })

  it('names a Spotify library and its album and podcast counts', async () => {
    dropImportFile(SPOTIFY)
    await fileRead()
    expect(document.querySelector('.import-source').textContent).toBe('Spotify library: 2 albums, 1 podcast')
    expect(document.querySelector('.import-preview').textContent).toContain('1 new')
  })

  it('confirms a Spotify library by posting its albums and podcasts', async () => {
    dropImportFile(SPOTIFY)
    await fileRead()
    confirmButton().click()
    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
    const call = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/import') && !JSON.parse(o.body).dryRun)
    const blank = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }
    expect(JSON.parse(call[1].body).books).toEqual([
      { ...blank, title: 'In Rainbows', author: 'Radiohead', medium: 'album', tags: ['spotify'] },
      { ...blank, title: 'Body Talk', author: 'Robyn', medium: 'album', tags: ['spotify'] },
      { ...blank, title: 'Radiolab', author: 'WNYC Studios', medium: 'podcast', tags: ['spotify'] }
    ])
  })
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/main.test.js -t "import box"` → 3 failed: two with `TypeError: Cannot read properties of null (reading 'textContent')` (no `.import-source`), and the confirm test with `Error: modal open` (the Spotify JSON goes through the CSV parser, yields nothing, and Confirm stays disabled).

- [ ] **Step 3: Dispatch by type and show the source line.** In `src/main.js`:

Below `import { parseGoodreadsCsv } from './goodreads.js'` add:

```js
import { parseSpotifyLibrary, detectImportFile } from './musicimport.js'
```

In `state`, after `importLoading: false,` add:

```js
  // The line naming the import file's source and what was read from it
  importSummary: '',
```

In `renderImportModal()`, replace

```js
          ${p ? `
            <div class="import-preview">
```

with

```js
          ${p ? `
            <p class="form-hint import-source">${esc(state.importSummary)}</p>
            <div class="import-preview">
```

Replace the whole `loadImportText` function (keep the `window.__loadImportText` line below it) with:

```js
// The readers for each import file type, and the name the Import box gives its source
const IMPORT_SOURCES = {
  goodreads: { name: 'Goodreads library', read: parseGoodreadsCsv },
  spotify: { name: 'Spotify library', read: parseSpotifyLibrary }
}

const counted = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

// "Spotify library: 380 albums, 12 podcasts"
function importSummary(type, books) {
  const counts = type === 'goodreads'
    ? [counted(books.length, 'book')]
    : ['album', 'podcast']
      .map(medium => [medium, books.filter(b => b.medium === medium).length])
      .filter(([, n]) => n)
      .map(([medium, n]) => counted(n, medium))
  return `${IMPORT_SOURCES[type].name}: ${counts.join(', ')}`
}

async function loadImportText(text) {
  const type = detectImportFile(text)
  const { books, failed } = IMPORT_SOURCES[type].read(text)
  state.importBooks = books
  state.importFailed = failed
  state.importSummary = importSummary(type, books)
  state.importLoading = false
  try {
    state.importPreview = await postImportChunks(books, true)
  } catch (e) {
    state.importPreview = null
  }
  render()
}
```

In `closeImport()`, after `state.importPreview = null` add:

```js
  state.importSummary = ''
```

(An unrecognised file throws here for now; Task 7 turns that into a message.)

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "import box"` → 5 passed. Then `npx vitest run` → `Tests 428 passed (428)`, pristine. The older import tests (`goodreads import`, `chunked import`, `refreshViaImport`) use `Title,Author` CSVs and must still pass untouched.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Import Spotify libraries and name each file's source in the preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The Import box explains what went wrong

`state.importError` holds a one-line message. It is cleared when a new file is chosen or the box closes, and Confirm stays disabled while it is set. Today a file that can't be read leaves the box stuck on "Reading file…", because `file.text().then(loadImportText)` has no rejection handler.

**Files:**
- Modify: `src/main.js`: `state`, `renderImportModal()`, `loadImportText()`/`closeImport()`, and the file input `change` and drop-zone `drop` handlers (about lines 1637–1656)
- Test: `src/main.test.js` (`describe('import box', …)`)

- [ ] **Step 1: Write the failing tests.** In `describe('import box', …)`, add below `const confirmButton = …`:

```js
  const importError = () => document.querySelector('.import-error')?.textContent

  const UNRECOGNISED = 'Shelf can\'t import this file. Drop a Goodreads CSV, an Apple Music Library.xml, or the YourLibrary.json from Spotify\'s zip (unzip it first).'
```

and append these tests at the end of the describe:

```js
  it('says so when it does not recognise the file, and keeps Confirm disabled', async () => {
    dropImportFile('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>')
    await fileRead()
    expect(importError()).toBe(UNRECOGNISED)
    expect(confirmButton().disabled).toBe(true)
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/api/import'))).toBe(false)
  })

  it('says a Spotify library that is cut short looks damaged', async () => {
    dropImportFile('{"albums": [{"artist": "Radiohead", "album": "In Rai')
    await fileRead()
    expect(importError()).toBe('This file looks damaged. Export it again and retry.')
    expect(confirmButton().disabled).toBe(true)
  })

  it('says so when a recognised file has nothing to import', async () => {
    dropImportFile('{"albums": [], "tracks": [], "shows": []}')
    await fileRead()
    expect(importError()).toBe('Nothing to import in this file.')
    expect(confirmButton().disabled).toBe(true)
  })

  it('shows the server\'s message when the preview fails, and keeps Confirm disabled', async () => {
    const respond = fetch.getMockImplementation()
    fetch.mockImplementation(async (url, opts = {}) => String(url).endsWith('/api/import')
      ? { ok: false, status: 500, json: async () => ({ error: 'Failed to import books: database is locked' }) }
      : respond(url, opts))
    dropImportFile(SPOTIFY)
    await fileRead()
    expect(importError()).toBe('Failed to import books: database is locked')
    expect(confirmButton().disabled).toBe(true)
  })

  it('stops reading and says the file looks damaged when the browser cannot read it', async () => {
    dropImportFile(async () => { throw new Error('NotReadableError') })
    await fileRead()
    expect(importError()).toBe('This file looks damaged. Export it again and retry.')
  })

  it('clears the message when another file is chosen', async () => {
    dropImportFile('Name,Artist\nIn Rainbows,Radiohead')
    await fileRead()
    dropImportFile(SPOTIFY)
    await fileRead()
    expect(importError()).toBeUndefined()
    expect(confirmButton().disabled).toBe(false)
  })

  it('clears the message when the box closes', async () => {
    dropImportFile('Name,Artist\nIn Rainbows,Radiohead')
    await fileRead()
    expect(importError()).toBe(UNRECOGNISED)
    document.querySelector('.modal-close[data-action="close-import"]').click()
    document.querySelector('[data-action="import"]').click()
    expect(importError()).toBeUndefined()
  })
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/main.test.js -t "import box"` → 7 failed. The "nothing to import" and "preview fails" tests fail with `AssertionError: expected undefined to be …` (no message is shown). The other five fail with `Error: still reading`: an unrecognised file throws `TypeError: Cannot read properties of undefined (reading 'read')` inside `loadImportText`, a cut-short Spotify file throws a `SyntaxError` from `JSON.parse`, and a file the browser can't read rejects; with no rejection handler the box stays on "Reading file…". Vitest also lists those rejections under "Unhandled Errors"; that is the bug being fixed, and they disappear in Step 4.

- [ ] **Step 3: Add the errors.** In `src/main.js`:

In `state`, after the `importSummary` lines add:

```js
  // Why the chosen file can't be imported; Confirm stays disabled while it is set
  importError: null,
```

In `renderImportModal()`, directly after the `<input type="file" …>` line add:

```js
          ${state.importError ? `<div class="status error import-error">${esc(state.importError)}</div>` : ''}
```

(`status error` is the existing style the login box uses for its error line.) In the same function, change the Confirm button's condition from `${p && state.importBooks.length ? '' : 'disabled'}` to:

```js
${p && state.importBooks.length && !state.importError ? '' : 'disabled'}
```

Below `const IMPORT_SOURCES = { … }` add:

```js
const IMPORT_ERRORS = {
  unrecognised: 'Shelf can\'t import this file. Drop a Goodreads CSV, an Apple Music Library.xml, or the YourLibrary.json from Spotify\'s zip (unzip it first).',
  damaged: 'This file looks damaged. Export it again and retry.',
  empty: 'Nothing to import in this file.'
}
```

Replace `loadImportText` (keep the `window.__loadImportText` line after it) and `closeImport` with:

```js
// Reads an import file into entries, or throws with the message the Import box shows
function readImportText(text) {
  const type = detectImportFile(text)
  const source = IMPORT_SOURCES[type]
  if (!source) throw new Error(IMPORT_ERRORS.unrecognised)
  let parsed
  try {
    parsed = source.read(text)
  } catch (e) {
    throw new Error(IMPORT_ERRORS.damaged)
  }
  const { books, failed } = parsed
  if (!books.length) throw new Error(IMPORT_ERRORS.empty)
  return { books, failed, summary: importSummary(type, books) }
}

async function loadImportText(text) {
  clearImportFile()
  try {
    const { books, failed, summary } = readImportText(text)
    state.importBooks = books
    state.importFailed = failed
    state.importSummary = summary
    state.importPreview = await postImportChunks(books, true)
  } catch (e) {
    state.importError = e.message
  }
  state.importLoading = false
  render()
}
```

```js
// Forgets everything the Import box showed for the last file
function clearImportFile() {
  state.importBooks = []
  state.importFailed = []
  state.importPreview = null
  state.importSummary = ''
  state.importError = null
}

function chooseImportFile(file) {
  clearImportFile()
  state.importLoading = true
  render()
  file.text().then(loadImportText, () => {
    state.importError = IMPORT_ERRORS.damaged
    state.importLoading = false
    render()
  })
}

function closeImport() {
  state.importOpen = false
  clearImportFile()
  state.importLoading = false
  render()
}
```

In `attachEventListeners()`, in the file input's `change` handler replace

```js
    const file = importFile.files?.[0]
    if (!file) return
    state.importLoading = true
    render()
    file.text().then(loadImportText)
```

with

```js
    const file = importFile.files?.[0]
    if (file) chooseImportFile(file)
```

and in the drop zone's `drop` handler replace

```js
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    state.importLoading = true
    render()
    file.text().then(loadImportText)
```

with

```js
    const file = e.dataTransfer?.files?.[0]
    if (file) chooseImportFile(file)
```

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "import box"` → 12 passed, no unhandled errors. Then `npx vitest run` → `Tests 435 passed (435)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Say why a file can't be imported instead of hanging on Reading file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: The toast slot gets its own module

The cover finder needs a toast that stays and updates. `showToast` lives privately in `main.js` where it can't be tested on its own, so it moves, unchanged in behaviour, into `src/toast.js` first.

**Files:**
- Create: `src/toast.js`, `src/toast.test.js`
- Modify: `src/main.js` (delete `showToast` and `toastTimer`, about lines 68–80; add an import)

- [ ] **Step 1: Write the failing test.** Create `src/toast.test.js`. Each test re-imports the module so its timer state starts fresh.

```js
// ABOUTME: Tests for the toast slot: brief messages that clear themselves, and a progress
// ABOUTME: message that stays, updates in place, and comes back after a brief one.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let toast

beforeEach(async () => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  vi.resetModules()
  toast = await import('./toast.js')
})

afterEach(() => {
  vi.useRealTimers()
})

const shown = () => document.querySelector('#toast-root .toast')

describe('showToast', () => {
  it('shows a message and clears it after 3 seconds', () => {
    toast.showToast('Saved')
    expect(shown().textContent).toBe('Saved')
    expect(shown().classList.contains('toast-success')).toBe(true)
    vi.advanceTimersByTime(2999)
    expect(shown().textContent).toBe('Saved')
    vi.advanceTimersByTime(1)
    expect(shown()).toBeNull()
  })

  it('shows an error in the error style and escapes the message', () => {
    toast.showToast('<b>Save failed</b>', 'error')
    expect(shown().classList.contains('toast-error')).toBe(true)
    expect(shown().textContent).toBe('<b>Save failed</b>')
    expect(shown().querySelector('b')).toBeNull()
  })

  it('replaces the message showing and restarts the 3 seconds', () => {
    toast.showToast('Saved')
    vi.advanceTimersByTime(2000)
    toast.showToast('Notes saved')
    vi.advanceTimersByTime(2000)
    expect(shown().textContent).toBe('Notes saved')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/toast.test.js` → FAIL with `Failed to resolve import "./toast.js" from "src/toast.test.js". Does the file exist?`

- [ ] **Step 3: Move `showToast`.** Create `src/toast.js` with the function as it is in `main.js`, exported:

```js
// ABOUTME: The single toast slot: brief messages that clear themselves after 3 seconds.
// ABOUTME: Toasts render into their own root so they never disturb focus or form state.

import { esc } from './html.js'

let toastTimer = null

export function showToast(message, type = 'success') {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="toast toast-${type}">${esc(message)}</div>`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { root.innerHTML = '' }, 3000)
}
```

In `src/main.js`, delete the block from `// Toast helper - renders into its own root…` through the closing `}` of `showToast` (and the blank line after it), and add below `import { coverTypeSvg } from './spines.js'`:

```js
import { showToast } from './toast.js'
```

`esc` is still used elsewhere in `main.js`, so keep its import.

- [ ] **Step 4: Run it.** `npx vitest run src/toast.test.js` → `Tests 3 passed (3)`. Then `npx vitest run` → `Tests 438 passed (438)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/toast.js src/toast.test.js src/main.js
git commit -m "Give toasts their own module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: A progress toast that stays and updates in place

One slot shows one toast. A progress message stays until ended and updates in place; a brief toast shown meanwhile covers it for its 3 seconds and then the progress message returns. An update during a brief toast waits for it to finish.

**Files:**
- Modify: `src/toast.js` (replace whole file)
- Test: `src/toast.test.js` (append)

- [ ] **Step 1: Write the failing tests.** Append to `src/toast.test.js`:

```js
describe('showProgressToast', () => {
  it('stays until it is ended, updating in place', () => {
    toast.showProgressToast('Finding covers 0 / 2 · about 1 min left')
    vi.advanceTimersByTime(10_000)
    expect(shown().textContent).toBe('Finding covers 0 / 2 · about 1 min left')
    toast.showProgressToast('Finding covers 1 / 2 · about 1 min left')
    expect(shown().textContent).toBe('Finding covers 1 / 2 · about 1 min left')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })

  it('comes back after a brief toast shown over it', () => {
    toast.showProgressToast('Finding covers 3 / 9 · about 1 min left')
    toast.showToast('Saved')
    expect(shown().textContent).toBe('Saved')
    vi.advanceTimersByTime(3000)
    expect(shown().textContent).toBe('Finding covers 3 / 9 · about 1 min left')
  })

  it('waits for a brief toast to finish before showing an update', () => {
    toast.showProgressToast('Finding covers 3 / 9 · about 1 min left')
    toast.showToast('Saved')
    toast.showProgressToast('Finding covers 4 / 9 · about 1 min left')
    expect(shown().textContent).toBe('Saved')
    vi.advanceTimersByTime(3000)
    expect(shown().textContent).toBe('Finding covers 4 / 9 · about 1 min left')
  })

  it('first appears once a brief toast already showing has finished', () => {
    toast.showToast('Imported: 2 added, 0 filled, 0 skipped')
    toast.showProgressToast('Finding covers 0 / 2 · about 1 min left')
    expect(shown().textContent).toBe('Imported: 2 added, 0 filled, 0 skipped')
    vi.advanceTimersByTime(3000)
    expect(shown().textContent).toBe('Finding covers 0 / 2 · about 1 min left')
  })
})

describe('endProgressToast', () => {
  it('replaces the progress toast with a brief one that clears like any other', () => {
    toast.showProgressToast('Finding covers 1 / 2 · about 1 min left')
    toast.endProgressToast('Found 2 covers')
    expect(shown().textContent).toBe('Found 2 covers')
    vi.advanceTimersByTime(3000)
    expect(shown()).toBeNull()
  })

  it('can end on an error', () => {
    toast.showProgressToast('Finding covers 1 / 9 · about 1 min left')
    toast.endProgressToast('Stopped finding covers', 'error')
    expect(shown().classList.contains('toast-error')).toBe(true)
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/toast.test.js` → 6 failed with `TypeError: toast.showProgressToast is not a function`.

- [ ] **Step 3: Replace `src/toast.js`.** The brief toast's timer clears the same root element it painted, as the moved code did. That matters in the test suite: every `loadApp` re-imports `main.js` into a fresh `document.body`, and an earlier module's 3-second timer must not wipe the next test's toast.

```js
// ABOUTME: The single toast slot: brief messages that clear after 3 seconds, and one progress
// ABOUTME: message that stays and updates in place, returning whenever a brief message ends.

import { esc } from './html.js'

const BRIEF_MS = 3000

// Set while a brief toast is showing
let briefTimer = null
// The progress toast's text, or null when there is none
let progressMessage = null

// Toasts render into their own root so they never disturb focus or form state
function toastRoot() {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    document.body.appendChild(root)
  }
  return root
}

function paint(root, message, type = 'success') {
  root.innerHTML = message ? `<div class="toast toast-${type}">${esc(message)}</div>` : ''
}

export function showToast(message, type = 'success') {
  const root = toastRoot()
  paint(root, message, type)
  clearTimeout(briefTimer)
  briefTimer = setTimeout(() => {
    briefTimer = null
    paint(root, progressMessage)
  }, BRIEF_MS)
}

export function showProgressToast(message) {
  progressMessage = message
  if (!briefTimer) paint(toastRoot(), message)
}

export function endProgressToast(message, type = 'success') {
  progressMessage = null
  showToast(message, type)
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/toast.test.js` → `Tests 9 passed (9)`. Then `npx vitest run` → `Tests 444 passed (444)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/toast.js src/toast.test.js
git commit -m "Let a progress toast stay up and update while other toasts come and go" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Which items to look up a cover for, and what to search for

**Files:**
- Create: `src/covers.js`, `src/covers.test.js`

- [ ] **Step 1: Write the failing test.** Create `src/covers.test.js`:

```js
// ABOUTME: Tests for finding missing covers: which items need one, the lookup query, matching
// ABOUTME: iTunes results, the update that saves a cover, and the paced, one-at-a-time run.

import { describe, it, expect } from 'vitest'
import { missingCover, canFindCover, coverQuery } from './covers.js'

const album = (fields = {}) => ({ id: 'in-rainbows', title: 'In Rainbows', author: 'Radiohead', medium: 'album', coverUrl: null, year: null, tags: [], ...fields })
const podcast = (fields = {}) => ({ id: 'radiolab', title: 'Radiolab', author: 'WNYC Studios', medium: 'podcast', coverUrl: null, year: null, tags: [], ...fields })
const result = (fields = {}) => ({ title: 'In Rainbows', author: 'Radiohead', year: 2007, coverUrl: 'https://art.example/in-rainbows.jpg', ...fields })

describe('missingCover', () => {
  it('picks albums and podcasts whose cover is blank, whether or not a lookup could match them', () => {
    expect(missingCover(album())).toBe(true)
    expect(missingCover(album({ author: null }))).toBe(true)
    expect(missingCover(podcast({ coverUrl: '' }))).toBe(true)
    expect(missingCover(album({ coverUrl: 'https://art.example/x.jpg' }))).toBe(false)
    expect(missingCover({ ...album(), medium: 'book' })).toBe(false)
  })
})

describe('canFindCover', () => {
  it('picks albums and podcasts whose cover is blank', () => {
    expect(canFindCover(album())).toBe(true)
    expect(canFindCover(album({ coverUrl: '' }))).toBe(true)
    expect(canFindCover(podcast())).toBe(true)
    expect(canFindCover(podcast({ author: null }))).toBe(true)
  })

  it('leaves items that have a cover, and other media', () => {
    expect(canFindCover(album({ coverUrl: 'https://art.example/x.jpg' }))).toBe(false)
    expect(canFindCover({ ...album(), medium: 'book' })).toBe(false)
    expect(canFindCover({ ...album(), medium: 'movie' })).toBe(false)
  })

  it('leaves items no lookup could ever match, so they cost no lookup', () => {
    expect(canFindCover(album({ author: null }))).toBe(false)
    expect(canFindCover(album({ author: '???' }))).toBe(false)
    expect(canFindCover(album({ title: '!!!' }))).toBe(false)
    expect(canFindCover(podcast({ title: '' }))).toBe(false)
  })
})

describe('coverQuery', () => {
  it('searches an album by title and creator', () => {
    expect(coverQuery(album())).toBe('In Rainbows Radiohead')
  })

  it('searches an album with no creator by its title', () => {
    expect(coverQuery(album({ author: null }))).toBe('In Rainbows')
  })

  it('searches a podcast by its title alone', () => {
    expect(coverQuery(podcast())).toBe('Radiolab')
  })
})
```

(`result` is used from Task 11 on.)

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/covers.test.js` → FAIL with `Failed to resolve import "./covers.js" from "src/covers.test.js". Does the file exist?`

- [ ] **Step 3: Create `src/covers.js`.** An album whose normalised title or creator is empty, or a podcast whose normalised title is empty, can never match (Task 11's rule), so `canFindCover` leaves it out: the run never spends a lookup on it, and it counts neither towards progress nor towards the stop-after-3-failures rule. `missingCover` still counts it, so the menu can tell "nothing missing" apart from "nothing left to look up" (Task 16).

```js
// ABOUTME: Finds covers for albums and podcasts that have none: picks the items, builds each
// ABOUTME: iTunes query, matches the results, and runs the lookups one at a time, 3 seconds apart.

import { normKey } from './match.js'

// An empty normalised title, or an album's empty creator, never matches anything
const canMatch = item => normKey(item.title) !== '' && (item.medium !== 'album' || normKey(item.author) !== '')

// Albums and podcasts whose cover is blank
export const missingCover = item => (item.medium === 'album' || item.medium === 'podcast') && !item.coverUrl

// Albums and podcasts with a blank cover that a lookup could match
export const canFindCover = item => missingCover(item) && canMatch(item)

export const coverQuery = item => item.medium === 'album'
  ? [item.title, item.author].filter(Boolean).join(' ')
  : item.title
```

- [ ] **Step 4: Run it.** `npx vitest run src/covers.test.js` → `Tests 7 passed (7)`. Then `npx vitest run` → `Tests 451 passed (451)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/covers.js src/covers.test.js
git commit -m "Pick out albums and podcasts whose missing cover a lookup could find" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Match an iTunes result to an item

**Files:**
- Modify: `src/covers.js`
- Test: `src/covers.test.js`

- [ ] **Step 1: Write the failing tests.** In `src/covers.test.js`, change the covers import to:

```js
import { missingCover, canFindCover, coverQuery, matchCover } from './covers.js'
```

and append:

```js
describe('matchCover', () => {
  it('takes the first result whose title and creator match once normalised', () => {
    const results = [
      result({ title: 'In Rainbows (Disk 2)', coverUrl: 'https://art.example/disk2.jpg' }),
      result({ title: 'in rainbows!', author: 'RADIOHEAD', coverUrl: 'https://art.example/first.jpg' }),
      result({ coverUrl: 'https://art.example/second.jpg' })
    ]
    expect(matchCover(album(), results).coverUrl).toBe('https://art.example/first.jpg')
  })

  it('skips an album result by another artist', () => {
    expect(matchCover(album(), [result({ author: 'Radiohead Tribute Band' })])).toBeNull()
  })

  it('removes iTunes\' " - Single" and " - EP" from result titles', () => {
    expect(matchCover(album({ title: 'Creep' }), [result({ title: 'Creep - Single' })])).not.toBeNull()
    expect(matchCover(album({ title: 'My Iron Lung' }), [result({ title: 'My Iron Lung - EP' })])).not.toBeNull()
  })

  it('matches a podcast on its title alone', () => {
    expect(matchCover(podcast(), [result({ title: 'Radiolab', author: 'WNYC' })])).not.toBeNull()
  })

  it('never matches on an empty normalised title or creator', () => {
    expect(matchCover(album({ title: '!!!' }), [result({ title: '???' })])).toBeNull()
    expect(matchCover(album({ author: null }), [result({ author: null })])).toBeNull()
    expect(matchCover(podcast({ title: '...' }), [result({ title: '' })])).toBeNull()
  })

  it('skips a matching result that has no artwork', () => {
    expect(matchCover(album(), [result({ coverUrl: null })])).toBeNull()
  })

  it('finds nothing in no results', () => {
    expect(matchCover(album(), [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/covers.test.js` → 7 failed with `TypeError: matchCover is not a function`.

- [ ] **Step 3: Add `matchCover`.** Append to `src/covers.js`:

```js

// iTunes names singles and EPs "Title - Single" and "Title - EP"
const releaseTitle = title => String(title || '').replace(/ - (Single|EP)$/, '')

// The first result with artwork whose title matches the item's, and for an album whose creator does too.
// Podcasts match on title alone: Spotify's publisher and iTunes' artist often differ.
export function matchCover(item, results) {
  if (!canMatch(item)) return null
  const title = normKey(item.title)
  const creator = normKey(item.author)
  const isAlbum = item.medium === 'album'
  return results.find(r => r.coverUrl
    && normKey(releaseTitle(r.title)) === title
    && (!isAlbum || normKey(r.author) === creator)) || null
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/covers.test.js` → `Tests 14 passed (14)`. Then `npx vitest run` → `Tests 458 passed (458)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/covers.js src/covers.test.js
git commit -m "Match iTunes results to albums and podcasts by title and artist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: What a found cover saves, and how progress reads

**Files:**
- Modify: `src/covers.js`
- Test: `src/covers.test.js`

- [ ] **Step 1: Write the failing tests.** Change the covers import to:

```js
import { missingCover, canFindCover, coverQuery, matchCover, coverUpdate, coverProgressText, coversFoundText } from './covers.js'
```

and append:

```js
describe('coverUpdate', () => {
  it('adds the cover, and the year when the item has none', () => {
    expect(coverUpdate(album(), result())).toEqual({ ...album(), coverUrl: 'https://art.example/in-rainbows.jpg', year: 2007 })
  })

  it('keeps a year the item already has', () => {
    expect(coverUpdate(album({ year: 2008 }), result()).year).toBe(2008)
  })

  it('is null when the item has a cover by now', () => {
    expect(coverUpdate(album({ coverUrl: 'https://art.example/mine.jpg' }), result())).toBeNull()
  })

  it('is null when the item is gone', () => {
    expect(coverUpdate(undefined, result())).toBeNull()
  })
})

describe('progress text', () => {
  it('counts the items tried and estimates the minutes left at 3 seconds each', () => {
    expect(coverProgressText(12, 140)).toBe('Finding covers 12 / 140 · about 6 min left')
  })

  it('never says less than a minute is left', () => {
    expect(coverProgressText(139, 140)).toBe('Finding covers 139 / 140 · about 1 min left')
  })

  it('reports the covers found', () => {
    expect(coversFoundText(131)).toBe('Found 131 covers')
    expect(coversFoundText(1)).toBe('Found 1 cover')
    expect(coversFoundText(0)).toBe('Found 0 covers')
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/covers.test.js` → 7 failed with `TypeError: coverUpdate is not a function` / `coverProgressText is not a function` / `coversFoundText is not a function`.

- [ ] **Step 3: Add them.** In `src/covers.js`, below `import { normKey } from './match.js'` add:

```js

const PACE_MS = 3000
```

(The `canMatch` and `canFindCover` lines stay below it.)

and append at the end:

```js

// The item as saved with a found cover, or null when it is gone or has a cover by now.
// A field that has a value is never overwritten.
export function coverUpdate(current, result) {
  if (!current || current.coverUrl) return null
  return { ...current, coverUrl: result.coverUrl, year: current.year ?? result.year }
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

export function coverProgressText(done, total) {
  const minutes = Math.max(1, Math.round((total - done) * PACE_MS / 60_000))
  return `Finding covers ${done} / ${total} · about ${minutes} min left`
}

export const coversFoundText = found => `Found ${plural(found, 'cover')}`
```

- [ ] **Step 4: Run it.** `npx vitest run src/covers.test.js` → `Tests 21 passed (21)`. Then `npx vitest run` → `Tests 465 passed (465)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/covers.js src/covers.test.js
git commit -m "Save a found cover without overwriting anything, and word the progress" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Look up covers one at a time, 3 seconds apart

`findCovers(items, { lookup, save, progress })` is the loop. It knows nothing about `fetch` or `state`: `main.js` passes `lookup` (resolves to results, rejects on failure) and `save` (resolves `true` when it stored a cover). Pacing uses `setTimeout`, so the tests use `vi.useFakeTimers()` and move the clock by hand instead of waiting 3 real seconds.

How the fake-timer calls work: `vi.advanceTimersByTimeAsync(ms)` moves the fake clock forward by `ms`, firing any timers due and letting pending promises settle in between. `vi.runAllTimersAsync()` keeps firing timers until none are left, which finishes a whole run.

**Files:**
- Modify: `src/covers.js`
- Test: `src/covers.test.js`

- [ ] **Step 1: Write the failing tests.** Change the two import lines at the top of `src/covers.test.js` to:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { missingCover, canFindCover, coverQuery, matchCover, coverUpdate, findCovers, coverProgressText, coversFoundText } from './covers.js'
```

and append:

```js
describe('findCovers', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // A lookup answering from a table of query → results; a query not in the table finds nothing
  const lookupFrom = table => vi.fn(async item => table[coverQuery(item)] || [])

  it('saves the matching result for each item and counts the covers found', async () => {
    const items = [album(), podcast()]
    const lookup = lookupFrom({ 'In Rainbows Radiohead': [result()], Radiolab: [result({ title: 'Radiolab', author: 'WNYC' })] })
    const save = vi.fn(async () => true)
    const run = findCovers(items, { lookup, save, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 2, stopped: false })
    expect(save.mock.calls.map(([item, match]) => [item.id, match.title])).toEqual([['in-rainbows', 'In Rainbows'], ['radiolab', 'Radiolab']])
  })

  it('saves nothing for an item without a match', async () => {
    const save = vi.fn(async () => true)
    const run = findCovers([album()], { lookup: lookupFrom({}), save, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 0, stopped: false })
    expect(save).not.toHaveBeenCalled()
  })

  it('does not count a cover the save declined', async () => {
    const run = findCovers([album()], { lookup: lookupFrom({ 'In Rainbows Radiohead': [result()] }), save: async () => false, progress: () => {} })
    await vi.runAllTimersAsync()
    expect((await run).found).toBe(0)
  })

  it('looks up one item at a time, 3 seconds apart', async () => {
    let answer
    const lookup = vi.fn(() => new Promise(resolve => { answer = resolve }))
    const run = findCovers([album({ id: 'a' }), album({ id: 'b' })], { lookup, save: async () => true, progress: () => {} })

    await vi.advanceTimersByTimeAsync(0)
    expect(lookup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lookup).toHaveBeenCalledTimes(1) // still waiting on the first answer

    answer([])
    await vi.advanceTimersByTimeAsync(2999)
    expect(lookup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(lookup).toHaveBeenCalledTimes(2)

    answer([])
    await run
  })

  it('stops after 3 lookups in a row fail', async () => {
    const lookup = vi.fn(async () => { throw new Error('Lookup failed (500)') })
    const items = [1, 2, 3, 4, 5].map(n => album({ id: `a${n}` }))
    const run = findCovers(items, { lookup, save: async () => true, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 0, stopped: true })
    expect(lookup).toHaveBeenCalledTimes(3)
  })

  it('starts counting failures again after a lookup succeeds', async () => {
    const answers = ['fail', 'fail', 'ok', 'fail', 'fail']
    const lookup = vi.fn(async () => {
      if (answers.shift() === 'fail') throw new Error('Lookup failed (500)')
      return []
    })
    const items = [1, 2, 3, 4, 5].map(n => album({ id: `a${n}` }))
    const run = findCovers(items, { lookup, save: async () => true, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 0, stopped: false })
    expect(lookup).toHaveBeenCalledTimes(5)
  })

  it('moves on when a save fails, leaving that item for the next run', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to update book'))
      .mockResolvedValueOnce(true)
    const lookup = lookupFrom({ 'In Rainbows Radiohead': [result()] })
    const run = findCovers([album({ id: 'a' }), album({ id: 'b' })], { lookup, save, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 1, stopped: false })
  })

  it('reports progress before each lookup', async () => {
    const progress = vi.fn()
    const run = findCovers([album({ id: 'a' }), album({ id: 'b' }), album({ id: 'c' })], { lookup: lookupFrom({}), save: async () => true, progress })
    await vi.runAllTimersAsync()
    await run
    expect(progress.mock.calls).toEqual([[0, 3], [1, 3], [2, 3]])
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/covers.test.js` → 8 failed with `TypeError: findCovers is not a function`.

- [ ] **Step 3: Add the loop.** In `src/covers.js`, below `const PACE_MS = 3000` add:

```js
const FAILURES_BEFORE_STOPPING = 3

export const COVERS_STOPPED = 'Stopped finding covers: iTunes isn\'t answering. Try Find missing covers later.'
```

and append at the end:

```js

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Looks up each item in turn and saves the matches. lookup(item) resolves to results or
// rejects; save(item, match) resolves true when it stored a cover; progress(done, total)
// is told before each lookup. Stops early after 3 lookups in a row fail.
export async function findCovers(items, { lookup, save, progress }) {
  let found = 0
  let failures = 0
  for (const [done, item] of items.entries()) {
    if (done > 0) await wait(PACE_MS)
    progress(done, items.length)
    let results
    try {
      results = await lookup(item)
      failures = 0
    } catch (e) {
      failures++
      if (failures === FAILURES_BEFORE_STOPPING) return { found, stopped: true }
      continue
    }
    const match = matchCover(item, results)
    try {
      if (match && await save(item, match)) found++
    } catch (e) {
      // A failed save leaves the item without a cover for the next run to find
    }
  }
  return { found, stopped: false }
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/covers.test.js` → `Tests 29 passed (29)`. Then `npx vitest run` → `Tests 473 passed (473)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/covers.js src/covers.test.js
git commit -m "Look up missing covers one at a time and stop when iTunes stops answering" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: One lookup helper for every metadata search

`main.js` calls `/api/lookup` inline in two places: quick add's `resolveQuickQueue` (about line 1390) and the Add Media box's lookup button (about line 1770). The cover finder would make a third. This task moves the call into the `api` object first. It is a refactor: behaviour doesn't change, and the tests that already cover both callers (`describe('quick add', …)` and the Add Media lookup test around line 527 of `src/main.test.js`) must stay green. No new test, because there is no new behaviour.

**Files:**
- Modify: `src/main.js`: the `api` object (lines 20–66), `resolveQuickQueue` (about line 1390), the `lookup-media` click handler (about line 1770)

- [ ] **Step 1: Confirm the callers are covered.** `npx vitest run src/main.test.js -t "quick add"` → 3 passed. `npx vitest run src/main.test.js -t "adds an album via iTunes lookup"` → 1 passed. These are the safety net for the refactor.

- [ ] **Step 2: Add `api.lookup`.** In `src/main.js`, in the `api` object, change the end of `deleteBook` from

```js
    if (!res.ok) throw new Error('Failed to delete book')
    return true
  }
}
```

to

```js
    if (!res.ok) throw new Error('Failed to delete book')
    return true
  },

  // Metadata search: Open Library for books, iTunes for everything else
  async lookup(medium, q) {
    const res = await fetch(`/api/lookup?medium=${encodeURIComponent(medium)}&q=${encodeURIComponent(q)}`)
    if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
    return (await res.json()).results
  }
}
```

- [ ] **Step 3: Use it from both callers.** In `resolveQuickQueue`, replace

```js
      const res = await fetch(`/api/lookup?medium=${encodeURIComponent(q.medium)}&q=${encodeURIComponent(q.title)}`)
      const best = res.ok ? (await res.json()).results[0] : null
```

with

```js
      const best = (await api.lookup(q.medium, q.title))[0]
```

(A failed lookup used to give `best = null` and count a miss; it now throws into the existing `catch`, which also counts a miss.) In the `lookup-media` click handler, replace

```js
      const res = await fetch(`/api/lookup?medium=${encodeURIComponent(medium)}&q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Lookup failed')
      const { results } = await res.json()
```

with

```js
      const results = await api.lookup(medium, q)
```

Check there is no inline copy left: `grep -n "api/lookup" src/main.js` → only the line inside `api.lookup`.

- [ ] **Step 4: Run everything.** `npx vitest run` → `Tests 473 passed (473)`, pristine (the count doesn't change).

- [ ] **Step 5: Commit.**

```bash
git add src/main.js
git commit -m "Send every metadata search through one lookup helper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: The shelf says when it is being pressed

Redrawing the results rebuilds the shelf, which would yank it out from under a press or drag. The cover finder needs to know when to wait (Task 17), so the shelf controller reports it.

**Files:**
- Modify: `src/shelf.js` (the object `mountShelf` returns, about line 422)
- Test: `src/shelf.test.js` (next to `it('rests while a press is held without moving', …)`, about line 325)

- [ ] **Step 1: Write the failing test.** In `src/shelf.test.js`, directly above the `it.each([` that begins `['the window loses focus', …` (it sits in the same describe as `press` and `wrap`), add:

```js
    it('says whether a press on the stage is under way', () => {
      mountWith(books(10))
      expect(control.dragging()).toBe(false)
      wrap().dispatchEvent(press('pointerdown', 100, 1))
      expect(control.dragging()).toBe(true)
      window.dispatchEvent(press('pointerup', 100, 0))
      expect(control.dragging()).toBe(false)
    })

```

(`control` is the controller `mountWith` stores; `press` and `wrap` are defined just above in that describe.)

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/shelf.test.js -t "press on the stage"` → 1 failed: `TypeError: control.dragging is not a function`.

- [ ] **Step 3: Report it.** In `src/shelf.js`, in the object `mountShelf` returns, below `centreRect,` add:

```js
    // Whether a press or drag on the stage is under way
    dragging: () => drag !== null,
```

- [ ] **Step 4: Run it.** `npx vitest run src/shelf.test.js` → all pass. Then `npx vitest run` → `Tests 474 passed (474)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/shelf.js src/shelf.test.js
git commit -m "Let the shelf report when it is being pressed or dragged" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Find missing covers from the avatar menu

**Files:**
- Modify: `src/main.js`: imports; avatar dropdown in `render()` (about line 516); a cover-run block above `closeImport()`; a listener next to the Import button's (about line 1547)
- Test: `src/main.test.js` (new `describe('finding covers', …)` inserted just above `describe('metadata sorting', …)`)

These tests load the app with real timers (`loadApp` needs them), then switch to fake timers so the 3-second pace takes no real time. `toastSays` moves the fake clock a tenth of a second at a time until the toast reads what the test expects, or fails after a minute of fake time.

This task redraws the results once, when the run ends. Task 17 adds redraws during a long run.

- [ ] **Step 1: Write the failing tests.** Insert above `describe('metadata sorting', () => {`:

```js
describe('finding covers', () => {
  const ALBUMS = [
    { id: 'in-rainbows', title: 'In Rainbows', author: 'Radiohead', tags: ['spotify'], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null, medium: 'album' },
    { id: 'radiolab', title: 'Radiolab', author: 'WNYC Studios', tags: ['spotify'], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null, medium: 'podcast' },
    { id: 'abbey-road', title: 'Abbey Road', author: 'The Beatles', tags: [], isbn: null, coverUrl: 'https://art.example/abbey.jpg', rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: 1969, medium: 'album' },
    // No lookup could match an album without an artist, so it is never looked up or counted
    { id: 'demos', title: 'Demos', author: null, tags: [], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null, medium: 'album' }
  ]
  const library = () => [...BOOKS, ...ALBUMS].map(b => ({ ...b, tags: [...b.tags] }))

  // iTunes as the lookup endpoint returns it, keyed by the query the app sends
  const ITUNES = {
    'In Rainbows Radiohead': [{ title: 'In Rainbows', author: 'Radiohead', year: 2007, coverUrl: 'https://art.example/in-rainbows.jpg' }],
    Radiolab: [{ title: 'Radiolab', author: 'WNYC', year: 2002, coverUrl: 'https://art.example/radiolab.jpg' }]
  }

  // Answers lookups with answer(query); everything else as loadApp does
  function answerLookups(answer) {
    const respond = fetch.getMockImplementation()
    fetch.mockImplementation(async (url, opts = {}) => {
      if (!String(url).includes('/api/lookup')) return respond(url, opts)
      return answer(new URL(String(url), 'http://shelf.test').searchParams.get('q'))
    })
  }
  const found = results => ({ ok: true, json: async () => ({ results }) })

  const lookups = () => fetch.mock.calls.filter(([u]) => String(u).includes('/api/lookup'))
  const coverSaves = () => fetch.mock.calls
    .filter(([u, o]) => o?.method === 'PUT' && /\/api\/books\//.test(String(u)))
    .map(([u, o]) => ({ id: String(u).split('/').pop(), ...JSON.parse(o.body) }))
  const toast = () => document.querySelector('.toast')?.textContent
  const tileCover = id => document.querySelector(`.cover-tile[data-id="${id}"] img`).getAttribute('src')

  // Runs the fake clock on, a tenth of a second at a time, until the toast says text
  async function toastSays(text) {
    for (let ms = 0; ms < 60_000 && toast() !== text; ms += 100) await vi.advanceTimersByTimeAsync(100)
    expect(toast()).toBe(text)
  }

  const findMissingCovers = () => {
    document.querySelector('[data-action="avatar-menu"]').click()
    document.querySelector('[data-action="find-covers"]').click()
  }

  // Loads the app with real timers, then fakes them so the 3-second pace takes no time
  async function start(books = library(), options) {
    await loadApp(books, options)
    answerLookups(q => found(ITUNES[q] || []))
    vi.useFakeTimers()
  }

  afterEach(() => vi.useRealTimers())

  it('saves the whole item with the cover, so nothing else changes', async () => {
    await start()
    findMissingCovers()
    await toastSays('Found 2 covers')
    expect(coverSaves()[0]).toEqual({ ...ALBUMS[0], coverUrl: 'https://art.example/in-rainbows.jpg', year: 2007 })
  })

  it('shows the found covers in the library when the run ends', async () => {
    await start()
    findMissingCovers()
    await toastSays('Found 2 covers')
    expect(tileCover('in-rainbows')).toBe('https://art.example/in-rainbows.jpg')
    expect(tileCover('radiolab')).toBe('https://art.example/radiolab.jpg')
  })

  it('shows its progress, then the count found', async () => {
    await start()
    let answerRadiolab
    answerLookups(q => q === 'Radiolab' ? new Promise(r => { answerRadiolab = r }) : found(ITUNES[q]))
    findMissingCovers()
    expect(toast()).toBe('Finding covers 0 / 2 · about 1 min left')
    await toastSays('Finding covers 1 / 2 · about 1 min left')
    answerRadiolab(found(ITUNES.Radiolab))
    await toastSays('Found 2 covers')
  })

  it('never overwrites a cover set while the lookup was out', async () => {
    await start()
    // Holds the run's first lookup; the cover picker's own lookups are answered at once
    let answerInRainbows
    answerLookups(q => q === 'In Rainbows Radiohead' && !answerInRainbows
      ? new Promise(r => { answerInRainbows = r })
      : found(ITUNES[q] || []))
    findMissingCovers()
    await vi.waitFor(() => { if (!answerInRainbows) throw new Error('no lookup yet') })

    // Link a cover by hand through the cover picker, with real timers while the UI works
    vi.useRealTimers()
    document.querySelector('[data-view="list"]').click()
    document.querySelector('.list-title [data-id="in-rainbows"]').click()
    document.querySelector('[data-action="open-cover-picker"]').click()
    await vi.waitFor(() => { if (!document.getElementById('cover-url-input')) throw new Error('picker not open') })
    document.getElementById('cover-url-input').value = 'https://example.com/my-pressing.jpg'
    document.querySelector('[data-action="use-cover-url"]').click()
    await vi.waitFor(() => { if (toast() !== 'Cover linked') throw new Error('cover not saved yet') })
    vi.useFakeTimers()

    answerInRainbows(found(ITUNES['In Rainbows Radiohead']))
    await toastSays('Found 1 cover')
    expect(coverSaves().map(s => s.id)).toEqual(['radiolab'])
  })

  it('runs only once at a time', async () => {
    await start()
    findMissingCovers()
    findMissingCovers()
    await toastSays('Found 2 covers')
    expect(lookups()).toHaveLength(2)
  })

  it('stops after 3 failed lookups in a row and says why', async () => {
    const more = [1, 2, 3].map(n => ({ ...ALBUMS[0], id: `album-${n}`, title: `Album ${n}` }))
    await start([...library(), ...more])
    answerLookups(() => ({ ok: false, status: 500, json: async () => ({ error: 'Lookup failed' }) }))
    findMissingCovers()
    await toastSays('Stopped finding covers: iTunes isn\'t answering. Try Find missing covers later.')
    expect(document.querySelector('.toast').classList.contains('toast-error')).toBe(true)
    expect(lookups()).toHaveLength(3)
  })

  it('picks up, from the menu, items a previous run missed', async () => {
    await start()
    answerLookups(() => found([]))
    findMissingCovers()
    await toastSays('Found 0 covers')
    expect(coverSaves()).toEqual([])

    answerLookups(q => found(ITUNES[q] || []))
    findMissingCovers()
    await toastSays('Found 2 covers')
    expect(coverSaves().map(s => s.id)).toEqual(['in-rainbows', 'radiolab'])
  })

  it('can run again after a run breaks unexpectedly', async () => {
    await start()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    // An answer with no results list breaks the run partway
    answerLookups(() => ({ ok: true, json: async () => ({}) }))
    findMissingCovers()
    await toastSays('Stopped finding covers: iTunes isn\'t answering. Try Find missing covers later.')
    expect(error).toHaveBeenCalledWith('Finding covers failed:', expect.any(TypeError))
    error.mockRestore()

    answerLookups(q => found(ITUNES[q] || []))
    findMissingCovers()
    await toastSays('Found 2 covers')
  })

  it('says so from the menu when nothing is missing a cover', async () => {
    await start(BOOKS)
    findMissingCovers()
    expect(toast()).toBe('Nothing missing. Looking sharp.')
    expect(lookups()).toHaveLength(0)
  })

  it('says so from the menu when the only items missing a cover cannot be looked up', async () => {
    await start([...BOOKS, ALBUMS[3]])
    findMissingCovers()
    expect(toast()).toBe('Nothing left to look up.')
    expect(lookups()).toHaveLength(0)
  })
})

```

Notes for the reader of these tests:
- "Found 2 covers" with three coverless albums and podcasts in `ALBUMS`: `demos` has no artist, so `canFindCover` leaves it out, and progress counts 2, not 3.
- The "never overwrites" test waits for "Cover linked" because closing the picker happens before its `PATCH` returns, and only once the `PATCH` has returned does `state.books` hold the hand-linked cover.
- The "breaks unexpectedly" test makes the lookup answer `{}`, so `api.lookup` returns `undefined` and `matchCover` throws a `TypeError` outside `findCovers`' own error handling. The app logs it with `console.error`; the test captures and checks that log, so the suite output stays clean.

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/main.test.js -t "finding covers"` → 10 failed with `TypeError: Cannot read properties of null (reading 'click')` (there is no `find-covers` button yet).

- [ ] **Step 3: Wire it in.** In `src/main.js`:

Change `import { showToast } from './toast.js'` to:

```js
import { showToast, showProgressToast, endProgressToast } from './toast.js'
import { missingCover, canFindCover, coverQuery, coverUpdate, findCovers, coverProgressText, coversFoundText, COVERS_STOPPED } from './covers.js'
```

In `render()`'s avatar dropdown, below `<button data-action="import">Import</button>` add:

```js
              <button data-action="find-covers">Find missing covers</button>
```

Directly above `function closeImport() {` add:

```js
// Set while a cover run is going, so a second one does nothing
let findingCovers = false

// Set when a found cover has not reached the results yet
let coversToShow = false

function showFoundCovers() {
  if (!coversToShow) return
  coversToShow = false
  updateResults()
}

// Re-reads the item, since it may have gained a cover while the lookup was out
async function saveFoundCover(item, match) {
  const update = coverUpdate(state.books.find(b => b.id === item.id), match)
  if (!update) return false
  syncBookState(await api.updateBook(item.id, update))
  coversToShow = true
  return true
}

// Looks up a cover for every album and podcast that could have one found, in the background
async function findMissingCovers() {
  const items = state.books.filter(canFindCover)
  if (findingCovers || !items.length) return
  findingCovers = true
  try {
    const { found, stopped } = await findCovers(items, {
      lookup: item => api.lookup(item.medium, coverQuery(item)),
      save: saveFoundCover,
      progress: (done, total) => showProgressToast(coverProgressText(done, total))
    })
    if (stopped) endProgressToast(COVERS_STOPPED, 'error')
    else endProgressToast(coversFoundText(found))
  } catch (e) {
    console.error('Finding covers failed:', e)
    endProgressToast(COVERS_STOPPED, 'error')
  } finally {
    findingCovers = false
    showFoundCovers()
  }
}

```

The `finally` matters: without it, anything that throws past `findCovers` would leave `findingCovers` stuck at `true`, and Find missing covers would do nothing until the page reloads.

In `attachEventListeners()`, directly above `// Avatar menu` add:

```js
  // Find missing covers
  document.querySelector('.header [data-action="find-covers"]')?.addEventListener('click', () => {
    if (findingCovers) return
    if (!state.books.some(missingCover)) showToast('Nothing missing. Looking sharp.')
    else if (!state.books.some(canFindCover)) showToast('Nothing left to look up.')
    else findMissingCovers()
  })

```

"Nothing left to look up." covers coverless items that no lookup could match (Task 10), such as an album with no artist; the wording is Jason's. The menu only exists when the shelf is writable (`state.readOnly` hides the whole avatar menu), so the static read-only build never runs this.

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "finding covers"` → 10 passed. Then `npx vitest run` → `Tests 484 passed (484)`, pristine. Run the full suite twice more to make sure nothing is timing-dependent: both runs `484 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Add Find missing covers to the menu, finding album and podcast art in the background" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Show found covers without redrawing every 3 seconds

A long run would otherwise redraw the library after every save. Instead, each save only updates `state.books`. The results redraw at most once every 15 seconds, and once when the run ends. A redraw never happens under an open detail (closing it calls `render()`, which shows everything) or while the shelf is pressed (it retries a second later).

**Files:**
- Modify: `src/main.js` (the cover-run block from Task 16)
- Test: `src/main.test.js` (`describe('finding covers', …)`)

- [ ] **Step 1: Write the failing tests.** In `describe('finding covers', …)`, add after `it('shows the found covers in the library when the run ends', …)`:

```js
  it('redraws the library with found covers at most every 15 seconds during a run', async () => {
    const albums = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ ...ALBUMS[0], id: `album-${n}`, title: `Album ${n}` }))
    await start([...BOOKS, ...albums])
    answerLookups(q => found([{ title: q.replace(' Radiohead', ''), author: 'Radiohead', year: 2007, coverUrl: `https://art.example/${q.split(' ')[1]}.jpg` }]))
    findMissingCovers()
    await vi.advanceTimersByTimeAsync(14_900)
    expect(tileCover('album-1')).not.toContain('art.example') // saved at once, not yet redrawn
    await vi.advanceTimersByTimeAsync(100)
    expect(tileCover('album-1')).toBe('https://art.example/1.jpg')
    await vi.advanceTimersByTimeAsync(2_900)
    expect(tileCover('album-6')).not.toContain('art.example') // looked up just after the 15 s redraw, so it waits for the next
    await toastSays('Found 8 covers')
    expect(tileCover('album-8')).toBe('https://art.example/8.jpg')
  })

  it('leaves the library alone under an open detail, which shows the covers once it closes', async () => {
    await start()
    document.querySelector('.cover-tile[data-id="s2-dune"]').click()
    findMissingCovers()
    await toastSays('Found 2 covers')
    expect(tileCover('in-rainbows')).not.toContain('art.example')
    document.querySelector('[data-action="close-detail"]').click()
    expect(tileCover('in-rainbows')).toBe('https://art.example/in-rainbows.jpg')
  })

  it('waits for a press on the shelf to end before redrawing it', async () => {
    await start(library(), { view: 'shelf' })
    // Opening the menu re-renders, so the press starts after it
    document.querySelector('[data-action="avatar-menu"]').click()
    const shelf = document.querySelector('.shelf-view')
    document.querySelector('.shelf-stage-wrap').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 10, buttons: 1 }))
    document.querySelector('[data-action="find-covers"]').click()
    await toastSays('Found 2 covers')
    expect(document.querySelector('.shelf-view')).toBe(shelf)
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 100, clientY: 10, buttons: 0 }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(document.querySelector('.shelf-view')).not.toBe(shelf)
  })
```

How the first test reads: the eight albums are looked up at 0, 3, 6 … 21 seconds. Album 1 is saved at once, but the redraw it schedules happens at 15 s; album 7, saved at 18 s, waits for the redraw at the end of the run. The cover wall's tile `src` starts as the local `/covers/<id>.jpg` path, so "not yet redrawn" means it doesn't contain `art.example`. The shelf test compares element identity: a redraw replaces `.shelf-view` with a new element.

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/main.test.js -t "finding covers"` → 3 failed. With Task 16's code the results redraw only at the end of a run, and always:
  - `AssertionError: expected '/covers/album-1.jpg' to be 'https://art.example/1.jpg'` (no redraw at 15 s);
  - `AssertionError: expected 'https://art.example/in-rainbows.jpg' not to contain 'art.example'` (the end-of-run redraw happened under the open detail);
  - `AssertionError: expected <div class="shelf-view">…(8)</div> to be <div class="shelf-view">…(8)</div>` (the shelf was rebuilt under the press).

- [ ] **Step 3: Coalesce and defer the redraw.** In `src/main.js`, replace

```js
// Set when a found cover has not reached the results yet
let coversToShow = false

function showFoundCovers() {
  if (!coversToShow) return
  coversToShow = false
  updateResults()
}
```

with

```js
// Found covers reach the results at most every 15 seconds, and once when the run ends. A redraw
// waits while the detail is open (closing it re-renders everything) or the shelf is being pressed.
const COVER_REDRAW_MS = 15_000
let coverRedrawTimer = null
let coversToShow = false

function showFoundCoversSoon() {
  coversToShow = true
  if (!coverRedrawTimer) coverRedrawTimer = setTimeout(showFoundCovers, COVER_REDRAW_MS)
}

function showFoundCovers() {
  clearTimeout(coverRedrawTimer)
  coverRedrawTimer = null
  if (!coversToShow || state.detailOpen) return
  if (shelfControl?.dragging()) {
    coverRedrawTimer = setTimeout(showFoundCovers, 1000)
    return
  }
  coversToShow = false
  updateResults()
}
```

and in `saveFoundCover` replace `  coversToShow = true` with:

```js
  showFoundCoversSoon()
```

The end-of-run call to `showFoundCovers()` in `findMissingCovers`' `finally` stays as it is: it cancels any pending timer and redraws now, subject to the same two waits.

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "finding covers"` → 13 passed. Then `npx vitest run` → `Tests 487 passed (487)`, pristine. Run the full suite twice more: both `487 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Show found covers every 15 seconds, never under an open item or a shelf drag" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: Find covers after an import

**Files:**
- Modify: `src/main.js` confirm-import handler (about lines 1658–1671)
- Test: `src/main.test.js` (`describe('finding covers', …)`)

- [ ] **Step 1: Write the failing test.** In `describe('finding covers', …)`, add this helper after `toastSays`:

```js
  async function confirmImport() {
    document.querySelector('[data-action="import"]').click()
    await window.__loadImportText('Title,Author\nDune,Frank Herbert')
    document.querySelector('[data-action="confirm-import"]').click()
  }
```

and this test after `afterEach(…)`:

```js
  it('finds covers for albums and podcasts without one after an import', async () => {
    await start()
    await confirmImport()
    await toastSays('Found 2 covers')
    expect(lookups().map(([u]) => new URL(String(u), 'http://shelf.test').searchParams.get('medium'))).toEqual(['album', 'podcast'])
    expect(coverSaves().map(s => [s.id, s.coverUrl, s.year])).toEqual([
      ['in-rainbows', 'https://art.example/in-rainbows.jpg', 2007],
      ['radiolab', 'https://art.example/radiolab.jpg', 2002]
    ])
  })
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/main.test.js -t "after an import"` → 1 failed: `AssertionError: expected undefined to be 'Found 2 covers'` (the import toast clears and no run starts).

- [ ] **Step 3: Start a run after Confirm.** In the confirm-import handler, below the line

```js
      showToast(`Imported: ${counts.added} added, ${counts.filled} filled, ${counts.skipped} skipped`)
```

add:

```js
      findMissingCovers()
```

It runs after `state.books = await api.getBooks()`, so the candidates are the reloaded library's albums and podcasts with a blank cover. The import toast shows first; the progress toast takes over when it clears (Task 9).

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "finding covers"` → 14 passed. Then `npx vitest run` → `Tests 488 passed (488)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Find covers for imported albums and podcasts as soon as an import lands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Milestone B: Apple Music (needs Jason's Library.xml)

### Task 19: GATE: confirm Apple key names against data/Library.xml

The spec requires the Apple key names to be checked against Jason's own export before the reader is written. **Do not start Task 20 until this task is committed.**

**Files:**
- Modify: `docs/superpowers/specs/2026-11-02-music-import-design.md` (the first bullet under `### parseAppleLibrary(text)`)

- [ ] **Step 1: Confirm the export can't be committed.** `git check-ignore -v data/Library.xml` → `.gitignore:37:data/*	data/Library.xml` (the line number may differ; the pattern must be `data/*`). If it prints nothing, STOP and tell the controller; don't edit `.gitignore` yourself.

- [ ] **Step 2: Check the file is there. Controller runs this, not a subagent.** `ls -lh data/Library.xml`. If it is missing, **STOP** and ask Jason to export it: in the Music app, File → Library → Export Library…, saved as `data/Library.xml` in this repo. Wait for him to say it's there.

- [ ] **Step 3: List the key names.** Run:

```bash
grep -o '<key>[^<]*</key>' data/Library.xml | sort | uniq -c | sort -rn | head -80
```

Then look at the keys this import relies on, with the type of value that follows each (Music writes each key and its value on one line):

```bash
grep -o '<key>\(Name\|Artist\|Album Artist\|Album\|Year\|Genre\|Date Added\|Album Rating\|Album Rating Computed\|Album Loved\|Album Favorited\|Loved\|Favorited\|Compilation\|Playlist Only\|Podcast\|Movie\|TV Show\|Music Video\)</key><[a-z]*' data/Library.xml | sort | uniq -c
```

Then the keys and kinds that might mark other non-music tracks, for Jason to decide on in Step 4:

```bash
grep -o '<key>\(Has Video\|Voice Memo\|iTunesU\|Audiobook\|Audiobooks\|Purchased\|Apple Music\|Matched\)</key><[a-z]*' data/Library.xml | sort | uniq -c
grep -o '<key>Kind</key><string>[^<]*' data/Library.xml | sort | uniq -c | sort -rn
```

And check what detection and the cut rely on:

```bash
head -c 4096 data/Library.xml | grep -c '<key>Tracks</key>'    # expect 1
grep -c '<key>Playlists</key>' data/Library.xml                 # expect 1
grep -o '<key>Date Added</key><date>[^<]*' data/Library.xml | head -3   # expect ISO dates ending in Z
```

- [ ] **Step 4: Decide with Jason. Controller runs this, not a subagent.** Compare with the names the reader will use (Tasks 20 and 21): `Album`, `Artist`, `Album Artist`, `Compilation` (`<true`), `Playlist Only`, `Podcast`, `Movie`, `TV Show`, `Music Video` (all `<true`), `Year` (`<integer`), `Genre` (`<string`), `Date Added` (`<date`), `Album Rating` (`<integer`), `Album Rating Computed` (`<true`), `Album Loved` or `Album Favorited` (`<true`).
  - A name the plan uses that simply doesn't occur (for example no `Playlist Only` tracks) is fine; keep it.
  - **Ask Jason** if: a flag the spec describes appears under a different name (for example album love stored as something other than `Album Loved`/`Album Favorited`), a value has a different type (for example `Year` as `<string>`), `Tracks` isn't in the first 4 KB, or `Playlists` appears more than once.
  - **Show Jason the list from the second grep and the `Kind` counts** (for example `Has Video`, `Voice Memo`, `iTunesU`, audiobook kinds such as "Audible file" or "Protected AAC audio file" from an audiobook) and ask which, if any, should also keep a track out of the import. If he names any, add them to the spec's skip list in Step 5; Task 20 then adds them to `SKIPPED_TRACK_FLAGS` (for a key) or to a `Kind` check, each with a test line in the "skips tracks…" test.

- [ ] **Step 5: Record the names in the spec.** In `docs/superpowers/specs/2026-11-02-music-import-design.md`, under `### parseAppleLibrary(text)`, replace the bullet that begins "The exact key names are confirmed against Jason's own exported `Library.xml`…" with one that states what was found, for example:

```markdown
- Key names confirmed against Jason's exported `Library.xml` on <date> (<N> tracks,
  <size> MB): `Name`, `Artist`, `Album Artist`, `Album`, `Year` (integer), `Genre`,
  `Date Added` (ISO-8601 UTC), `Album Rating` (integer, 0–100), `Album Rating Computed`,
  `<Album Loved and/or Album Favorited, whichever occur>`, `Compilation`, `Playlist Only`,
  `Podcast`, `Movie`, `TV Show`, `Music Video` (flags are `<true/>` or absent). Not present
  in this library: <list, or "none">. Also skipped, at Jason's choice: <list, or "nothing more">.
```

If Jason chose extra skips, also add them to the "Skip tracks with no `Album`…" bullet. Never copy any of the file's contents beyond key names, kinds and counts into the repo. Commit:

```bash
git add docs/superpowers/specs/2026-11-02-music-import-design.md
git commit -m "Record the Apple Music key names the import reads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: Read albums from an Apple Music library

The file is an XML property list: a `<dict>` holds alternating `<key>` and value elements; values are typed (`<string>`, `<integer>`, `<date>`, `<true/>`) and false flags are simply absent. The root dict's `Tracks` value is a dict of track id → track dict. The text is cut at `<key>Playlists</key>` and closed with `</dict></plist>` (playlists are ignored and often huge), then parsed once with `DOMParser`. happy-dom's `DOMParser` handles XML and reports malformed input with a `<parsererror>` element, as browsers do.

This task does grouping, crediting, skipping and the cut. Task 21 fills in year, date added, genre and rating.

**If Task 19 recorded names different from the ones below, or extra skips Jason chose, use the recorded names and add the extra skips (each with a line in the "skips tracks…" test) in both the tests and the code.**

**Files:**
- Modify: `src/musicimport.js` (insert an Apple section between `parseSpotifyLibrary` and `detectImportFile`)
- Test: `src/musicimport.test.js`

- [ ] **Step 1: Write the failing tests.** In `src/musicimport.test.js`, change the import line to:

```js
import { parseSpotifyLibrary, detectImportFile, parseAppleLibrary } from './musicimport.js'
```

and append at the end of the file:

```js
// One track's <dict>, typed the way Music writes it: numbers as <integer>, true as <true/>,
// Date Added as <date>, everything else as <string>. A false flag is simply left out.
function plistTrack(fields) {
  const value = (key, v) => v === true ? '<true/>'
    : typeof v === 'number' ? `<integer>${v}</integer>`
    : key === 'Date Added' ? `<date>${v}</date>`
    : `<string>${v}</string>`
  return `<dict>${Object.entries(fields).map(([k, v]) => `<key>${k}</key>${value(k, v)}`).join('')}</dict>`
}

// A whole Library.xml holding these tracks, with an optional Playlists section after them
function appleLibrary(tracks, { playlists = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Major Version</key><integer>1</integer>
	<key>Application Version</key><string>1.5.0.73</string>
	<key>Tracks</key>
	<dict>
${tracks.map((t, i) => `		<key>${i + 1}</key>${plistTrack({ 'Track ID': i + 1, ...t })}`).join('\n')}
	</dict>
${playlists}</dict>
</plist>
`
}

const apple = tracks => parseAppleLibrary(appleLibrary(tracks)).books
const song = (fields = {}) => ({ Name: 'Song', Artist: 'Radiohead', Album: 'In Rainbows', ...fields })

describe('parseAppleLibrary', () => {
  it('groups tracks by normalised album and album artist, titled as the first track has it', () => {
    const books = apple([
      song({ Album: 'In Rainbows' }),
      song({ Album: 'IN RAINBOWS!' }),
      song({ Album: 'In Rainbows', Artist: 'Radiohead Tribute Band' })
    ])
    expect(books.map(b => [b.title, b.author])).toEqual([
      ['In Rainbows', 'Radiohead'],
      ['In Rainbows', 'Radiohead Tribute Band']
    ])
  })

  it('credits the album artist over the track artist', () => {
    const books = apple([
      song({ Album: 'Help!', Artist: 'Ringo Starr', 'Album Artist': 'The Beatles' }),
      song({ Album: 'Help!', Artist: 'John Lennon', 'Album Artist': 'The Beatles' })
    ])
    expect(books.map(b => [b.title, b.author])).toEqual([['Help!', 'The Beatles']])
  })

  it('credits a compilation without an album artist to Various Artists', () => {
    const books = apple([
      song({ Album: 'Pulp Fiction', Artist: 'Dick Dale', Compilation: true }),
      song({ Album: 'Pulp Fiction', Artist: 'Al Green', Compilation: true })
    ])
    expect(books.map(b => [b.title, b.author])).toEqual([['Pulp Fiction', 'Various Artists']])
  })

  it('credits the most common spelling of the album artist', () => {
    const books = apple([
      song({ Album: 'Homogenic', Artist: 'Bjork' }),
      song({ Album: 'Homogenic', Artist: 'Björk' }),
      song({ Album: 'Homogenic', Artist: 'Björk' })
    ])
    expect(books.map(b => b.author)).toEqual(['Björk'])
  })

  it('skips tracks with no album, playlist-only tracks, podcasts and video', () => {
    const books = apple([
      { Name: 'Loose Track', Artist: 'Radiohead' },
      song({ Album: 'Added To A Playlist', 'Playlist Only': true }),
      song({ Album: 'Serial', Podcast: true }),
      song({ Album: 'Some Film', Movie: true }),
      song({ Album: 'Some Show', 'TV Show': true }),
      song({ Album: 'Some Video', 'Music Video': true }),
      song({ Album: 'Kept' })
    ])
    expect(books.map(b => b.title)).toEqual(['Kept'])
  })

  it('reads the tracks and ignores the Playlists section, even a malformed one', () => {
    const text = appleLibrary([song({ Album: 'Kept' })], {
      playlists: '\t<key>Playlists</key>\n\t<array><dict><key>Name</key><string>Unclosed\n'
    })
    expect(parseAppleLibrary(text).books.map(b => b.title)).toEqual(['Kept'])
  })

  it('throws on a file that is not well-formed', () => {
    const broken = appleLibrary([song()]).replace('</dict>\n</plist>', '')
    expect(() => parseAppleLibrary(broken)).toThrow('Library.xml is not well-formed')
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/musicimport.test.js` → 7 failed: six with `TypeError: parseAppleLibrary is not a function`, and `throws on a file that is not well-formed` with a message mismatch (`expected [Function] to throw error including 'Library.xml is not well-formed' but got 'parseAppleLibrary is not a function'`).

- [ ] **Step 3: Add the reader.** In `src/musicimport.js`, insert between the end of `parseSpotifyLibrary` and the `// Which reader an import file needs…` comment:

```js
// Track flags that keep a track out of the import; key names confirmed against a real Library.xml
const SKIPPED_TRACK_FLAGS = ['Playlist Only', 'Podcast', 'Movie', 'TV Show', 'Music Video']

// A plist <dict> as an object: its keys, each with its value read by type
function readDict(dict) {
  const out = {}
  for (let key = dict.firstElementChild; key; key = key.nextElementSibling?.nextElementSibling) {
    const value = key.nextElementSibling
    out[key.textContent] = value?.tagName === 'integer' ? Number(value.textContent)
      : value?.tagName === 'true' ? true
      : value?.tagName === 'dict' ? value
      : value?.textContent
  }
  return out
}

// The most frequent value, ties going to the alphabetically first
function mostCommon(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts].sort(([a, m], [b, n]) => n - m || a.localeCompare(b))[0]?.[0]
}

const albumArtist = track => clean(track['Album Artist'])
  || (track.Compilation ? 'Various Artists' : clean(track.Artist))

function appleAlbum(tracks) {
  return entry({
    title: clean(tracks[0].Album),
    author: mostCommon(tracks.map(albumArtist).filter(Boolean)) || null,
    medium: 'album',
    tags: ['apple-music']
  })
}

export function parseAppleLibrary(text) {
  // The Playlists section is ignored and often large, so the text is cut before it and closed again
  const cut = text.indexOf('<key>Playlists</key>')
  const xml = cut === -1 ? text : `${text.slice(0, cut)}</dict></plist>`
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Library.xml is not well-formed')
  const root = doc.documentElement.firstElementChild
  const tracksDict = root && readDict(root).Tracks
  if (!tracksDict) throw new Error('Library.xml has no Tracks')

  const albums = new Map()
  for (const value of Object.values(readDict(tracksDict))) {
    const track = readDict(value)
    if (!clean(track.Album) || SKIPPED_TRACK_FLAGS.some(flag => track[flag])) continue
    const key = albumKey(track.Album, albumArtist(track))
    if (!albums.has(key)) albums.set(key, [])
    albums.get(key).push(track)
  }
  return { books: [...albums.values()].map(appleAlbum), failed: [] }
}

```

- [ ] **Step 4: Run it.** `npx vitest run src/musicimport.test.js` → `Tests 22 passed (22)`. Then `npx vitest run` → `Tests 495 passed (495)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/musicimport.js src/musicimport.test.js
git commit -m "Read the albums in an Apple Music library" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: Apple albums bring their year, date added, genre and rating

**Files:**
- Modify: `src/musicimport.js` (`appleAlbum`)
- Test: `src/musicimport.test.js` (`describe('parseAppleLibrary', …)`)

- [ ] **Step 1: Write the failing tests.** Add these inside `describe('parseAppleLibrary', …)`, after the last test:

```js
  it('makes one album entry from an album\'s tracks', () => {
    const { books, failed } = parseAppleLibrary(appleLibrary([
      song({ Name: '15 Step', Year: 2007, Genre: 'Alternative', 'Date Added': '2019-03-04T05:06:07Z' }),
      song({ Name: 'Bodysnatchers', Year: 2007, Genre: 'Alternative', 'Date Added': '2019-03-04T05:06:08Z' })
    ]))
    expect(books).toEqual([{
      ...BLANK,
      title: 'In Rainbows',
      author: 'Radiohead',
      medium: 'album',
      year: 2007,
      tags: ['alternative', 'apple-music'],
      dateAdded: '2019-03-04'
    }])
    expect(failed).toEqual([])
  })

  it('takes the earliest year, and none when no track has one', () => {
    expect(apple([song({ Year: 2008 }), song({ Year: 2007 }), song()])[0].year).toBe(2007)
    expect(apple([song()])[0].year).toBe(null)
  })

  it('takes the earliest date added, as its UTC date', () => {
    const books = apple([
      song({ 'Date Added': '2020-01-02T00:30:00Z' }),
      song({ 'Date Added': '2020-01-01T23:30:00Z' })
    ])
    expect(books[0].dateAdded).toBe('2020-01-01')
  })

  it('tags the most common genre, lowercased, with ties going alphabetically', () => {
    expect(apple([song({ Genre: 'Rock' }), song({ Genre: 'Alternative' }), song({ Genre: 'Rock' })])[0].tags).toEqual(['rock', 'apple-music'])
    expect(apple([song({ Genre: 'Rock' }), song({ Genre: 'Electronic' })])[0].tags).toEqual(['electronic', 'apple-music'])
  })

  it('tags only the source when no track has a genre', () => {
    expect(apple([song(), song({ Genre: ' ' })])[0].tags).toEqual(['apple-music'])
  })

  it('rates the album by its highest album rating set by hand, to the nearest half star', () => {
    expect(apple([song({ 'Album Rating': 80 }), song({ 'Album Rating': 60 })])[0].rating).toBe(4)
    expect(apple([song({ 'Album Rating': 90 })])[0].rating).toBe(4.5)
  })

  it('ignores an album rating Music computed from the song ratings', () => {
    expect(apple([song({ 'Album Rating': 100, 'Album Rating Computed': true })])[0].rating).toBe(null)
    expect(apple([
      song({ 'Album Rating': 100, 'Album Rating Computed': true }),
      song({ 'Album Rating': 40 })
    ])[0].rating).toBe(2)
  })

  it('gives a loved album with no rating 5 stars, under either name Music uses', () => {
    expect(apple([song({ 'Album Loved': true })])[0].rating).toBe(5)
    expect(apple([song({ 'Album Favorited': true })])[0].rating).toBe(5)
  })

  it('prefers a rating set by hand over a love', () => {
    expect(apple([song({ 'Album Loved': true, 'Album Rating': 60 })])[0].rating).toBe(3)
  })

  it('does not count a loved song as a loved album', () => {
    expect(apple([song({ Loved: true })])[0].rating).toBe(null)
  })
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/musicimport.test.js` → 8 failed (for example `expected null to be 2007`, `expected [ 'apple-music' ] to deeply equal [ 'rock', 'apple-music' ]`, `expected null to be 4`). Two already pass, because nothing is read yet: `tags only the source when no track has a genre` and `does not count a loved song as a loved album`. They are the guards for Step 3.

- [ ] **Step 3: Fill in the album.** In `src/musicimport.js`, replace `appleAlbum` with:

```js
function appleAlbum(tracks) {
  const years = tracks.map(t => t.Year).filter(y => y > 0)
  const genre = mostCommon(tracks.map(t => clean(t.Genre).toLowerCase()).filter(Boolean))
  const ratings = tracks.filter(t => !t['Album Rating Computed'] && t['Album Rating'] > 0).map(t => t['Album Rating'])
  const loved = tracks.some(t => t['Album Loved'] || t['Album Favorited'])
  const firstAdded = tracks.map(t => t['Date Added']).filter(Boolean).sort()[0]
  return entry({
    title: clean(tracks[0].Album),
    author: mostCommon(tracks.map(albumArtist).filter(Boolean)) || null,
    medium: 'album',
    year: years.length ? Math.min(...years) : null,
    tags: genre ? [genre, 'apple-music'] : ['apple-music'],
    // Album Rating runs 0-100; stars are 0-5 in halves
    rating: ratings.length ? Math.round(Math.max(...ratings) / 10) / 2 : loved ? 5 : null,
    dateAdded: firstAdded ? firstAdded.slice(0, 10) : null
  })
}
```

`Date Added` is an ISO-8601 UTC string (`2019-03-04T05:06:07Z`), so sorting the strings sorts the dates, and its first 10 characters are the UTC date; no `Date` object, so the machine's time zone can't shift it.

- [ ] **Step 4: Run it.** `npx vitest run src/musicimport.test.js` → `Tests 32 passed (32)`. Then `npx vitest run` → `Tests 505 passed (505)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/musicimport.js src/musicimport.test.js
git commit -m "Bring each Apple Music album's year, date added, genre and rating" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 22: Apple Music in the Import box

Detection already returns `'apple'` (Task 4), but `IMPORT_SOURCES` has no Apple reader, so today an Apple file gets the "can't import" message. This task adds it. A reader that throws already shows "looks damaged" (Task 7).

**Files:**
- Modify: `src/main.js` (`musicimport.js` import line, `IMPORT_SOURCES`)
- Test: `src/main.test.js` (`describe('import box', …)`)

- [ ] **Step 1: Write the failing tests.** In `describe('import box', …)`, add above `it('says so when it does not recognise the file, and keeps Confirm disabled', …)`:

```js
  const APPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Tracks</key>
\t<dict>
\t\t<key>1</key><dict><key>Name</key><string>15 Step</string><key>Artist</key><string>Radiohead</string><key>Album</key><string>In Rainbows</string><key>Year</key><integer>2007</integer><key>Genre</key><string>Alternative</string><key>Date Added</key><date>2019-03-04T05:06:07Z</date><key>Album Rating</key><integer>100</integer></dict>
\t\t<key>2</key><dict><key>Name</key><string>Teardrop</string><key>Artist</key><string>Massive Attack</string><key>Album</key><string>Mezzanine</string></dict>
\t</dict>
\t<key>Playlists</key>
\t<array></array>
</dict>
</plist>
`

  it('names an Apple Music library and its album count', async () => {
    dropImportFile(APPLE)
    await fileRead()
    expect(document.querySelector('.import-source').textContent).toBe('Apple Music library: 2 albums')
    expect(confirmButton().disabled).toBe(false)
  })

  it('confirms an Apple Music library by posting its albums', async () => {
    dropImportFile(APPLE)
    await fileRead()
    confirmButton().click()
    await vi.waitFor(() => {
      if (document.querySelector('.modal-panel')) throw new Error('modal open')
    })
    const call = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/import') && !JSON.parse(o.body).dryRun)
    const blank = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }
    expect(JSON.parse(call[1].body).books).toEqual([
      { ...blank, title: 'In Rainbows', author: 'Radiohead', medium: 'album', year: 2007, rating: 5, dateAdded: '2019-03-04', tags: ['alternative', 'apple-music'] },
      { ...blank, title: 'Mezzanine', author: 'Massive Attack', medium: 'album', tags: ['apple-music'] }
    ])
  })

  it('says an Apple Music library that does not parse looks damaged', async () => {
    dropImportFile(APPLE.replace('<string>Teardrop</string>', '<string>Teardrop'))
    await fileRead()
    expect(importError()).toBe('This file looks damaged. Export it again and retry.')
    expect(confirmButton().disabled).toBe(true)
  })

```

(The damaged case breaks a tag before `Playlists`: anything after `<key>Playlists</key>` is cut away, so breaking it there wouldn't make the file damaged.)

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/main.test.js -t "import box"` → 3 failed: `TypeError: Cannot read properties of null (reading 'textContent')`, `Error: modal open`, and `expected 'Shelf can\'t import this file. Drop a…' to be 'This file looks damaged. Export it ag…'`.

- [ ] **Step 3: Add the Apple reader.** In `src/main.js`, change the `musicimport.js` import to:

```js
import { parseSpotifyLibrary, parseAppleLibrary, detectImportFile } from './musicimport.js'
```

In `IMPORT_SOURCES`, below the `goodreads` line add:

```js
  apple: { name: 'Apple Music library', read: parseAppleLibrary },
```

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "import box"` → 15 passed. Then `npx vitest run` → `Tests 508 passed (508)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js
git commit -m "Import Apple Music libraries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 23: Check the Apple import against Jason's real library

**Controller runs this, not a subagent.** It needs Jason at the keyboard. The dev server runs against Jason's real database, so the ground rule applies in full: never click Confirm Import or Find missing covers, and never send POST/PUT/PATCH/DELETE yourself. The parse-time check below only reads (two GETs). The preview's dry run is a POST that writes nothing, and Jason triggers it himself by dropping the file.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-02-music-import-design.md` (the `Manual:` bullet under Testing)

- [ ] **Step 1: Start the dev server.** Start the dev server with the browser pane's `preview_start` using the `bookshelf-dev` configuration in `.claude/launch.json`. If it fails with `getcwd: cannot access parent directories: Operation not permitted` (macOS privacy on `~/Documents`), ask Jason to run `npm run dev` in his Terminal panel, then open `http://localhost:5173` in the browser pane.
- [ ] **Step 2: Measure the parse time.** Measure the parse time in the browser pane with the JavaScript tool (Vite's dev server serves files under the project root, so the file is at `/data/Library.xml` locally; it is only on this machine):

  ```js
  const { parseAppleLibrary } = await import('/src/musicimport.js')
  const text = await (await fetch('/data/Library.xml')).text()
  const t0 = performance.now()
  const { books } = parseAppleLibrary(text)
  ;({ megabytes: Math.round(text.length / 1e6), albums: books.length, ms: Math.round(performance.now() - t0) })
  ```

  If the fetch 404s, skip to Step 3 and time the drop by eye instead.
- [ ] **Step 3: Jason drops the file; check the preview.** Ask Jason to open the avatar menu → Import and drop `data/Library.xml` on the box (a file chooser needs a human). The dry run only counts; it writes nothing. Check with him that the source line says `Apple Music library: N albums` with the same N as step 2, and that the new / updates / already complete counts look plausible for his library. Note anything odd (for example a surprising number of "Various Artists" albums, or untitled-looking albums) and report it rather than fixing it here.
- [ ] **Step 4: Record the result.** Record the result in the spec's Testing section, replacing the `Manual:` bullet's text with what was measured, for example: `Manual: Jason's Library.xml (<size> MB, <tracks> tracks) → <N> albums, parsed in <ms> ms in <browser>; preview: <added> new, <filled> updates, <skipped> already complete.` Commit:

  ```bash
  git add docs/superpowers/specs/2026-11-02-music-import-design.md
  git commit -m "Note how the Apple Music import handled a real library" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

- [ ] **Step 5: Hand back.** Close the Import box with Cancel. Ask Jason whether he wants to import for real; if he says yes, he can click Confirm himself and watch "Finding covers…" start.

### Task 24: README mentions Apple Music and Spotify import

**Needs Jason's approval of the wording before committing.**

**Files:**
- Modify: `README.md`, `## Features` list (about line 103), below the **Goodreads import** bullet

- [ ] **Step 1: Draft the bullet** in the README's existing voice (dry, specific, a little wry), and add it below the **Goodreads import** bullet:

```markdown
- **Apple Music & Spotify import** — the same Import box takes Apple Music's `Library.xml` (File → Library → Export Library…) and the `YourLibrary.json` inside Spotify's privacy download. Every album with even one song in your library comes along, liked songs bring their albums, followed podcasts come too, and your album ratings and loves turn into stars. No account linking, no sync, no OAuth dance. Covers are found afterwards at a pace iTunes won't mind; **Find missing covers** in the menu picks up whatever it missed.
```

- [ ] **Step 2: Show Jason the bullet in chat and wait for his OK or his edits. Controller runs this, not a subagent.** Apply his edits exactly.

- [ ] **Step 3: Check nothing else broke.** `npx vitest run` → `Tests 508 passed (508)`, pristine.

- [ ] **Step 4: Commit** (only after Jason approves the wording):

```bash
git add README.md
git commit -m "Mention Apple Music and Spotify import in the README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage check

| Spec item | Task |
|---|---|
| Unicode-aware `normKey` in `src/match.js` (Latin accents only, marks kept), used by server, readers and cover matching | 1, 2, 3, 10, 11, 20 |
| Server import keeps two non-Latin albums separate | 2 |
| `parseSpotifyLibrary`: saved albums, liked songs' albums, de-dupe, shows as podcasts, source tag, other arrays ignored | 3 |
| `detectImportFile` order apple → spotify → goodreads; truncated Spotify still recognised; `Title,Author` CSV still Goodreads; null for unrelated | 4 |
| Import box title, drop-zone copy, `accept` | 5 |
| Source line above the counts; Confirm posts mapped entries | 6, 22 |
| `state.importError`: unrecognised, damaged, nothing to import, failed dry run; cleared on new file and close; Confirm disabled; read failures caught | 7, 22 |
| `showToast` persistent, updatable mode; brief toast shows over it and it returns | 8, 9 |
| Candidates (skipping items that can never match), query, matching (Single/EP, creator for albums, title only for podcasts, empty keys), save without overwriting, pace, stop after 3 failures, progress and final count | 10–13 |
| One lookup helper shared by quick add, Add Media and the cover finder | 14 |
| Find missing covers menu item; second run does nothing; recovers from an unexpected failure; picks up missed items | 15, 16 |
| Found covers shown at most every 15 s and at the end, never under the detail or a shelf drag | 15, 17 |
| Covers after Confirm, once the library reloads | 18 |
| Apple key names confirmed against Jason's file and recorded | 19 |
| `parseAppleLibrary`: every rule, including the Playlists cut | 20, 21 |
| Manual check of a real `Library.xml` with parse time | 23 |
| README | 24 |

Not covered here, by the spec's own terms: checking Spotify's field names against Jason's `YourLibrary.json` "when it arrives". When he has it, the controller repeats Task 19's approach for JSON (`node -e "const d = require('./data/YourLibrary.json'); console.log(Object.keys(d), d.tracks?.[0], d.albums?.[0], d.shows?.[0])"`) and asks him if the names differ from `artist`/`album`/`track`/`name`/`publisher`.
