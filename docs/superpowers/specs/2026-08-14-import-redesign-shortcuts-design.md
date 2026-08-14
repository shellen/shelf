# Goodreads Import, Brutalist Redesign, Keyboard Shortcuts

**Date:** 2026-08-14
**Status:** Approved by Jason

## Overview

Three features landing together on the bookshelf app:

1. Import books from a Goodreads library export (CSV) via an in-app modal.
2. Replace the physical shelf number with rich, sortable metadata.
3. Redesign the UI in a brutalist print-zine direction.
4. Add keyboard shortcuts for navigation (core + power keys).

The shelf-number removal is a prerequisite for import (Goodreads has no such concept) and was independently approved: "the physical shelf number is kind of stupid."

## Schema changes

Applied via the existing idempotent `ALTER TABLE ... ADD COLUMN` pattern in `server/db.js` (try/catch per column), plus a one-time column drop:

- **Drop** `books.shelf` (SQLite 3.35+ `ALTER TABLE books DROP COLUMN shelf`). Guarded the same way: attempt, swallow "no such column".
- **Add** `date_read TEXT` (ISO `YYYY-MM-DD` or null)
- **Add** `date_added TEXT` (ISO `YYYY-MM-DD` or null)
- **Add** `pages INTEGER` (null when unknown)
- **Add** `year INTEGER` — original publication year, falling back to edition year (null when unknown)

Also drop `idx_books_shelf`.

**Book IDs:** existing ids (`s4-dune`) are opaque strings and stay unchanged — renaming would orphan the 81 cached cover files keyed by id. New books get `slugify(title)` (max 40 chars, as today); on collision append `-2`, `-3`, etc. The `s{shelf}-` prefix disappears from new ids only.

**API/UI shelf removal:** shelf leaves the add/edit modal, drawer metadata line, list view column, sort options, and search haystack. `POST /api/books` no longer reads `shelf`; `saveBook` drops the field.

## Goodreads import

### Entry point

An **Import** button in the header (hidden in read-only static builds, like Add Book). Power-key `i` opens it. Opens a modal:

1. File picker + drag-and-drop target for `goodreads_library_export.csv`.
2. Client parses the file, maps rows, and shows a preview summary: counts of new books, fill-in-blank matches, and unparseable rows (with row numbers for the failures).
3. Confirm button executes the import; summary toast on completion; wall refreshes.

### CSV parsing

Hand-rolled RFC-4180 parser (~50 lines) in `src/csv.js`, no new dependency. Must handle:

- Quoted fields containing commas and embedded newlines (My Review, Private Notes)
- Escaped quotes (`""` inside quoted fields)
- CRLF and LF line endings
- Header row → object per row keyed by column name

### Field mapping (Goodreads → bookshelf)

| Goodreads column | Bookshelf field | Notes |
|---|---|---|
| Title | title | required; row unparseable without it |
| Author | author | |
| ISBN13, else ISBN | isbn | strip Excel armor `="..."` and quotes; empty `=""` → null |
| My Rating | rating | `0` means unrated → null |
| My Review + Private Notes | notes | joined with blank line; empty → null |
| Bookshelves + Exclusive Shelf | tags | split, trim, lowercase, dedupe (e.g. `to-read`, `currently-reading` become filterable tags) |
| Date Read | date_read | Goodreads format `YYYY/MM/DD` → ISO |
| Date Added | date_added | same |
| Number of Pages | pages | int or null |
| Original Publication Year, else Year Published | year | int or null |

### Merge semantics ("fill in blanks", per Jason)

Matching order: (1) ISBN exact match; (2) normalized title + author (lowercase, collapse whitespace, strip punctuation).

- **No match** → create new book.
- **Match** → fill only fields that are currently null/empty on the existing book (rating, isbn, notes, date_read, date_added, pages, year). Tags: union of existing + imported. Never overwrite non-empty fields. Cover untouched.
- Unparseable rows (no title) are skipped and reported.

### Bulk endpoint

`POST /api/import` with `{ books: [mappedRow, ...] }`. Server performs matching + merging inside one better-sqlite3 transaction and returns `{ added: n, filled: n, skipped: n }` (skipped = matched rows where nothing was empty to fill). Client never issues per-book requests.

## Sorting by metadata

Sort options: **Title, Author, Rating, Date Read, Date Added, Pages, Year**.

- Default directions: title/author ascending; rating, date_read, date_added descending; pages, year descending.
- Re-selecting the active sort (dropdown or list header click) flips direction; an arrow indicator shows it.
- Nulls always sort last regardless of direction.
- List view columns: Title / Author / Rating / Year / Tags — first four click-to-sort, synced with the dropdown (existing pattern).

## Brutalist redesign

DOM structure and render architecture unchanged; `src/style.css` rewritten as a token system:

- **Ground:** white `#fff`; text pure black.
- **Borders:** 3px solid black everywhere panels meet; no border-radius anywhere; no soft shadows.
- **Display type:** ultra-black weight (Inter 900 or Arial Black stack), all-caps for chrome: app title, buttons, list headers, view toggle.
- **Metadata type:** monospace (system mono stack) for search input, counts, status bar, drawer meta, tags.
- **Accent:** single red `#ff2e2e` for primary actions (+ Add Book, Import confirm, destructive Remove stays red), and the keyboard selection tick.
- **Hovers:** flat inversion (black bg / white text), no transitions ≥100ms.
- **Status bar:** the `N shown • M total` count moves to a monospace strip at the bottom of the viewport: `81 BOOKS / SORTED BY TITLE ↑ / q: "design"`.
- **Cover wall:** tiles butt against hard black gridlines; hover shows the existing overlay restyled (black band, white all-caps type).
- **Drawer/modals:** hard-ruled white panels with 3px borders; backdrop stays.
- Google-Fonts Inter link stays (900 weight added) with system-black fallbacks.

The generated SVG placeholder gets restyled to match (black frame, all-caps type).

## Keyboard shortcuts (core + power)

Suspended whenever focus is in an input/textarea/select or a modal is open (Esc always works).

| Key | Action |
|---|---|
| `/` | focus search |
| Arrows | move roving selection over filtered results (grid-aware in wall: left/right ±1, up/down ± column count; list: up/down) |
| Enter | open selected book |
| Esc | close drawer/modal; if none open and search has text, clear search |
| `←` `→` (drawer open) | previous / next book in current filtered order |
| `v` | toggle Covers/List |
| `s` | cycle sort options |
| `a` | open Add Book |
| `e` | edit selected (or currently open) book |
| `i` | open Import |
| `?` | help overlay listing all shortcuts |
| 1–9 | apply Nth tag filter (order of the tag dropdown); same key again clears |

Selection state: index into the filtered array; rendered as a thick black outline + red corner tick on the tile/row; scrolls into view; resets to 0 when filters change. Read-only builds disable `a`/`e`/`i`.

## Testing

TDD per feature (Vitest, existing setup):

- `src/csv.test.js`: quoted commas, embedded newlines, `""` escapes, CRLF, header mapping, Excel-armored ISBNs.
- Import mapping: Goodreads row → book fields (rating 0, tag normalization, date conversion, year fallback).
- `server/db.test.js` additions: merge semantics (new / fill-only-blanks / tag union / skip), transaction rollback on bad payload, id slug collisions.
- API test for `/api/import` counts.
- Frontend: sort orders incl. null-last and direction flip; shortcut navigation (arrows/Enter/Esc, suspension while typing); import modal preview counts.
- Existing shelf-dependent tests updated.

## Out of scope

- Cover fetching during import (run `npm run fetch-covers` afterward as usual).
- Goodreads API/OAuth (CSV only).
- Dark mode.
- URL state for filters.
