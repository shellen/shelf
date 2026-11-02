# Paper Gallery Makeover — Design

**Date:** 2026-11-01 · **Approved by:** Jason

## Goal

Replace Shelf's brutalist print-zine language with a "paper gallery" design
app-wide, add a 3D spine-carousel showcase as the default landing view, and
collapse book details into one cinematic overlay. Inspired by a Kurosawa
filmography page Jason supplied; adapted, not copied — no decorative Japanese
text, spines carry title/author like real books.

This is a front-end-only change: no API, schema, or server edits.

## Decisions (made with Jason)

1. The 3D shelf becomes the app's front door; **covers (the wall) and list
   views stay**.
2. **Paper gallery** language governs the whole app, not just the new view.
3. The carousel is a **curated showcase** (short groups), not the full library.
4. **One detail overlay app-wide**, editable in place; the side drawer is retired.

## Views and navigation

### Views

- `state.view` gains `'shelf'` alongside the existing `'covers'` and `'list'`.
  The default `state.view` becomes `'shelf'`.
- The Covers/List toggle becomes Shelf/Covers/List. The `v` shortcut cycles
  shelf → covers → list, and its help-overlay text is updated to match.
- `isLanding()` keeps its current meaning and is untouched: true only for the
  covers view with no search, tag, or route. So "Full library" (covers, no
  filters) still renders the per-medium sections, ordered and limited by
  `settings.landing`, exactly as today.
- A separate pure predicate decides whether the shelf view is showing
  (`state.view === 'shelf'` and no search, tag, or non-medium route).

### Routes

- No new routes. The existing single-match `#/title/<slug>` and
  `#/isbn/<isbn>` routes (written by `bookHash`) open the **overlay** instead
  of the drawer. `openBook` keeps `history.replaceState`, so Back behaves as
  it does today; it does not close the overlay.
- `#/medium/<key>` routes **keep you in shelf view** and filter the showcase
  groups to that medium. The masthead media filter (All / Books / Audiobooks /
  Movies / Podcasts / Albums, present media only, as today's tabs) drives
  these routes.
- Searching, choosing a tag, or any `title` / `author` / `tags` / `isbn` route
  **switches `state.view` to `'covers'`** to show results. The carousel is a
  browsing surface, not a results surface. Reset returns to shelf.
- Cold loads: no route or a medium route → shelf view; any other route →
  covers view.

### Header

Masthead row (all views): left — view toggle (Shelf / Covers / List); centre —
shelf name in serif with the media filter as small-caps links beneath it;
right — search box, then Log In or the avatar menu (Add Media / Import /
Shelf Settings / Log Out), unchanged in behaviour.

Toolbar row (covers and list only): tag select, sort select, Reset — today's
controls, restyled. Hidden in shelf view.

The fixed status bar stays for covers and list and is hidden in shelf view,
where the caption and a footer count ("9 on this shelf · 81 in the library")
take its place.

## Shelf view (curated showcase)

### Groups (the boxed tab rail — the decade-tabs analog)

| Tab | Membership | Order |  Cap |
|---|---|---|---|
| Reading | `tags` includes `currently-reading` | dateAdded desc | none |
| Favorites | `rating === 5` (ratings allow halves; 5 is max) | dateRead desc | 30 |
| Recently finished | `dateRead` set | dateRead desc | 20 |

- Every ordering puts nulls last and breaks ties by title (A→Z), so manual
  shelves (where `dateAdded` is always null — the API never sets it) still
  order deterministically.
- `currently-reading` arrives via Goodreads import (its Exclusive Shelf
  becomes a tag); manually added items join Reading by being given that tag.
  No status field is added.
- **Recently finished fills only from imports**: nothing in the UI sets
  `dateRead`, and adding that would break drawer parity. Accepted.
- Groups include only media enabled in `settings.landing`, then the active
  medium route filter if any.
- Empty groups are hidden from the rail. If every group is empty, show one
  **On the shelf** group: every included item, title order, cap 30. (No date
  dependency, so it works on a fresh manual shelf.)
- Group building lives in a pure module (`src/showcase.js`) so it is unit-testable.

### Carousel

Mechanics adapted from the reference page: horizontal 3D carousel with
perspective; drag, wheel, arrow keys, prev/next buttons, and click-to-center;
the centered item rotates face-out with a slight tilt (≈ -4.5°) and parallax
toward the pointer; infinite wrap via the tripled-list technique. Groups are
capped small, so DOM stays cheap.

- **Spines:** typographic — title running down the spine in serif, creator
  small-caps at the foot. Background color chosen deterministically from a
  fixed paper-world palette by hashing the item id (`src/spines.js`, pure,
  tested). Light/dark foreground chosen per palette entry.
- **Center face:** real cover art when available (existing cover chain),
  falling back to the existing typographic placeholder restyled to match.
- **Caption** below the shelf (aria-live polite): serif title; cobalt
  small-caps line of creator · state, where state is "Reading" if tagged
  `currently-reading`, else "Read <Mon YYYY>" if `dateRead` is set, else
  omitted; then the star rating if rated.
- **Open:** clicking the centered item, the open affordance, or pressing Enter
  opens the overlay. Clicking an off-center spine centers it.

### Texture and motion

- Film-grain overlay (inline SVG noise, multiply) across the app.
- Custom cursor only on `pointer: fine` devices; never suppresses
  `:focus-visible` outlines.
- `prefers-reduced-motion`: no spring physics (snap positioning), no ink
  animation, no caption slide — instant swaps.
- Mobile: touch drag, scaled-down geometry, secondary header items hidden.

## Detail overlay (replaces the drawer)

- Opens from shelf (expands out of the centered cover via clip-path, with the
  tilt straightening) and from covers/list (expands from the clicked tile).
  Reduced motion: plain fade.
- Layout: text column (kicker, big serif title, metadata, fields, actions);
  cover side with the ink-blob mask reveal.
- Close via button or Esc; returns to the originating view with state intact.

### Parity checklist (exactly the drawer today, nothing added)

Signed in:
- Editable title, creator, medium, tags (comma input), ISBN — `data-field`
  inputs saved by `saveField`; Escape reverts a field; empty title refused;
  failed save reverts.
- Half-star rating with set / clear.
- Notes textarea (`data-action="notes"`).
- Metadata line: year · pages · read date.
- "More by this author" link (author route).
- Change cover → cover picker (search + manual URL).
- Remove Book with confirm.

Signed out (`state.readOnly`): fields read-only, tags as chips, metadata line
adds ISBN, no editing actions.

Keyboard while open: Left/Right step to the previous/next item **in the list
it was opened from** (the active showcase group when opened from shelf, the
filtered list otherwise); `e` focuses the title field; Esc closes.

The selectors currently scoped to `.drawer-panel` (field listeners, `e`
focus) are re-scoped to the overlay.

## Design tokens (style.css)

| Token | Value | Replaces |
|---|---|---|
| `--paper` | `#EDEBE6` | white ground |
| `--sheet` | `#F4F2ED` | modal/overlay ground |
| `--ink` | `#141414` | `#000` |
| `--muted` | `#6D6A63` | — |
| `--accent` | `#1F3FB0` cobalt | `#ff2e2e` red |
| `--highlight` | `#ffec42` (kept) | search marks still work on paper |

- Type: **Newsreader** (display serif) and **Inter Tight** (labels, UI)
  replace Inter 900; mono stays only for data strings (ISBN). Loaded from
  Google Fonts in `index.html`, replacing today's Inter link — same
  dependency as now.
- 1px ink rules replace 3px; `border-radius: 0 !important` is removed; 2px
  radii and soft natural shadows throughout.
- `generatePlaceholder` (hardcoded `#ff2e2e` and Arial Black) is restyled to
  the new palette and type in step 1.
- Covers and list keep their exact layout and behaviour; they are re-dressed
  in the new tokens (covers gain radius + shadow, headings go serif, status
  bar and modals restyled).

## Out of scope / unchanged

Data model and API, auth, Goodreads import, quick-add, settings, deploy modes
(local SQLite, Vercel + Turso, portable single file). Keyboard shortcuts are
unchanged except: `v` cycles three views, and arrows/Enter drive the carousel
in shelf view.

## Accessibility

Focus-visible cobalt outlines everywhere; carousel operable by keyboard alone
(arrows + Enter) and by buttons alone; the caption narrates carousel position
(aria-live polite); ink-on-paper and cobalt-on-paper meet WCAG AA for the
text sizes used.

## Testing (TDD throughout)

New suites:
- `src/showcase.test.js` — membership, ordering with null-last + title
  tiebreak, caps, `settings.landing` and medium filtering, empty-group hiding,
  "On the shelf" fallback.
- `src/spines.test.js` — palette choice deterministic per id, stable across
  reorders, foreground pairing correct.
- Carousel geometry (relative position, spacing, wrap) as pure functions,
  unit-tested; springs and rendering verified manually in the browser.
- Overlay tests in `src/main.test.js` covering every parity-checklist item.

Existing tests whose expectations change (rewritten, never deleted — each
rewrite keeps the behaviour under test and updates only the selectors or
starting view):

| Step | Tests |
|---|---|
| 2 (masthead) | `renames the masthead to Shelf`, `shows a configured shelf name in the masthead…`, `clicking the Bookshelf masthead goes home`, `renders medium tabs…` |
| 4 (shelf default) | `shows all books in the cover wall`, `renders landing sections in the configured order`, `skips sections for media hidden…`, `opens a book from the cover wall with the Enter key`, `arrows move the selection and Enter opens` — these set `state.view = 'covers'` first, since they test the wall |
| 5–6 (overlay) | `drawer metadata`, all `inline editing` tests, `opens the drawer for a single-title route`, `sets a book hash when opening from the wall…` — re-pointed from `.drawer-panel` to the overlay |

All other existing tests must stay green, unchanged, at every step.

## Build order (each step lands green and is committed separately)

1. Tokens, fonts, placeholder restyle — app restyled flat, no layout changes.
2. Header masthead + toolbar; covers/list/modals re-dress.
3. `showcase.js` + `spines.js` with tests.
4. Shelf view carousel (markup, geometry, inputs, caption); default view switch.
5. Detail overlay; every view opens it.
6. **Checkpoint for Jason's review:** parity checklist passes → drawer
   removal and dead-style cleanup.

## Risks

- `style.css` (1,331 lines) is touched end-to-end → the build order above
  keeps the app consistent at every commit.
- Drawer removal loses workflow details → the parity checklist plus the step-6
  review checkpoint.
- Fonts: Newsreader and Inter Tight are OFL-licensed and served by Google
  Fonts, as Inter is today.
