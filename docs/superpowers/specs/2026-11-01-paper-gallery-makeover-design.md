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
  covers view with no search, tag, or route. So covers with no filters still
  renders the per-medium sections, ordered and limited by `settings.landing`,
  exactly as today.
- `state.view` is the single mechanism: when `state.view === 'shelf'`,
  `renderResults` renders the shelf. There is no separate "is the shelf
  showing" predicate; leaving the shelf always means changing `state.view`.

### View-change rules (the only implicit view changes)

- **Leaving the shelf:** while `state.view === 'shelf'`, typing a search,
  choosing a tag (select or number key), or applying a `title` / `author` /
  `tags` / `isbn` route sets `state.view = 'covers'`. This rule applies only
  from shelf; in covers or list these actions never change the view.
- **Entering the shelf:** switching to shelf by the Shelf button or `v`
  clears the search, the tag, and any `title` / `author` / `tags` / `isbn`
  route, but keeps a medium route. So the shelf never carries a stale search
  or tag, and the only filter it ever shows is the medium. In shelf view, Esc
  clears a medium route (as Esc clears routes today) and stays in shelf.
- **Nothing implicitly returns to the shelf.** Clearing the search, toggling
  a tag off, Esc clearing a route, Reset, and the empty-state "Clear filters"
  button all keep the current view (Reset clears filters and sort, as today).
- **Home:** clicking the masthead shelf name resets filters (as today) and
  sets `state.view = 'shelf'`.
- `#/medium/<key>` routes never change the view: in shelf they filter the
  showcase groups; in covers and list they filter as today.
- **Cold loads:** a `title` / `author` / `tags` / `isbn` route starts in
  covers; anything else (no route, or a medium route) starts in shelf.

### Search from the shelf

The search handler today calls `updateResults()` (not `render()`) so the input
keeps focus while typing. On the **first** keystroke in shelf view the view
must change, which needs a full `render()`: the handler sets
`state.view = 'covers'`, renders, then re-focuses the new search input with its
value and caret position restored. Every later keystroke takes the existing
`updateResults()` path unchanged.

### Routes

- No new routes. The existing single-match `#/title/<slug>` and
  `#/isbn/<isbn>` routes (written by `bookHash`) open the **overlay** instead
  of the drawer. `openBook` keeps `history.replaceState`, and `applyHash`
  keeps closing the detail on an in-app `hashchange` — Back behaves as today.

### Header

Masthead row (all views): left — view toggle (Shelf / Covers / List); centre —
shelf name in serif (the Home link) with the media filter beneath it as
small-caps links (All plus each present medium, exactly today's tabs); right —
search box, then Log In or the avatar menu (Add Media / Import / Shelf
Settings / Log Out), unchanged in behaviour.

Toolbar row (covers and list only): tag select, sort select, Reset — today's
controls, restyled. Hidden in shelf view.

The fixed status bar stays for covers and list and is hidden in shelf view,
where the caption and a footer count take its place: "<n> in <group name> ·
<total> in the library", where total is `state.books.length`.

Header listeners for Reset, Import, Log In and Log Out are scoped to
`.header [data-action=…]` today; they move with their controls, and the
toolbar row stays inside `.header` so those selectors keep working. The
three-way toggle keeps the `.view-btn` / `.active` / `data-view` markup that
existing tests and handlers rely on. The Shelf button arrives in step 4, with
the shelf view itself.

Clicking a rail tab or media link with the mouse releases its focus, so Enter
then opens the centred item instead of re-pressing the button; keyboard
focus on those buttons is unaffected. (Found in the prototype.)

### Keys in shelf view

Left/Right move the carousel; Enter opens the centred item; `/` focuses
search; `v` cycles views; `?` help and number-key tag filters work as today
(a tag leaves the shelf, per the rules above). `e`, `s`, Up and Down do
nothing in shelf view. While the overlay is open, `/` does nothing (the
overlay covers the search box).

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
- Which items are included: with no medium route, only media enabled in
  `settings.landing`; with a medium route, every item of that medium,
  **bypassing `settings.landing`**, as today's medium tabs do.
- Empty groups are hidden from the rail. If every group is empty but items
  are included, show one **On the shelf** group: every included item, title
  order, cap 30. (No date dependency, so it works on a fresh manual shelf.)
- If no items are included at all (empty library, or nothing in the active
  medium), the shelf area shows a one-line empty message in the caption
  style, plus an Add Media button when signed in. No rail, no carousel.
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
  opens the overlay. Clicking an off-center spine centers it. Spines and faces
  carry no `data-action="open-book"`, so the delegated `#results` click and
  keydown handlers don't open a book when a spine is clicked.

### Surviving re-renders

`render()` replaces all of `#app`, and many actions call it, including while
the detail is open (rating, notes, cover save, confirm dialogs, Left/Right
stepping). So:
- The active group key and centred item index live in `state`, not the DOM.
  A re-render rebuilds the carousel at that index with no motion. The spring
  animates only in response to navigation input.
- The overlay's entrance animations (clip-path expand, ink reveal, text rise)
  run only on the render that opens it, via a one-shot flag consumed by that
  render. Re-renders while it is open draw it in its settled state.

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
  When opened from the shelf, closing re-centres the carousel on the item
  last shown (which may differ after Left/Right stepping).
- **One deliberate removal:** the drawer closes on a backdrop click. The
  overlay fills the viewport, so there is no backdrop; close button and Esc
  only.

### Parity checklist (exactly the drawer today, nothing added)

Always shown (signed in or out), matching `renderDrawer`:
- Media-type label (today's drawer header) as the kicker.
- Cover image (existing cover chain).
- Title and creator fields (`data-field="title"` / `"author"`).
- "More by this author" link (author route), when the item has an author.
- Star display with halves, and the numeric rating value when rated.
- Metadata line: year · pages · read date.
- Notes textarea (`data-action="notes"`).
- External links: Bookshop.org, Amazon, Open Library search (existing
  `bookshopLink` / `amazonLink` / `openLibraryLink`).

Signed in only:
- Title and creator editable; medium select; tags comma input; ISBN input —
  all `data-field` inputs saved by `saveField`, with Escape reverting a field,
  an empty title refused, and a failed save reverted.
- Star click targets (half and full) to set the rating, plus Clear.
- Notes editable.
- Change Cover → cover picker (search + manual URL); disabled with a spinner
  while a cover saves (`state.savingCover`).
- Remove Book with confirm. If the removed item was open from the shelf, the
  carousel re-centres on the next item in the group, else the previous one;
  if the group empties, it disappears from the rail per the group rules.

Signed-out differences (`state.readOnly`): title, creator and notes are
read-only; no medium select; tags render as chips; no ISBN input, and the
metadata line adds "ISBN …" instead; no star targets, Clear, Change Cover or
Remove Book.

Keyboard while open: Left/Right step to the previous/next item **in the list
it was opened from** (the active showcase group when opened from shelf, the
filtered list otherwise) and **stop at the ends** — no wrap, as today; `e`
focuses the title field; Esc closes.

The selectors currently scoped to `.drawer-panel` (field listeners, `e`
focus) are re-scoped to the overlay. `.drawer-close` is also the close-button
class in the Add Media, Cover Picker, Settings, Log In and Import modals, and
its rules live in the Drawer CSS section; step-6 cleanup renames it to
`.modal-close` in all five modals and moves its rules to the Modals section.

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
- Shelf-view tests: view-change rules, search-from-shelf focus retention,
  shelf keys, empty shelf state, medium routes bypassing `settings.landing`.

### Keeping existing tests meaningful

Most existing `main.test.js` tests exercise the cover wall, and `state` is not
exposed to tests. So in step 4, when shelf becomes the default, the shared
`loadApp` helper gains a `view` option defaulting to `'covers'`: after the app
renders, it clicks `[data-view="covers"]`. Existing wall tests then run
unchanged against the same view they test today; new shelf tests pass
`{ view: 'shelf' }`. (The test fixtures give Dune `rating: 5`, so a
shelf-default load would show a one-item Favorites group and break wall
assertions — this helper change is what prevents that.)

Tests whose expectations still change (rewritten, never deleted; each keeps
the behaviour under test and updates only selectors or expected view):

| Step | Tests | Why |
|---|---|---|
| 2 | `renames the masthead to Shelf`, `shows a configured shelf name in the masthead and document title`, `saves the shelf name from Shelf Settings` | `.header-title h1` selector changes |
| 2, 4 | `clicking the Bookshelf masthead goes home` | selector (2); Home now lands on shelf (4) |
| 4 | `renders embedded books read-only when the API is unavailable` | boots `main.js` itself, bypassing `loadApp`; it clicks `[data-view="covers"]` after boot, like the helper |
| 5 | `drawer metadata`, all `inline editing` tests, `opens the drawer for a single-title route`, `opens a book from the cover wall with the Enter key`, `arrows move the selection and Enter opens`, `left/right walk prev/next while the drawer is open`, `Escape closes the drawer, then clears the search` | `.drawer-panel` / `.drawer-title` → overlay selectors |

This table is the expected impact, not a guarantee. The full suite runs at
every step; any failing test not listed here is raised with Jason before it
is changed.

## Build order (each step lands green and is committed separately)

1. Tokens, fonts, placeholder restyle — app restyled flat, no layout changes.
2. Header masthead + toolbar; covers/list/modals re-dress.
3. `showcase.js` + `spines.js` with tests.
4. Shelf view carousel (markup, geometry, inputs, caption); Shelf button and
   default view switch; `loadApp` helper change; view-change rules.
5. Detail overlay; every view opens it.
6. **Checkpoint for Jason's review:** parity checklist passes → drawer
   removal and dead-style cleanup.

Steps 1–2 (restyle) are a usable milestone on their own; steps 3–6 (shelf and
overlay) build on them.

## Risks

- `style.css` (1,331 lines) is touched end-to-end → the build order above
  keeps the app consistent at every commit.
- Drawer removal loses workflow details → the parity checklist plus the step-6
  review checkpoint.
- Fonts: Newsreader and Inter Tight are OFL-licensed and served by Google
  Fonts, as Inter is today.
