# Paper Gallery Makeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Shelf in the "paper gallery" language, add a 3D showcase shelf as the default landing view, and replace the side drawer with one cinematic, editable detail overlay.

**Architecture:** New behaviour lives in small focused modules imported by the existing `src/main.js` (string-template rendering over a global `state`, full `render()` on most changes). Pure logic (`showcase.js`, `spines.js`, `carousel.js`, overlay geometry) is unit-tested; DOM builders and the carousel controller (`shelf.js`, `overlay.js`) are tested under happy-dom; `main.js` integration is tested through the existing `src/main.test.js` harness. Motion code is always guarded because happy-dom has no `Element.animate`, and state never waits on an animation.

**Tech Stack:** Vanilla JS (ES modules), Vite 7, vitest 4 + happy-dom 20, plain CSS with custom properties, Google Fonts (Newsreader, Inter Tight).

**Spec:** `docs/superpowers/specs/2026-11-01-paper-gallery-makeover-design.md` — read it before starting. Where this plan and the spec disagree, stop and ask Jason.

---

## Ground rules (read once)

- **Branch:** `wip/paper-gallery-makeover` (already exists). Never commit to `main`.
- **Baseline:** `npx vitest run` → `Test Files 14 passed`, `Tests 166 passed`. Every task ends with the full suite green and **pristine output** (no unexpected warnings or errors).
- **Jason's rules that bite here:**
  - TDD for every behaviour: failing test → see it fail → minimal code → see it pass.
  - Every new code file starts with two `ABOUTME:` comment lines.
  - **Never delete a test.** The spec lists the tests whose selectors or expected view change; rewriting those is approved. Any *other* failing test: stop and raise it with Jason before changing it.
  - Match surrounding style (2-space indent, no semicolons, single quotes in JS).
  - No comments about history ("new", "moved", "used to").
- **Commits:** one per task (or per step where marked). Stage files by name — never `git add -A`. Message style matches the repo: one imperative sentence, then a blank line and:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
  Commits are SSH-signed through 1Password. If signing fails with `1Password: failed to fill whole buffer`, stop and ask Jason to unlock 1Password. Never bypass signing.
- **Run one test file:** `npx vitest run src/showcase.test.js`. **One test by name:** `npx vitest run src/main.test.js -t "lands on the shelf"`.
- **Visual verification** (CSS tasks have no unit tests — they are verified by looking): start the dev server with the browser pane's `preview_start` using the `bookshelf-dev` launch config. If it fails with `getcwd: cannot access parent directories: Operation not permitted` (macOS file privacy on `~/Documents`), ask Jason to run `npm run dev` in his Terminal panel, then open `http://localhost:5173` in the browser pane. Check at a desktop size (1440×900) and at the mobile preset; take a screenshot of each surface named in the task.
- **Reference implementation:** a working throwaway prototype of the shelf and overlay is at `.superpowers/prototype/shelf.html` (gitignored). Its CSS and motion constants are the source for Tasks 12 and 15.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/html.js` | create | `esc()` — HTML escaping shared by all renderers |
| `src/showcase.js` | create | Which items the shelf shows, grouped for the rail; caption state line; star text |
| `src/spines.js` | create | Spine colour per item id; short title; subtitle; creator surname |
| `src/carousel.js` | create | Pure carousel geometry (relative position, wrap, offsets) |
| `src/shelf.js` | create | Shelf view markup + `mountShelf()` controller (motion, pointer input, caption) |
| `src/overlay.js` | create | Detail overlay markup + entrance/exit motion + ink reveal |
| `src/*.test.js` | create | One test file per module above |
| `src/main.js` | modify | State, header/masthead, view rules, keys, shelf mount lifecycle, overlay wiring |
| `src/main.test.js` | modify | `loadApp` view option; approved selector rewrites; new shelf/overlay integration tests |
| `src/style.css` | modify | Tokens, re-dress of every section, shelf view, overlay; drawer CSS removed at the end |
| `index.html` | modify | Font link |
| `README.md` | modify | Tagline and description match the new design |

---

# Milestone A — Restyle (spec steps 1–2)

### Task 1: Extract `esc` into `src/html.js`

The new modules need HTML escaping; `esc` lives privately in `main.js` today.

**Files:**
- Create: `src/html.js`, `src/html.test.js`
- Modify: `src/main.js:6-14` (delete `esc`, add import)

- [ ] **Step 1: Write the failing test** — `src/html.test.js`:

```js
// ABOUTME: Tests for the shared HTML escaping helper.
// ABOUTME: Covers markup characters, both quote styles, and empty values.

import { describe, it, expect } from 'vitest'
import { esc } from './html.js'

describe('esc', () => {
  it('escapes markup and both quote styles', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('renders null and undefined as empty text', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })

  it('stringifies numbers', () => {
    expect(esc(1965)).toBe('1965')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails** — `npx vitest run src/html.test.js` → FAIL, cannot resolve `./html.js`.

- [ ] **Step 3: Create `src/html.js`:**

```js
// ABOUTME: HTML escaping shared by the app's string-template renderers.
// ABOUTME: Safe for element content and for quoted attribute values.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

- [ ] **Step 4: Use it from `main.js`.** Delete the `esc` function and its comment (lines 6–14) and add to the imports at the top:

```js
import { esc } from './html.js'
```

- [ ] **Step 5: Run everything** — `npx vitest run` → all pass (169 = 166 + 3).

- [ ] **Step 6: Commit**

```bash
git add src/html.js src/html.test.js src/main.js
git commit -m "Share HTML escaping from its own module"
```

---

### Task 2: Paper tokens, fonts, and base styles

**Files:**
- Modify: `src/style.css:1-35` (header comment, `:root`, `*`, `html, body`, `body`)
- Modify: `index.html:7-9` (font link)

- [ ] **Step 1: Replace the top of `src/style.css`** (everything from line 1 down to, but not including, `.hidden { display: none !important; }`) with:

```css
/* ABOUTME: Paper gallery design system for the bookshelf app.
   ABOUTME: Warm paper ground, film grain, Newsreader display, Inter Tight labels, cobalt accent. */

:root {
  --ink: #141414;
  --paper: #EDEBE6;
  --sheet: #F4F2ED;
  --muted: #6D6A63;
  --accent: #1F3FB0;
  --highlight: #ffec42;
  --rule: 1px solid var(--ink);
  --rule-thin: 1px solid rgba(20, 20, 20, 0.22);
  --display: 'Newsreader', Georgia, serif;
  --sans: 'Inter Tight', system-ui, sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, monospace;
  --radius: 2px;
  --shadow: 0 18px 36px -20px rgba(20, 16, 10, 0.55);
  --ease: cubic-bezier(.2, .8, .2, 1);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  padding-bottom: 34px; /* clear the fixed status bar */
}

/* Film grain over everything; never intercepts input */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  mix-blend-mode: multiply;
  opacity: 0.55;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .42 0 0 0 0 .38 .44 0 0 0 0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 220px 220px;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
```

(This removes the `border-radius: 0 !important` rule from `*`.)

- [ ] **Step 2: Replace the font link in `index.html`** (the `fonts.googleapis.com/css2?family=Inter…` stylesheet line) with:

```html
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Run the suite** — `npx vitest run` → all pass (CSS does not affect tests).

- [ ] **Step 4: Look at it.** Start the dev server (see Ground rules) and screenshot the covers view. Expect: paper background, grain, Inter Tight text; layout unchanged; headings still heavy (fixed in Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/style.css index.html
git commit -m "Lay the paper gallery tokens, fonts, and grain under the app"
```

---

### Task 3: Re-dress every section and the placeholder cover

No layout or behaviour changes — only colour, type, rules, radius, and shadow. Work through `src/style.css` section by section (sections are marked `/* ---------- Name ---------- */`), applying this mapping:

| Today | Becomes |
|---|---|
| `#000`, `black` | `var(--ink)` |
| `#fff`, `white` as a surface | `var(--paper)`; modal/dialog panels use `var(--sheet)` |
| `#ff2e2e` | `var(--accent)` |
| `border: var(--rule)` / `3px solid` | `border: var(--rule)` (now 1px) — leave as the token |
| Headings and titles (`h1`–`h3`, `.media-heading button`, modal/dialog titles, `.help-panel h2`, `.empty-state p`) | `font-family: var(--display); font-weight: 400; text-transform: none; letter-spacing: -0.01em;` |
| Labels, buttons, tabs, status bar, table headers, tag chips (anything uppercase/`font-weight: 900`/mono metadata) | `font-family: var(--sans); font-weight: 600; font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase;` (keep existing sizes where the element is larger than a label, e.g. `.btn` stays readable at 11–12px) |
| `font-family: var(--mono)` | keep **only** for ISBN values and the import preview counts; everything else `var(--sans)` |
| Hover that inverts to black (`background: var(--ink); color: var(--paper)`) | keep — it reads well on paper |
| `background: var(--highlight)` hovers on tabs/buttons | `background: rgba(31, 63, 176, 0.08)` |

Section-specific additions:

- **Cover wall** (`.cover-tile`, `.cover-aspect`, `.cover-img`): add `border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;` to the tile's image box. The hover overlay uses `background: rgba(20, 20, 20, 0.82); color: var(--paper)`.
- **Buttons** (`.btn`): `border: 1px solid var(--ink); background: transparent; border-radius: var(--radius);`. `.btn-primary`: `background: var(--accent); border-color: var(--accent); color: var(--sheet)`. `.btn-danger`: `color: #B33A24; border-color: #B33A24` (hover fills it with `color: var(--sheet)`). `#B33A24` is the darkest red that still reads as red and passes AA (4.5:1) on paper.
- **Form elements** (`.search-input`, `.select`, `.form-input`, `.notes-input`): `border: 1px solid rgba(20, 20, 20, 0.35); background: var(--sheet); border-radius: var(--radius);` focus: `border-color: var(--accent)`.
- **Modals, cover picker, confirm, help, import** panels: `background: var(--sheet); border: var(--rule); border-radius: var(--radius); box-shadow: 0 30px 80px -30px rgba(20, 16, 10, 0.5);` backdrops: `background: rgba(20, 20, 20, 0.35)`.
- **Status bar:** `background: var(--paper); border-top: var(--rule-thin);` label typography.
- **Toast:** `background: var(--ink); color: var(--paper); border-radius: var(--radius);` error toast `background: #B33A24`.
- **Drawer** section: re-dress too (it lives until Task 17): panel `background: var(--sheet)`, `border-left: var(--rule)`.

**Files:**
- Modify: `src/style.css` (all sections)
- Modify: `src/main.js` — `generatePlaceholder` (around line 290)

- [ ] **Step 1: Re-dress the stylesheet** using the mapping above, top to bottom.

- [ ] **Step 2: Verify nothing brutalist is left:**

```bash
grep -n "font-weight: 900\|#ff2e2e\|#000\b\|#fff\b\|3px solid" src/style.css
```

Expected: no output.

```bash
grep -n "var(--mono)" src/style.css
```

Expected: only ISBN and import-preview selectors.

- [ ] **Step 3: Restyle the placeholder cover.** In `generatePlaceholder`, keep `wrapText` and `escapeXml`, and replace the `titleLines` and `svg` constants with:

```js
  const titleLines = wrapText(title.toUpperCase(), 16).map((line, i) =>
    `<tspan x="300" dy="${i === 0 ? 0 : 60}">${escapeXml(line)}</tspan>`
  ).join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
      <rect width="600" height="900" fill="#E6DBC2"/>
      <text x="300" y="110" text-anchor="middle" font-family="'Inter Tight', system-ui, sans-serif" font-size="20" font-weight="600" letter-spacing="4" fill="#141414">${escapeXml(author.toUpperCase())}</text>
      <text x="300" y="360" text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="52" fill="#141414">
        ${titleLines}
      </text>
    </svg>
  `.trim()
```

- [ ] **Step 4: Run the suite** — `npx vitest run` → all pass (`walks the cover fallback chain…` still sees `data:image/svg+xml`).

- [ ] **Step 5: Look at it.** Screenshot at desktop and mobile: covers view, list view, Add Media modal, Import modal, Shelf Settings, Log In (if `canLogin`), cover picker, confirm dialog (Remove Book → Cancel), help overlay (`?`), a toast (edit a field), drawer, an item with no cover (placeholder). Every surface should read as warm paper / ink / cobalt with serif headings; nothing should have moved.

- [ ] **Step 6: Commit**

```bash
git add src/style.css src/main.js
git commit -m "Re-dress every surface and the placeholder cover in paper and ink"
```

---

### Task 4: Masthead and toolbar

The header becomes a centred masthead (view toggle left, shelf name with media links centre, search and account right) and a toolbar row (tag, sort, Reset).

**Files:**
- Modify: `src/main.js` — header markup in `render()` (around lines 452–493) and the `${renderMediaTabs()}` line after it
- Modify: `src/style.css` — `Header` section and the `.media-tabs` / `.media-tab` rules in `Media tabs & sections`
- Modify: `src/main.test.js` — three approved selector rewrites

- [ ] **Step 1: Rewrite the three approved tests to the new selector.** In `src/main.test.js`, replace `.header-title h1` with `.masthead-title h1` in exactly these tests:
  - `renames the masthead to Shelf`
  - `shows a configured shelf name in the masthead and document title`
  - `saves the shelf name from Shelf Settings`

  Also add this test to the `shelf media` describe:

```js
  it('puts the media links in the masthead and filters in a toolbar', async () => {
    await loadApp(MIXED)
    expect(document.querySelector('.masthead-title .media-tabs')).not.toBeNull()
    expect(document.querySelector('.toolbar [data-action="tag"]')).not.toBeNull()
    expect(document.querySelector('.toolbar [data-action="sort"]')).not.toBeNull()
    expect(document.querySelector('.header .toolbar [data-action="reset"]')).not.toBeNull()
    expect(document.querySelector('.masthead-actions [data-action="search"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run them and confirm they fail** — `npx vitest run src/main.test.js -t "masthead"` → FAIL (no `.masthead-title`).

- [ ] **Step 3: Replace the header markup in `render()`.** Replace the whole `<div class="header">…</div>` block and delete the `${renderMediaTabs()}` line that follows it, with:

```js
    <div class="header">
      <div class="masthead">
        <div class="view-toggle">
          <button class="view-btn ${state.view === 'covers' ? 'active' : ''}" data-action="view" data-view="covers">Covers</button>
          <button class="view-btn ${state.view === 'list' ? 'active' : ''}" data-action="view" data-view="list">List</button>
        </div>
        <div class="masthead-title">
          <h1><button data-action="home" title="Back to the shelf">${esc(state.settings.shelfName || 'Shelf')}</button></h1>
          ${renderMediaTabs()}
        </div>
        <div class="masthead-actions">
          <div class="search-wrap">
            <input type="text" class="search-input" placeholder="Search title / author / tags" value="${esc(state.q)}" data-action="search">
            <button class="search-clear ${state.q ? '' : 'hidden'}" data-action="clear-search">&times;</button>
          </div>
          ${state.canLogin && state.readOnly ? '<button class="btn" data-action="login">Log In</button>' : ''}
          ${state.readOnly ? '' : `
          <div class="avatar-wrap">
            <button class="avatar" data-action="avatar-menu" title="Shelf actions">${esc((state.settings.shelfName || 'Shelf')[0].toUpperCase())}</button>
            <div class="avatar-dropdown ${state.menuOpen ? 'open' : ''}">
              <button data-action="add-book">Add Media</button>
              <button data-action="import">Import</button>
              <button data-action="shelf-settings">Shelf Settings</button>
              ${state.loggedIn ? '<button data-action="logout">Log Out</button>' : ''}
            </div>
          </div>`}
        </div>
      </div>
      <div class="toolbar">
        <select class="select select-tag" data-action="tag">
          <option value="">All tags</option>
          ${allTags.map(t => `<option value="${esc(t)}" ${state.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
        <select class="select select-sort" data-action="sort">
          ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${state.sortBy === o.key ? 'selected' : ''}>${o.label}${state.sortBy === o.key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</option>`).join('')}
        </select>
        <button class="btn" data-action="reset">Reset</button>
      </div>
    </div>
```

  The Reset, Import, Log In and Log Out listeners select `.header [data-action=…]`; the toolbar and masthead are inside `.header`, so they keep working.

- [ ] **Step 4: Replace the CSS.** Replace the whole `Header` section (from `/* ---------- Header ---------- */` up to `/* ---------- Form elements ---------- */`) with:

```css
/* ---------- Header ---------- */

.header {
  background: var(--paper);
  position: sticky;
  top: 0;
  z-index: 20;
}

.masthead {
  max-width: 1600px;
  margin: 0 auto;
  padding: 1.1rem 2rem 0.9rem;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
}

.masthead .view-toggle { justify-self: start; }

.masthead-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
}

.masthead-title h1 {
  font-family: var(--display);
  font-weight: 400;
  font-size: 1.75rem;
  line-height: 1;
  letter-spacing: 0.005em;
}

.masthead-title h1 button {
  all: unset;
  cursor: pointer;
}

.masthead-title h1 button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.masthead-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 2rem 0.9rem;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  border-bottom: var(--rule-thin);
}

/* Mobile header: stacked masthead, Reset hidden (the shelf name is home),
   16px inputs so iOS won't zoom */
@media (max-width: 767px) {
  .masthead {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 0.8rem 1rem 0.6rem;
  }

  .masthead .view-toggle,
  .masthead-actions { justify-self: center; }

  .toolbar {
    padding: 0 1rem 0.6rem;
    flex-wrap: wrap;
  }

  .toolbar [data-action="reset"] { display: none; }

  .select-tag, .select-sort { flex: 1 1 30%; }

  .search-input, .select, .form-input, .notes-input {
    font-size: 16px;
  }

  .btn, .view-btn {
    padding: 0.55rem 0.7rem;
  }
}
```

  And replace the `.media-tabs`, `.media-tab`, `.media-tab:hover`, `.media-tab.active` rules with:

```css
.media-tabs {
  display: flex;
  gap: 0.9rem;
}

.media-tab {
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
  background: none;
  border: 0;
  border-bottom: 1px solid transparent;
  padding: 2px 0;
  cursor: pointer;
  transition: color .3s var(--ease), border-color .3s var(--ease);
}

.media-tab:hover { color: var(--ink); }

.media-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
```

- [ ] **Step 5: Run the suite** — `npx vitest run` → all pass, including the four tests above.

- [ ] **Step 6: Look at it** at desktop and mobile: masthead centred, toolbar beneath, avatar menu opens, search clears, media links filter (use a library with 2+ media).

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/main.test.js src/style.css
git commit -m "Centre the shelf name in a masthead with a filter toolbar beneath"
```

**Milestone A done:** the whole app is restyled and usable. Good moment to show Jason.

---

# Milestone B — The shelf (spec steps 3–4)

### Task 5: `showcase.js` — which items the shelf shows

**Files:**
- Create: `src/showcase.js`, `src/showcase.test.js`

- [ ] **Step 1: Write the failing tests** — `src/showcase.test.js`:

```js
// ABOUTME: Tests for choosing and grouping the items the shelf view showcases.
// ABOUTME: Covers group membership, ordering, caps, media filtering, fallbacks and caption text.

import { describe, it, expect } from 'vitest'
import { showcaseGroups, captionState, starText } from './showcase.js'

const ALL = ['book', 'audiobook', 'movie', 'podcast', 'album']
const item = (id, fields = {}) => ({ id, title: id, tags: [], rating: null, dateRead: null, dateAdded: null, medium: 'book', ...fields })
const keys = groups => groups.map(g => g.key)
const ids = group => group.items.map(b => b.id)
const READING = ['currently-reading']

describe('showcaseGroups', () => {
  it('groups reading, favorites and recently finished, hiding empty groups', () => {
    const books = [item('a', { tags: READING }), item('b', { rating: 5 })]
    expect(keys(showcaseGroups(books, { landing: ALL }))).toEqual(['reading', 'favorites'])
  })

  it('orders by date newest first, puts missing dates last, and breaks ties by title', () => {
    const books = [
      item('Zed', { tags: READING }),
      item('Old', { tags: READING, dateAdded: '2024-01-01' }),
      item('New', { tags: READING, dateAdded: '2025-06-01' }),
      item('Abe', { tags: READING }),
    ]
    expect(ids(showcaseGroups(books, { landing: ALL })[0])).toEqual(['New', 'Old', 'Abe', 'Zed'])
  })

  it('caps favorites at 30 and recently finished at 20, newest read first', () => {
    const books = Array.from({ length: 35 }, (_, i) => item(`b${i}`, { rating: 5, dateRead: `${2000 + i}-01-01` }))
    const [favorites, finished] = showcaseGroups(books, { landing: ALL })
    expect(favorites.key).toBe('favorites')
    expect(favorites.items).toHaveLength(30)
    expect(favorites.items[0].id).toBe('b34')
    expect(finished.key).toBe('finished')
    expect(finished.items).toHaveLength(20)
    expect(finished.items[19].id).toBe('b15')
  })

  it('treats only a full five stars as a favorite', () => {
    const books = [item('half', { rating: 4.5 }), item('full', { rating: 5 })]
    expect(ids(showcaseGroups(books, { landing: ALL })[0])).toEqual(['full'])
  })

  it('includes only landing media when there is no medium filter', () => {
    const books = [item('bk', { rating: 5 }), item('al', { rating: 5, medium: 'album' })]
    expect(ids(showcaseGroups(books, { landing: ['book'] })[0])).toEqual(['bk'])
  })

  it('lets a medium filter bypass the landing config', () => {
    const books = [item('bk', { rating: 5 }), item('al', { rating: 5, medium: 'album' })]
    expect(ids(showcaseGroups(books, { landing: ['book'], medium: 'album' })[0])).toEqual(['al'])
  })

  it('treats a missing medium as a book', () => {
    const books = [{ id: 'm', title: 'm', tags: [], rating: 5 }]
    expect(ids(showcaseGroups(books, { landing: ['book'] })[0])).toEqual(['m'])
  })

  it('falls back to On the shelf in title order, capped at 30, when every group is empty', () => {
    const books = Array.from({ length: 40 }, (_, i) => item(`t${String(39 - i).padStart(2, '0')}`))
    const groups = showcaseGroups(books, { landing: ALL })
    expect(keys(groups)).toEqual(['shelf'])
    expect(groups[0].label).toBe('On the shelf')
    expect(groups[0].items).toHaveLength(30)
    expect(groups[0].items[0].id).toBe('t00')
  })

  it('returns no groups when nothing is included', () => {
    expect(showcaseGroups([], { landing: ALL })).toEqual([])
    expect(showcaseGroups([item('bk')], { landing: ALL, medium: 'album' })).toEqual([])
  })
})

describe('captionState', () => {
  it('says Reading for items being read, even when they have a read date', () => {
    expect(captionState(item('a', { tags: READING, dateRead: '2025-06-01' }))).toBe('Reading')
  })

  it('gives the month and year an item was read', () => {
    expect(captionState(item('a', { dateRead: '2025-06-14' }))).toBe('Read Jun 2025')
  })

  it('is empty otherwise', () => {
    expect(captionState(item('a'))).toBe('')
  })
})

describe('starText', () => {
  it('draws whole and half stars', () => {
    expect(starText(4.5)).toBe('★★★★½')
    expect(starText(5)).toBe('★★★★★')
  })

  it('is empty when unrated', () => {
    expect(starText(null)).toBe('')
    expect(starText(0)).toBe('')
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/showcase.test.js` → FAIL, cannot resolve `./showcase.js`.

- [ ] **Step 3: Create `src/showcase.js`:**

```js
// ABOUTME: Chooses which library items the shelf view showcases, grouped for its tab rail.
// ABOUTME: Also formats an item's caption state line and its star rating as text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const READING_TAG = 'currently-reading'

const mediumOf = b => b.medium || 'book'
const isReading = b => (b.tags || []).includes(READING_TAG)
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '')

// Newest first; items without the date go last; ties break by title
const newestFirst = key => (a, b) => {
  const x = a[key] || null
  const y = b[key] || null
  if (x && y && x !== y) return x < y ? 1 : -1
  if (!x !== !y) return x ? -1 : 1
  return byTitle(a, b)
}

export function showcaseGroups(books, { landing = [], medium = '' } = {}) {
  const pool = books.filter(b => medium ? mediumOf(b) === medium : landing.includes(mediumOf(b)))
  const groups = [
    { key: 'reading', label: 'Reading', items: pool.filter(isReading).sort(newestFirst('dateAdded')) },
    { key: 'favorites', label: 'Favorites', items: pool.filter(b => b.rating === 5).sort(newestFirst('dateRead')).slice(0, 30) },
    { key: 'finished', label: 'Recently finished', items: pool.filter(b => b.dateRead).sort(newestFirst('dateRead')).slice(0, 20) },
  ].filter(g => g.items.length)
  if (!groups.length && pool.length) {
    groups.push({ key: 'shelf', label: 'On the shelf', items: [...pool].sort(byTitle).slice(0, 30) })
  }
  return groups
}

export function captionState(book) {
  if (isReading(book)) return 'Reading'
  if (!book.dateRead) return ''
  const [year, month] = String(book.dateRead).split('-')
  return month ? `Read ${MONTHS[Number(month) - 1]} ${year}` : `Read ${year}`
}

export function starText(rating) {
  if (!rating) return ''
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '')
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/showcase.test.js` → all pass. Then `npx vitest run` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/showcase.js src/showcase.test.js
git commit -m "Choose and group the items the shelf showcases"
```

---

### Task 6: `spines.js` — how a spine looks

**Files:**
- Create: `src/spines.js`, `src/spines.test.js`

- [ ] **Step 1: Write the failing tests** — `src/spines.test.js`:

```js
// ABOUTME: Tests for deriving a book spine's colour, short title, subtitle and creator name.
// ABOUTME: Colour choice must be deterministic per id and spread across the palette.

import { describe, it, expect } from 'vitest'
import { SPINE_PALETTE, spinePalette, spineTitle, subtitleOf, spineCreator } from './spines.js'

describe('spinePalette', () => {
  it('always gives the same id the same palette entry', () => {
    expect(spinePalette('s2-dune')).toBe(spinePalette('s2-dune'))
    expect(SPINE_PALETTE).toContain(spinePalette('s2-dune'))
  })

  it('does not depend on what else is on the shelf', () => {
    const ids = ['a', 'b', 'c', 'd']
    const forward = ids.map(spinePalette)
    const backward = [...ids].reverse().map(spinePalette).reverse()
    expect(backward).toEqual(forward)
  })

  it('spreads ids across the palette', () => {
    const used = new Set(Array.from({ length: 50 }, (_, i) => spinePalette(`book-${i}`)))
    expect(used.size).toBeGreaterThanOrEqual(5)
  })

  it('pairs every cloth colour with text that meets WCAG AA contrast', () => {
    const channel = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = hex => {
      const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    for (const { bg, fg } of SPINE_PALETTE) {
      const [hi, lo] = [luminance(bg), luminance(fg)].sort((a, b) => b - a)
      expect((hi + 0.05) / (lo + 0.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('spineTitle', () => {
  it('keeps a plain title', () => {
    expect(spineTitle('Dune')).toBe('Dune')
  })

  it('drops a subtitle', () => {
    expect(spineTitle('A Long Walk to Water: A Powerful Adventure')).toBe('A Long Walk to Water')
  })

  it('drops a trailing series marker', () => {
    expect(spineTitle('Polostan (Bomb Light #1)')).toBe('Polostan')
  })

  it('handles a missing title', () => {
    expect(spineTitle(undefined)).toBe('')
  })
})

describe('subtitleOf', () => {
  it('gives the text after the colon', () => {
    expect(subtitleOf('Flow: The Psychology of Optimal Experience')).toBe('The Psychology of Optimal Experience')
  })

  it('is empty without a subtitle', () => {
    expect(subtitleOf('Dune')).toBe('')
  })
})

describe('spineCreator', () => {
  it('uses the surname', () => {
    expect(spineCreator('Frank Herbert')).toBe('Herbert')
  })

  it('skips generational suffixes', () => {
    expect(spineCreator('Kurt Vonnegut Jr.')).toBe('Vonnegut')
  })

  it('keeps single-word names and handles none', () => {
    expect(spineCreator('WNYC')).toBe('WNYC')
    expect(spineCreator(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/spines.test.js` → FAIL, cannot resolve `./spines.js`.

- [ ] **Step 3: Create `src/spines.js`:**

```js
// ABOUTME: Derives a book spine's look from an item: cloth colour, short title, subtitle, creator.
// ABOUTME: Colours are deterministic per item id so a spine keeps its colour across renders.

export const SPINE_PALETTE = [
  { bg: '#1B1A18', fg: '#EDE3CC' },
  { bg: '#1F3FB0', fg: '#EDE3CC' },
  { bg: '#B33A24', fg: '#EDE3CC' },
  { bg: '#E6DBC2', fg: '#141414' },
  { bg: '#C9A227', fg: '#141414' },
  { bg: '#2F4F3E', fg: '#EDE3CC' },
  { bg: '#6B3A4B', fg: '#EDE3CC' },
]

// FNV-1a string hash: small, fast and stable across runs
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function spinePalette(id) {
  return SPINE_PALETTE[hash(String(id)) % SPINE_PALETTE.length]
}

export function spineTitle(title) {
  const full = String(title || '')
  const short = full.split(/:\s/)[0].replace(/\s*\([^)]*#\s*\d+[^)]*\)\s*$/, '').trim()
  return short || full
}

export function subtitleOf(title) {
  const full = String(title || '')
  const i = full.indexOf(': ')
  return i > 0 ? full.slice(i + 2).trim() : ''
}

export function spineCreator(name) {
  const parts = String(name || '').replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').trim().split(/\s+/)
  return parts[parts.length - 1] || ''
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/spines.test.js`, then `npx vitest run` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/spines.js src/spines.test.js
git commit -m "Derive each spine's colour, short title, and creator name"
```

---

### Task 7: `carousel.js` — pure carousel geometry

**Files:**
- Create: `src/carousel.js`, `src/carousel.test.js`

- [ ] **Step 1: Write the failing tests** — `src/carousel.test.js`:

```js
// ABOUTME: Tests for the shelf carousel's pure geometry: wrapping, positions and offsets.
// ABOUTME: Positions are in item units; offsets are in pixels for a given spine and face size.

import { describe, it, expect } from 'vitest'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset } from './carousel.js'

describe('wrapping', () => {
  it('wraps lists of eight or more by laying three copies end to end', () => {
    expect(wraps(8)).toBe(true)
    expect(slotCount(10)).toBe(30)
  })

  it('does not wrap short lists', () => {
    expect(wraps(7)).toBe(false)
    expect(slotCount(3)).toBe(3)
  })

  it('starts on the middle copy when wrapping', () => {
    expect(positionFor(2, 10)).toBe(12)
    expect(positionFor(2, 5)).toBe(2)
  })
})

describe('relativePosition', () => {
  it('measures signed distance from the current position', () => {
    expect(relativePosition(10, 10, 10)).toBe(0)
    expect(relativePosition(11, 10, 10)).toBe(1)
    expect(relativePosition(9, 10, 10)).toBe(-1)
  })

  it('takes the shortest way round a wrapping list', () => {
    expect(relativePosition(29, 0, 10)).toBe(-1)
    expect(relativePosition(0, 29, 10)).toBe(1)
  })

  it('is a plain difference for short lists', () => {
    expect(relativePosition(3, 1, 5)).toBe(2)
  })
})

describe('itemIndexAt', () => {
  it('maps a wrapping position back to an item', () => {
    expect(itemIndexAt(13.4, 10)).toBe(3)
    expect(itemIndexAt(-1, 10)).toBe(9)
  })

  it('clamps for short lists', () => {
    expect(itemIndexAt(7, 5)).toBe(4)
    expect(itemIndexAt(-2, 5)).toBe(0)
  })
})

describe('clampPosition', () => {
  it('keeps short lists in range and leaves wrapping lists alone', () => {
    expect(clampPosition(9, 5)).toBe(4)
    expect(clampPosition(-3, 5)).toBe(0)
    expect(clampPosition(99, 10)).toBe(99)
  })
})

describe('faceOut', () => {
  it('is fully face-out at the centre and spine-out a slot away', () => {
    expect(faceOut(0)).toBe(1)
    expect(faceOut(1)).toBe(0)
    expect(faceOut(-2)).toBe(0)
    expect(faceOut(-0.5)).toBe(0.5)
  })
})

describe('slotOffset', () => {
  const size = { spineWidth: 20, faceWidth: 100, gap: 2 }

  it('puts the centre at zero', () => {
    expect(slotOffset(0, size)).toBe(0)
  })

  it('opens a gap the width of the face around the centre', () => {
    expect(slotOffset(1, size)).toBeCloseTo(63.6)
    expect(slotOffset(-1, size)).toBeCloseTo(-63.6)
  })

  it('packs further spines side by side', () => {
    expect(slotOffset(2, size) - slotOffset(1, size)).toBeCloseTo(22)
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/carousel.test.js` → FAIL.

- [ ] **Step 3: Create `src/carousel.js`:**

```js
// ABOUTME: Pure geometry for the shelf carousel: where each slot sits relative to the centre.
// ABOUTME: Positions are in item units; slotOffset converts them to pixels.

// Long lists wrap by laying three copies end to end; short ones stop at the ends
export const wraps = count => count >= 8
export const slotCount = count => wraps(count) ? count * 3 : count

export function positionFor(index, count) {
  return wraps(count) ? count + index : index
}

// Signed distance of slot v from position s, the shortest way round when wrapping
export function relativePosition(v, s, count) {
  if (!wraps(count)) return v - s
  const length = count * 3
  let r = ((v - s) % length + length) % length
  if (r > length / 2) r -= length
  return r
}

export function itemIndexAt(x, count) {
  const i = Math.round(x)
  return wraps(count) ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i))
}

export function clampPosition(x, count) {
  return wraps(count) ? x : Math.max(0, Math.min(count - 1, x))
}

// 1 when a slot is centred and face-out, easing to 0 one slot away
export function faceOut(r) {
  const x = Math.max(0, 1 - Math.abs(r))
  return x * x * (3 - 2 * x)
}

// Spines sit side by side; the centred face pushes its neighbours apart by its own width
export function slotOffset(r, { spineWidth, faceWidth, gap }) {
  const spread = r <= -1 ? -0.5 : r >= 1 ? 0.5 : (r + Math.sin(Math.PI * r) / Math.PI) / 2
  return r * (spineWidth + gap) + (faceWidth - spineWidth + 1.6 * gap) * spread
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/carousel.test.js`, then `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add src/carousel.js src/carousel.test.js
git commit -m "Add the shelf carousel's geometry as pure functions"
```

---

### Task 8: `shelf.js` — shelf markup and carousel controller

`renderShelfView()` returns the shelf's HTML (rail, stage, caption, arrows, open button, footer, cursor). `mountShelf()` takes that rendered element, builds the spines into it, runs the motion loop, handles pointer/wheel/click input, and keeps the caption in step with the **target** item (so keyboard and tests see changes synchronously). It returns `{ step, goTo, open, centreRect, destroy }`. Keyboard input stays in `main.js`, which calls `step`/`open`.

**Files:**
- Create: `src/shelf.js`, `src/shelf.test.js`

- [ ] **Step 1: Write the failing tests** — `src/shelf.test.js`:

```js
// ABOUTME: Tests for the shelf view's markup and its carousel controller under happy-dom.
// ABOUTME: Motion is not asserted; caption, index reporting, input wiring and covers are.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderShelfView, mountShelf } from './shelf.js'

const books = n => Array.from({ length: n }, (_, i) => ({
  id: `b${i}`, title: `Book ${i}`, author: `Author ${i}`, tags: [], rating: null, dateRead: null, year: 2000 + i,
}))
const group = (items, key = 'reading', label = 'Reading') => ({ key, label, items })
const text = sel => document.querySelector(sel)?.textContent
const caption = () => text('.shelf-caption-title')

let control = null
function mountWith(items, index = 0, handlers = {}) {
  document.body.innerHTML = renderShelfView({ groups: [group(items)], activeKey: 'reading', index, total: 81, canAdd: false })
  control = mountShelf(document.querySelector('.shelf-view'), { items, index, reducedMotion: true, ...handlers })
  return control
}

afterEach(() => {
  control?.destroy()
  control = null
  document.body.innerHTML = ''
})

describe('renderShelfView', () => {
  it('lists every group in the rail with its count and marks the active one', () => {
    document.body.innerHTML = renderShelfView({
      groups: [group(books(2)), group(books(3), 'favorites', 'Favorites')],
      activeKey: 'favorites', index: 0, total: 81, canAdd: false,
    })
    const tabs = [...document.querySelectorAll('[data-shelf-group]')]
    expect(tabs.map(t => t.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Reading 2', 'Favorites 3'])
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
  })

  it('captions the item with its short title, creator, state and stars', () => {
    const dune = { id: 'd', title: 'Dune: Deluxe Edition', author: 'Frank Herbert', tags: ['currently-reading'], rating: 4.5 }
    document.body.innerHTML = renderShelfView({ groups: [group([dune])], activeKey: 'reading', index: 0, total: 81, canAdd: false })
    expect(caption()).toBe('Dune')
    expect(text('.shelf-caption-line')).toBe('Frank Herbert · Reading')
    expect(text('.shelf-caption-stars')).toBe('★★★★½')
  })

  it('counts the group and the library in the footer', () => {
    document.body.innerHTML = renderShelfView({ groups: [group(books(2))], activeKey: 'reading', index: 0, total: 81, canAdd: false })
    expect(text('.shelf-foot')).toBe('2 in Reading · 81 in the library')
  })

  it('falls back to the first group when the active key is unknown', () => {
    document.body.innerHTML = renderShelfView({ groups: [group(books(2))], activeKey: 'gone', index: 5, total: 2, canAdd: false })
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('reading')
    expect(caption()).toBe('Book 1')
  })

  it('renders item data as text', () => {
    const hostile = { id: 'h', title: '<b>Bold</b>', author: '<i>x</i>', tags: [] }
    document.body.innerHTML = renderShelfView({ groups: [group([hostile])], activeKey: 'reading', index: 0, total: 1, canAdd: false })
    expect(caption()).toBe('<b>Bold</b>')
    expect(document.querySelector('.shelf-caption b')).toBeNull()
  })

  it('shows an empty shelf, offering Add Media only when it can', () => {
    document.body.innerHTML = renderShelfView({ groups: [], activeKey: '', index: 0, total: 0, canAdd: true })
    expect(text('.shelf-empty')).toContain('Nothing on this shelf yet.')
    expect(document.querySelector('.shelf-empty [data-action="add-book"]')).not.toBeNull()
    document.body.innerHTML = renderShelfView({ groups: [], activeKey: '', index: 0, total: 0, canAdd: false })
    expect(document.querySelector('[data-action="add-book"]')).toBeNull()
  })
})

describe('mountShelf', () => {
  it('lays three copies of a long list and one copy of a short one', () => {
    mountWith(books(10))
    expect(document.querySelectorAll('.tape')).toHaveLength(30)
    control.destroy()
    mountWith(books(3))
    expect(document.querySelectorAll('.tape')).toHaveLength(3)
  })

  it('steps the caption and reports the new index', () => {
    const onIndexChange = vi.fn()
    mountWith(books(10), 0, { onIndexChange })
    control.step(1)
    expect(caption()).toBe('Book 1')
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('wraps backwards past the start of a long list', () => {
    mountWith(books(10))
    control.step(-1)
    expect(caption()).toBe('Book 9')
  })

  it('stops at the ends of a short list', () => {
    const onIndexChange = vi.fn()
    mountWith(books(3), 0, { onIndexChange })
    control.step(-1)
    expect(caption()).toBe('Book 0')
    expect(onIndexChange).not.toHaveBeenCalled()
  })

  it('goes the short way round to a far item', () => {
    mountWith(books(10))
    control.goTo(9)
    expect(caption()).toBe('Book 9')
  })

  it('starts on the given index', () => {
    mountWith(books(10), 4)
    expect(caption()).toBe('Book 4')
  })

  it('wires the arrow buttons and the open button', () => {
    const onOpen = vi.fn()
    mountWith(books(10), 0, { onOpen })
    document.querySelector('[data-shelf-step="1"]').click()
    expect(caption()).toBe('Book 1')
    document.querySelector('[data-shelf-open]').click()
    expect(onOpen).toHaveBeenCalledWith(1, expect.anything())
  })

  it('applies a resolved cover to every copy of that item', async () => {
    const resolveCover = book => Promise.resolve(book.id === 'b0' ? 'https://covers.example/b0.jpg' : null)
    mountWith(books(10), 0, { resolveCover })
    await new Promise(r => setTimeout(r, 0))
    const covers = [...document.querySelectorAll('.tape[data-id="b0"] .tape-cover')]
    expect(covers).toHaveLength(3)
    expect(covers.every(c => c.classList.contains('has-image'))).toBe(true)
    expect(document.querySelector('.tape[data-id="b1"] .tape-cover').classList.contains('has-image')).toBe(false)
  })

  it('stops its animation loop when destroyed', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    mountWith(books(10))
    control.destroy()
    expect(cancel).toHaveBeenCalled()
    cancel.mockRestore()
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/shelf.test.js` → FAIL, cannot resolve `./shelf.js`.

- [ ] **Step 3: Create `src/shelf.js`:**

```js
// ABOUTME: The shelf view: markup for the showcase rail, 3D carousel and caption, plus the
// ABOUTME: controller that drives the carousel's motion, pointer input and caption for one render.

import { esc } from './html.js'
import { captionState, starText } from './showcase.js'
import { spinePalette, spineTitle, spineCreator } from './spines.js'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset } from './carousel.js'

const ARROW_PREV = '<svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M5 1 L1 5 L5 9 M1 5 H17"/></svg>'
const ARROW_NEXT = '<svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M13 1 L17 5 L13 9 M17 5 H1"/></svg>'
const PLAY = '<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="1,0 12,6 1,12" fill="currentColor"/></svg>'
const TILT_DEG = -4.5

function captionHtml(book) {
  const line = [book.author, captionState(book)].filter(Boolean).map(esc).join(' &middot; ')
  return `<span class="shelf-caption-title">${esc(spineTitle(book.title))}</span>`
    + `<span class="shelf-caption-line">${line || '&nbsp;'}</span>`
    + `<span class="shelf-caption-stars">${starText(book.rating) || '&nbsp;'}</span>`
}

function tapeHtml(book) {
  const { bg, fg } = spinePalette(book.id)
  const title = spineTitle(book.title)
  const len = Math.max(8, title.length * 0.62).toFixed(2)
  return `
    <div class="tape" data-id="${esc(book.id)}" style="--bg:${bg};--fg:${fg}">
      <div class="tape-face tape-spine" style="--len:${len}">
        <span class="tape-spine-title">${esc(title)}</span>
        <span class="tape-spine-creator">${esc(spineCreator(book.author))}</span>
      </div>
      <div class="tape-face tape-cover">
        <div class="tape-cover-type">
          <span class="tape-cover-creator">${esc(book.author || '')}</span>
          <span class="tape-cover-title">${esc(title)}</span>
          <span class="tape-cover-year">${esc(book.year || '')}</span>
        </div>
      </div>
    </div>`
}

export function renderShelfView({ groups, activeKey, index, total, canAdd }) {
  if (!groups.length) {
    return `
      <div class="shelf-view shelf-empty">
        <p class="shelf-empty-text">Nothing on this shelf yet.</p>
        ${canAdd ? '<button class="btn" data-action="add-book">Add Media</button>' : ''}
      </div>`
  }
  const group = groups.find(g => g.key === activeKey) || groups[0]
  const book = group.items[Math.max(0, Math.min(index, group.items.length - 1))]
  return `
    <div class="shelf-view">
      <nav class="shelf-rail" aria-label="Showcase">
        ${groups.map(g => `<button class="shelf-tab ${g.key === group.key ? 'active' : ''}" data-shelf-group="${esc(g.key)}">${esc(g.label)} <span class="shelf-tab-count">${g.items.length}</span></button>`).join('')}
      </nav>
      <section class="shelf-stage-wrap" aria-label="${esc(group.label)}"><div class="shelf-stage"></div></section>
      <button class="shelf-open" data-shelf-open aria-label="Open">${PLAY}</button>
      <div class="shelf-caption" aria-live="polite">${captionHtml(book)}</div>
      <button class="shelf-arrow shelf-prev" data-shelf-step="-1" aria-label="Previous">${ARROW_PREV}</button>
      <button class="shelf-arrow shelf-next" data-shelf-step="1" aria-label="Next">${ARROW_NEXT}</button>
      <div class="shelf-foot">${group.items.length} in ${esc(group.label)} &middot; ${total} in the library</div>
      <div class="shelf-cursor" aria-hidden="true"><span class="shelf-cursor-ring"></span><span class="shelf-cursor-dot"></span><span class="shelf-cursor-label">Open</span></div>
    </div>`
}

export function mountShelf(root, {
  items,
  index = 0,
  reducedMotion = false,
  resolveCover = () => Promise.resolve(null),
  onIndexChange = () => {},
  onOpen = () => {},
}) {
  const count = items.length
  const wrap = root.querySelector('.shelf-stage-wrap')
  const stage = root.querySelector('.shelf-stage')
  const caption = root.querySelector('.shelf-caption')
  const openButton = root.querySelector('.shelf-open')
  const cursor = root.querySelector('.shelf-cursor')

  stage.innerHTML = Array.from({ length: slotCount(count) }, (_, v) => tapeHtml(items[v % count])).join('')
  const tapes = [...stage.querySelectorAll('.tape')].map(el => ({
    el,
    spine: el.querySelector('.tape-spine'),
    cover: el.querySelector('.tape-cover'),
    lift: 0,
    visible: null,
  }))

  let target = positionFor(index, count)
  let pos = target
  let shown = itemIndexAt(target, count)
  let hover = -1
  let overButton = false
  let drag = null
  let suppressClick = false
  let wheelTimer = 0
  let raf = 0
  let last = 0
  let destroyed = false
  let tiltX = 0
  let tiltY = 0
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, cx: innerWidth / 2, cy: innerHeight / 2 }
  let geom = measure()

  function measure() {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:var(--shelf-h)'
    root.append(probe)
    const h = probe.getBoundingClientRect().height
    probe.remove()
    const size = { h, spineWidth: h * 0.165, faceWidth: h * 2 / 3, gap: h * 0.03 }
    stage.style.setProperty('--h', `${size.h}px`)
    stage.style.setProperty('--ws', `${size.spineWidth}px`)
    stage.style.setProperty('--d', `${size.faceWidth}px`)
    return size
  }

  const stride = () => (geom.spineWidth + geom.gap) || 1

  function swapCaption(dir) {
    caption.innerHTML = captionHtml(items[shown])
    if (reducedMotion || typeof caption.animate !== 'function') return
    caption.animate(
      [{ transform: `translateY(${dir * 40}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' }
    )
  }

  function setTarget(x) {
    const dir = x >= target ? 1 : -1
    target = clampPosition(x, count)
    const i = itemIndexAt(target, count)
    if (i === shown) return
    shown = i
    swapCaption(dir)
    onIndexChange(i)
  }

  function step(delta) {
    setTarget(Math.round(target) + delta)
  }

  function goTo(i) {
    let delta = i - itemIndexAt(target, count)
    if (wraps(count)) {
      if (delta > count / 2) delta -= count
      if (delta < -count / 2) delta += count
    }
    setTarget(Math.round(target) + delta)
  }

  function centreRect() {
    let best = null
    let bestDistance = Infinity
    tapes.forEach((t, v) => {
      const d = Math.abs(relativePosition(v, pos, count))
      if (d < bestDistance) { bestDistance = d; best = t }
    })
    return best ? best.cover.getBoundingClientRect() : null
  }

  function open() {
    setTarget(Math.round(target))
    onOpen(shown, centreRect())
  }

  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1
    last = now
    const k = reducedMotion ? 1e6 : drag?.moved ? 18 : 5.2
    pos += (target - pos) * (1 - Math.exp(-k * dt))
    if (Math.abs(target - pos) < 1e-4) pos = target
    if (wraps(count)) {
      const length = count * 3
      if (Math.abs(pos) > 4 * length) {
        const shift = (Math.floor(pos / length) - 1) * length
        pos -= shift
        target -= shift
        if (drag) drag.t0 -= shift
      }
    }

    const base = root.getBoundingClientRect()
    const box = wrap.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const { h, faceWidth } = geom
    const safeH = h || 1
    const safeFace = faceWidth || 1
    const follow = 1 - Math.exp(-16 * dt)
    pointer.cx += (pointer.x - pointer.cx) * follow
    pointer.cy += (pointer.y - pointer.cy) * follow

    const onCover = h > 0 && Math.abs(pointer.x - cx) < 0.55 * faceWidth && Math.abs(pointer.y - cy) < 0.55 * h && Math.abs(target - pos) < 0.3
    const goalY = onCover ? (pointer.x - cx) / (0.55 * safeFace) * 9 : (pointer.x - cx) / (innerWidth || 1) * 5
    const goalX = onCover ? -(pointer.y - cy) / (safeH / 2) * 6 : 0
    const ease = 1 - Math.exp(-7 * dt)
    tiltY += (goalY - tiltY) * ease
    tiltX += (goalX - tiltX) * ease

    const liftEase = reducedMotion ? 1 : 1 - Math.exp(-12 * dt)
    const limit = innerWidth / 2 + 1.5 * faceWidth
    let hoverSpine = false
    tapes.forEach((t, v) => {
      const r = relativePosition(v, pos, count)
      const x = slotOffset(r, geom)
      const visible = Math.abs(x) <= limit
      if (visible !== t.visible) {
        t.el.style.visibility = visible ? '' : 'hidden'
        t.visible = visible
      }
      if (!visible) return
      const lifted = hover === v && Math.abs(r) > 0.5 ? 1 : 0
      if (lifted) hoverSpine = true
      t.lift += (lifted - t.lift) * liftEase
      const o = faceOut(r)
      const y = -o * 0.025 * h - t.lift * 0.045 * h
      t.el.style.transform = `translate3d(${x}px,${y}px,${o * 0.2 * h}px) rotateZ(${TILT_DEG * o}deg) rotateX(${tiltX * o}deg) rotateY(${-90 * o + tiltY * o}deg)`
      t.el.style.zIndex = String(Math.round(100 - Math.abs(r) * 4))
      t.spine.style.setProperty('--shade', (o * 0.55).toFixed(3))
      t.cover.style.setProperty('--shade', ((1 - o) * 0.5).toFixed(3))
    })

    const settled = faceOut(Math.min(1, Math.abs(target - pos) * 3))
    openButton.style.left = `${cx - base.left - 0.5 * faceWidth - 6}px`
    openButton.style.top = `${cy - base.top + 0.36 * h}px`
    openButton.style.transform = `scale(${settled})`
    openButton.style.pointerEvents = settled < 0.5 ? 'none' : ''

    if (cursor) {
      cursor.style.transform = `translate3d(${pointer.cx}px,${pointer.cy}px,0)`
      cursor.dataset.state = overButton ? 'button' : onCover ? 'open' : hoverSpine ? 'spine' : ''
    }
    if (!destroyed && root.isConnected) raf = requestAnimationFrame(tick)
  }

  function onPointerMove(e) {
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (!drag) return
    const dx = e.clientX - drag.x0
    if (!drag.moved && Math.abs(dx) > 5) drag.moved = true
    if (drag.moved) setTarget(drag.t0 - dx / stride())
  }

  function onPointerUp() {
    if (!drag) return
    if (drag.moved) {
      setTarget(Math.round(target))
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 60)
    }
    drag = null
  }

  function onResize() {
    geom = measure()
  }

  wrap.addEventListener('pointerdown', e => {
    if (e.button > 0) return
    drag = { x0: e.clientX, t0: target, moved: false }
  })
  wrap.addEventListener('click', e => {
    if (!suppressClick) return
    e.stopPropagation()
    suppressClick = false
  }, true)
  root.addEventListener('wheel', e => {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    setTarget(target + delta * unit / stride() * 0.5)
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => setTarget(Math.round(target)), 160)
  }, { passive: false })
  root.addEventListener('pointerover', e => {
    overButton = !!e.target.closest?.('button, a')
    const tape = e.target.closest?.('.tape')
    hover = tape ? tapes.findIndex(t => t.el === tape) : -1
  })
  stage.addEventListener('pointerleave', () => { hover = -1 })
  stage.addEventListener('click', e => {
    const tape = e.target.closest('.tape')
    if (!tape) return
    const r = relativePosition(tapes.findIndex(t => t.el === tape), pos, count)
    if (Math.abs(r) < 0.5) open()
    else setTarget(Math.round(target + r))
  })
  // A mouse click releases button focus so Enter goes on to open the centred item
  root.addEventListener('click', e => {
    const button = e.target.closest('[data-shelf-step], [data-shelf-open]')
    if (!button) return
    if (e.detail > 0) button.blur()
    if (button.dataset.shelfStep) step(Number(button.dataset.shelfStep))
    else open()
  })
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', onResize)

  items.forEach(book => {
    resolveCover(book).then(url => {
      if (!url || destroyed) return
      tapes.forEach(t => {
        if (t.el.dataset.id !== String(book.id)) return
        t.cover.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`
        t.cover.classList.add('has-image')
      })
    })
  })

  tick(performance.now())

  return {
    step,
    goTo,
    open,
    centreRect,
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      clearTimeout(wheelTimer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', onResize)
    },
  }
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/shelf.test.js`, then `npx vitest run`. Output must be pristine (no NaN warnings, no unhandled rejections).

- [ ] **Step 5: Commit**

```bash
git add src/shelf.js src/shelf.test.js
git commit -m "Render the shelf view and drive its carousel"
```

---

### Task 9: Show the shelf by default

Wire the shelf into `main.js`: it becomes the default view, gets a Shelf button, renders through `renderResults`, mounts after each render, and hides the toolbar and status bar. The test harness switches to Covers by default so existing wall tests keep testing the wall.

**Files:**
- Modify: `src/main.js`
- Modify: `src/main.test.js` — `loadApp` helper; `renders embedded books read-only when the API is unavailable`; new `shelf view` describe

- [ ] **Step 1: Change the harness and write the failing tests.**

  In `loadApp` (top of `src/main.test.js`), change the signature and add the view switch at the very end:

```js
async function loadApp(books = BOOKS, { session, settings, view = 'covers' } = {}) {
```

```js
  // Flush happy-dom's queued hashchange task from the hash reset above
  await new Promise(r => setTimeout(r, 0))
  // Most suites exercise the cover wall; shelf suites ask for { view: 'shelf' }
  if (view !== 'shelf') document.querySelector(`[data-view="${view}"]`).click()
}
```

  In `renders embedded books read-only when the API is unavailable`, after the `await vi.waitFor(…)` block and before the expectations, add:

```js
    document.querySelector('[data-view="covers"]').click()
```

  Add a new describe after `shelf media`:

```js
describe('shelf view', () => {
  const READING_BOOKS = BOOKS.map(b => ({ ...b, tags: b.id === 's1-flow' ? ['psychology', 'currently-reading'] : [...b.tags] }))
  const caption = () => document.querySelector('.shelf-caption-title')?.textContent

  it('lands on the shelf by default, without the toolbar or status bar', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    expect(document.querySelector('.shelf-view')).not.toBeNull()
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
    expect(document.querySelector('.toolbar')).toBeNull()
    expect(document.querySelector('.status-bar')).toBeNull()
  })

  it('shows the showcase groups in the rail', async () => {
    await loadApp(READING_BOOKS, { view: 'shelf' })
    const tabs = [...document.querySelectorAll('[data-shelf-group]')].map(t => t.dataset.shelfGroup)
    expect(tabs).toEqual(['reading', 'favorites'])
    expect(caption()).toBe('Flow')
  })

  it('switches groups from the rail', async () => {
    await loadApp(READING_BOOKS, { view: 'shelf' })
    document.querySelector('[data-shelf-group="favorites"]').click()
    expect(caption()).toBe('Dune')
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
  })

  it('shows an empty shelf for an empty library', async () => {
    await loadApp([], { view: 'shelf' })
    expect(document.querySelector('.shelf-empty').textContent).toContain('Nothing on this shelf yet.')
  })

  it('keeps the shelf for a medium route, bypassing the landing config', async () => {
    await loadApp(MIXED, { view: 'shelf', settings: { landing: ['book'] } })
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    expect(document.querySelector('.shelf-view')).not.toBeNull()
    expect(caption()).toBe('Abbey Road')
  })

  it('an author route on the shelf switches to covers', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    window.location.hash = '#/author/herbert'
    window.dispatchEvent(new Event('hashchange'))
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('covers')
    expect(document.querySelector('.cover-title').textContent).toBe('Dune')
  })
})
```

  The existing `applies a route present at load time` (a cold load on `#/tags/design`) depends on the same rule: once the shelf is the default, it only stays green because that route switches to covers.

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/main.test.js` → the new `shelf view` tests FAIL (no `.shelf-view`), **except** `an author route on the shelf switches to covers`: it passes here because the app still defaults to covers, and it becomes a real check once Step 3 makes the shelf the default. Every older test must still pass: the app still defaults to covers here, so the helper's click on the existing Covers button changes nothing. If an older test fails, re-read Step 1.

- [ ] **Step 3: Implement in `main.js`.**

  Imports:

```js
import { showcaseGroups } from './showcase.js'
import { renderShelfView, mountShelf } from './shelf.js'
```

  State — change `view: 'covers'` to `view: 'shelf'` and add after it:

```js
  shelf: { group: '', index: 0 },
```

  After `getAllTags()` add the shelf helpers:

```js
function shelfGroups() {
  const medium = state.route?.kind === 'medium' ? state.route.slug : ''
  return showcaseGroups(state.books, { landing: state.settings.landing || [], medium })
}

function activeShelfGroup(groups = shelfGroups()) {
  return groups.find(g => g.key === state.shelf.group) || groups[0] || null
}
```

  After `coverImgAttrs` add the cover resolver the shelf (and later the overlay) uses:

```js
// Walks the cover chain with real image loads and settles on the first that works.
// The generated placeholder is left out: the shelf and overlay draw their own.
const coverUrlCache = new Map()
function resolveCover(book) {
  if (!coverUrlCache.has(book.id)) {
    const candidates = coverCandidates(book).slice(0, -1)
    coverUrlCache.set(book.id, (async () => {
      for (const url of candidates) {
        const ok = await new Promise(resolve => {
          const img = new Image()
          img.onload = () => resolve(img.naturalWidth > 1)
          img.onerror = () => resolve(false)
          img.src = url
        })
        if (ok) return url
      }
      return null
    })())
  }
  return coverUrlCache.get(book.id)
}
```

  In `syncBookState`, at the top of the function body add `coverUrlCache.delete(updatedBook.id)` so an edited cover is re-resolved.

  The cover-picker grid handler (`[data-action="select-cover"]`, around line 1737) updates `state.books` and `state.selected` by hand instead of calling `syncBookState`, so it would bypass that cache reset. Replace its hand-written block — from `// Update local state - create new object…` through the closing `}` of `if (bookIndex !== -1) { … }` — with:

```js
          syncBookState(updatedBook)
```

  (`syncBookState` does exactly what that block did, plus the cache reset.)

  In `applyHash`, right after the `const resolved = resolveRoute(route, state.books)` line add:

```js
  // Any route but a medium filter shows results, which the shelf view doesn't
  if (route.kind !== 'medium' && state.view === 'shelf') state.view = 'covers'
```

  In `render()`:
  - Add a Shelf button first inside `.view-toggle`:

```js
          <button class="view-btn ${state.view === 'shelf' ? 'active' : ''}" data-action="view" data-view="shelf">Shelf</button>
```

  - Wrap the toolbar: `${state.view === 'shelf' ? '' : `<div class="toolbar">…</div>`}` (keep its contents unchanged).
  - Change `${renderStatusBar(filtered)}` to `${state.view === 'shelf' ? '' : renderStatusBar(filtered)}`.
  - Just before `document.querySelector('#app').innerHTML = …` add `document.body.classList.toggle('is-shelf', state.view === 'shelf')`.
  - After `attachEventListeners()` add `mountShelfIfShown()`.

  At the top of `renderResults`, before the empty-state check:

```js
  if (state.view === 'shelf') {
    const groups = shelfGroups()
    const group = activeShelfGroup(groups)
    return renderShelfView({
      groups,
      activeKey: group?.key,
      index: state.shelf.index,
      total: state.books.length,
      canAdd: !state.readOnly,
    })
  }
```

  In `updateResults`, after the `results.innerHTML = …` line add `mountShelfIfShown()`.

  After `updateResults` add the mount lifecycle:

```js
let shelfControl = null

function mountShelfIfShown() {
  shelfControl?.destroy()
  shelfControl = null
  const root = document.querySelector('.shelf-view:not(.shelf-empty)')
  if (!root) return
  const group = activeShelfGroup()
  const index = Math.min(state.shelf.index, group.items.length - 1)
  state.shelf = { group: group.key, index }
  shelfControl = mountShelf(root, {
    items: group.items,
    index,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    resolveCover,
    onIndexChange: i => { state.shelf = { group: group.key, index: i } },
    onOpen: (i, rect) => openBook(group.items[i].id, { source: 'shelf', from: rect ? { rect, rotate: -4.5 } : null }),
  })
}
```

  (`openBook` ignores its second argument until Task 14.)

  In `attachEventListeners`:
  - Add the rail listener:

```js
  // Shelf rail: switch showcase group. A mouse click releases focus so Enter opens the centred item.
  document.querySelectorAll('[data-shelf-group]').forEach(el => {
    el.addEventListener('click', e => {
      const key = el.dataset.shelfGroup
      state.shelf = { group: key, index: 0 }
      render()
      if (e.detail === 0) document.querySelector(`[data-shelf-group="${key}"]`)?.focus()
    })
  })
```

  - Make the Add Media listener cover both the avatar menu and the empty shelf: change `document.querySelector('[data-action="add-book"]')?.addEventListener('click', () => {` to `document.querySelectorAll('[data-action="add-book"]').forEach(el => el.addEventListener('click', () => {` and close it with `}))`.
  - In the media-tab listener, add `state.shelf.index = 0` as the first line of the click handler.

- [ ] **Step 4: Run and confirm pass** — `npx vitest run` → all pass, pristine.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/main.test.js
git commit -m "Open on the showcase shelf, with Covers and List a click away"
```

---

### Task 10: View-change rules

Implements the spec's "View-change rules" and "Search from the shelf".

**Files:**
- Modify: `src/main.js` — view toggle listener, search listener, `setTagRoute`, `applyHash`, home listener
- Modify: `src/main.test.js` — rewrite `clicking the Bookshelf masthead goes home`; add tests

- [ ] **Step 1: Write the failing tests.** Rewrite the approved test in `hash routes`:

```js
  it('clicking the masthead goes home to the shelf', async () => {
    await loadApp()
    goTo('#/author/herbert')
    const input = document.querySelector('[data-action="search"]')
    input.value = 'dune'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector('[data-action="home"]').click()

    expect(window.location.hash).toBe('')
    expect(document.querySelector('.view-btn.active').dataset.view).toBe('shelf')
    expect(document.querySelector('[data-action="search"]').value).toBe('')
  })
```

  Add to the `shelf view` describe:

```js
  const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  const activeView = () => document.querySelector('.view-btn.active').dataset.view
  it('typing a search on the shelf switches to covers and keeps typing in the search box', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    document.querySelector('[data-action="search"]').focus()
    typeInSearch('du')
    expect(activeView()).toBe('covers')
    expect(document.activeElement.dataset.action).toBe('search')
    expect(document.activeElement.value).toBe('du')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
  })

  it('a number-key tag filter on the shelf switches to covers', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    press('1')
    expect(activeView()).toBe('covers')
    expect(document.querySelectorAll('.cover-tile').length).toBe(1)
  })

  it('switching to the shelf clears the search and tag but keeps the medium', async () => {
    await loadApp(MIXED)
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    const input = document.querySelector('[data-action="search"]')
    input.value = 'abbey'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector('[data-view="shelf"]').click()

    expect(document.querySelector('[data-action="search"]').value).toBe('')
    expect(window.location.hash).toBe('#/medium/album')
    expect(caption()).toBe('Abbey Road')
  })

  it('clearing the search keeps you in covers', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    document.querySelector('[data-action="search"]').focus()
    typeInSearch('du')
    document.querySelector('[data-action="clear-search"]').click()
    expect(activeView()).toBe('covers')
  })

  it('Escape on the shelf clears a medium route and stays on the shelf', async () => {
    await loadApp(MIXED, { view: 'shelf' })
    document.querySelector('.media-tab[data-medium="album"]').click()
    window.dispatchEvent(new Event('hashchange'))
    press('Escape')
    expect(window.location.hash).toBe('')
    expect(activeView()).toBe('shelf')
  })
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/main.test.js -t "shelf view"` and `-t "masthead goes home"` → the new tests FAIL, **except** `Escape on the shelf clears a medium route and stays on the shelf`, which is a guard: today's Escape handling already does this, and the test keeps it that way.

- [ ] **Step 3: Implement in `main.js`.**

  After `resetFilters` add:

```js
const VIEWS = ['shelf', 'covers', 'list']

// The shelf only ever carries a medium filter; entering it drops search, tag and other routes
function clearFiltersForShelf() {
  state.q = ''
  state.tag = ''
  state.selectedIndex = -1
  if (state.route?.kind !== 'medium') state.route = null
  if (parseRoute(location.hash)?.kind !== 'medium') clearHash()
}

function switchView(view) {
  if (view === 'shelf' && state.view !== 'shelf') clearFiltersForShelf()
  state.view = view
  render()
}

function leaveShelfKeepingSearchFocus(input) {
  const caret = input.selectionStart
  state.view = 'covers'
  render()
  const next = document.querySelector('[data-action="search"]')
  next?.focus()
  next?.setSelectionRange(caret, caret)
}
```

  View toggle listener body becomes `switchView(btn.dataset.view)`.

  Search input listener becomes:

```js
  document.querySelector('[data-action="search"]')?.addEventListener('input', e => {
    state.q = e.target.value
    state.selectedIndex = -1
    if (state.view === 'shelf') {
      leaveShelfKeepingSearchFocus(e.target)
      return
    }
    updateResults()
  })
```

  In `setTagRoute`, in the `if (tag) {` branch, add before `render()`: `if (state.view === 'shelf') state.view = 'covers'`.

  Home listener body becomes:

```js
    state.drawerOpen = false
    state.selected = null
    state.view = 'shelf'
    resetFilters()
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run` → all pass, pristine.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/main.test.js
git commit -m "Move between the shelf and results views by the spec's rules"
```

---

### Task 11: Keys on the shelf

**Files:**
- Modify: `src/main.js` — `onKeydown`, `renderHelpOverlay`
- Modify: `src/main.test.js` — tests in `shelf view`

- [ ] **Step 1: Write the failing tests** (in `shelf view`):

```js
  const TWO_READING = BOOKS.map(b => ({ ...b, tags: b.id === 's1-flow' || b.id === 's2-dune' ? [...b.tags, 'currently-reading'] : [...b.tags] }))

  it('left and right move the shelf, stopping at the ends of a short group', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    expect(caption()).toBe('Dune')
    press('ArrowRight')
    expect(caption()).toBe('Flow')
    press('ArrowRight')
    expect(caption()).toBe('Flow')
    press('ArrowLeft')
    expect(caption()).toBe('Dune')
  })

  it('Enter opens the centred item', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('ArrowRight')
    press('Enter')
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
  })

  it('Enter on a focused rail tab presses the tab instead of opening', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    document.querySelector('[data-shelf-group="favorites"]').focus()
    press('Enter')
    expect(document.querySelector('[data-field="title"]')).toBeNull()
  })

  it('v cycles shelf, covers and list', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    press('v')
    expect(activeView()).toBe('covers')
    press('v')
    expect(activeView()).toBe('list')
    press('v')
    expect(activeView()).toBe('shelf')
  })

  it('s, e, up and down do nothing on the shelf', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    for (const key of ['s', 'e', 'ArrowUp', 'ArrowDown']) press(key)
    expect(activeView()).toBe('shelf')
    expect(caption()).toBe('Dune')
    expect(document.querySelector('[data-field="title"]')).toBeNull()
    document.querySelector('[data-view="covers"]').click()
    expect(document.querySelector('.status-bar').textContent).toContain('TITLE ↑') // s did not cycle the sort
  })

  it('the help overlay describes the view cycle', async () => {
    await loadApp(BOOKS, { view: 'shelf' })
    press('?')
    expect(document.querySelector('.help-overlay').textContent).toContain('cycle Shelf / Covers / List')
  })
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/main.test.js -t "shelf view"` → the new tests FAIL, **except** `Enter on a focused rail tab presses the tab instead of opening`, a guard that passes before and after (it pins down that the shelf's Enter handling yields to a focused button).

- [ ] **Step 3: Implement.** In `onKeydown`, after the `if (state.drawerOpen) { … }` block and before `const cols = …`, add:

```js
  if (state.view === 'shelf') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      shelfControl?.step(e.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (e.key === 'Enter') {
      // A focused button handles its own Enter
      if (!document.activeElement?.closest?.('button, a')) shelfControl?.open()
      return
    }
    if (['ArrowUp', 'ArrowDown', 's', 'e'].includes(e.key)) return
  }
```

  Replace the `v` handler body with:

```js
    switchView(VIEWS[(VIEWS.indexOf(state.view) + 1) % VIEWS.length])
    return
```

  In `renderHelpOverlay` rows, change `['← → ↑ ↓', 'navigate the wall or list']` to `['← → ↑ ↓', 'navigate the wall or list; ← → move the shelf']` and `['v', 'toggle Covers / List']` to `['v', 'cycle Shelf / Covers / List']`.

- [ ] **Step 4: Run and confirm pass** — `npx vitest run` → all pass, pristine. `v toggles view and s cycles sort at default direction` still passes (from covers, `v` goes to list).

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/main.test.js
git commit -m "Drive the shelf from the keyboard and cycle all three views with v"
```

---

### Task 12: Shelf styles

Port the prototype's shelf CSS (`.superpowers/prototype/shelf.html`) under the module's class names.

**Files:**
- Modify: `src/style.css` — add a `Shelf view` section after `Status bar`

- [ ] **Step 1: Add the section:**

```css
/* ---------- Shelf view ---------- */

body.is-shelf { overflow: hidden; }

.shelf-view {
  --shelf-h: min(46vh, 31vw);
  position: fixed;
  inset: 0;
  z-index: 10;
  user-select: none;
  -webkit-user-select: none;
}

.shelf-rail {
  position: absolute;
  left: 50%;
  top: calc(50% - var(--shelf-h) / 2 - 86px);
  transform: translateX(-50%);
  display: flex;
  z-index: 3;
}

.shelf-tab {
  height: 23px;
  padding: 0 11px;
  margin-left: -1px;
  border: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .45s var(--ease), color .45s var(--ease);
}

.shelf-tab:first-child { margin-left: 0; }

.shelf-tab.active {
  position: relative;
  z-index: 1;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--sheet);
}

.shelf-tab-count {
  margin-left: 4px;
  font-weight: 500;
  opacity: 0.6;
}

.shelf-stage-wrap {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(50% - var(--shelf-h) / 2 - 40px);
  height: calc(var(--shelf-h) + 80px);
  perspective: 2200px;
  touch-action: pan-y;
  z-index: 1;
}

.shelf-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}

.tape {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
  will-change: transform;
}

.tape-face {
  position: absolute;
  top: calc(var(--h) / -2);
  height: var(--h);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: var(--radius);
  overflow: hidden;
}

.tape-face::after {
  content: "";
  position: absolute;
  inset: 0;
  background: #000;
  opacity: var(--shade, 0);
  pointer-events: none;
}

.tape-spine {
  width: var(--ws);
  left: calc(var(--ws) / -2);
  transform: translateZ(calc(var(--d) / 2));
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(var(--ws) * .22) 0 calc(var(--ws) * .2);
  background: var(--bg);
  color: var(--fg);
  background-image:
    linear-gradient(90deg, rgba(0,0,0,.22), rgba(255,255,255,.06) 18%, rgba(0,0,0,0) 50%, rgba(0,0,0,.08) 82%, rgba(0,0,0,.28)),
    linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,0) 12%, rgba(0,0,0,0) 88%, rgba(0,0,0,.14));
}

.tape-spine::before {
  content: "";
  width: 46%;
  height: 1px;
  margin-bottom: calc(var(--ws) * .18);
  background: currentColor;
  opacity: 0.45;
}

.tape-spine-title {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  font-family: var(--display);
  font-size: min(calc(var(--ws) * .42), calc(var(--h) * .6 / var(--len)));
  line-height: 1;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  writing-mode: vertical-rl;
  white-space: nowrap;
  overflow: hidden;
}

.tape-spine-creator {
  margin-top: calc(var(--ws) * .2);
  max-height: calc(var(--h) * .22);
  overflow: hidden;
  font-family: var(--sans);
  font-weight: 600;
  font-size: calc(var(--ws) * .13);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  writing-mode: vertical-rl;
  white-space: nowrap;
  opacity: 0.85;
}

.tape-cover {
  width: var(--d);
  left: calc(var(--d) / -2);
  transform: rotateY(90deg) translateZ(calc(var(--ws) / 2));
  box-shadow: 0 30px 60px -28px rgba(20, 16, 10, .55);
  background-size: cover;
  background-position: center;
}

.tape-cover-type {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: calc(var(--d) * .1) calc(var(--d) * .09);
  background: var(--bg);
  color: var(--fg);
}

.tape-cover.has-image .tape-cover-type { display: none; }

.tape-cover-creator {
  font-family: var(--sans);
  font-weight: 600;
  font-size: calc(var(--d) * .034);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.tape-cover-title {
  margin: auto 0;
  font-family: var(--display);
  font-size: calc(var(--d) * .11);
  line-height: 1.02;
  text-transform: uppercase;
}

.tape-cover-year {
  font-family: var(--sans);
  font-weight: 500;
  font-size: calc(var(--d) * .036);
  letter-spacing: 0.14em;
}

.shelf-open {
  position: absolute;
  left: 0;
  top: 0;
  width: 42px;
  height: 42px;
  margin: -21px 0 0 -21px;
  display: grid;
  place-items: center;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: rgba(237, 235, 230, .75);
  color: var(--accent);
  transform: scale(0);
  cursor: pointer;
  z-index: 4;
}

.shelf-open svg { margin-left: 2px; }

.shelf-caption {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(50% + var(--shelf-h) / 2 + 30px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  text-align: center;
  pointer-events: none;
  z-index: 2;
}

.shelf-caption-title {
  font-family: var(--display);
  font-size: 31px;
  line-height: 1.12;
  letter-spacing: -0.01em;
}

.shelf-caption-line {
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--accent);
}

.shelf-caption-stars {
  font-size: 12px;
  letter-spacing: 0.12em;
}

.shelf-arrow {
  position: absolute;
  top: calc(50% + var(--shelf-h) / 2 + 40px);
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: none;
  border: 0;
  color: var(--ink);
  cursor: pointer;
  z-index: 3;
}

.shelf-prev { left: 20px; }
.shelf-next { right: 20px; }

.shelf-foot {
  position: absolute;
  left: 32px;
  bottom: 26px;
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  z-index: 3;
}

.shelf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.shelf-empty-text {
  font-family: var(--display);
  font-size: 24px;
}

.shelf-cursor {
  position: fixed;
  left: 0;
  top: 0;
  width: 58px;
  height: 58px;
  margin: -29px 0 0 -29px;
  display: none;
  pointer-events: none;
  z-index: 100;
}

/* Custom cursor only over the shelf, only with a precise pointer; the header keeps the system cursor */
@media (pointer: fine) {
  .shelf-view, .shelf-view * { cursor: none; }
  .shelf-cursor { display: block; }
}

.shelf-cursor-ring {
  position: absolute;
  inset: 0;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  transition: transform .5s var(--ease), background-color .4s var(--ease), border-color .4s var(--ease);
}

.shelf-cursor-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: var(--ink);
  transition: transform .4s var(--ease);
}

.shelf-cursor-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sheet);
  transform: scale(0);
  transition: transform .45s var(--ease);
}

.shelf-cursor[data-state="spine"] .shelf-cursor-ring { transform: scale(.72); }
.shelf-cursor[data-state="button"] .shelf-cursor-ring { transform: scale(.55); }
.shelf-cursor[data-state="button"] .shelf-cursor-dot { transform: scale(0); }
.shelf-cursor[data-state="open"] .shelf-cursor-ring { transform: scale(1.75); background: var(--accent); border-color: var(--accent); }
.shelf-cursor[data-state="open"] .shelf-cursor-dot { transform: scale(0); }
.shelf-cursor[data-state="open"] .shelf-cursor-label { transform: scale(1); }

@media (max-width: 767px) {
  .shelf-view { --shelf-h: min(60vw, 40svh); }
  .shelf-rail { top: calc(50% - var(--shelf-h) / 2 - 70px); }
  .shelf-tab { padding: 0 6px; }
  .shelf-caption-title { font-size: 24px; }
  .shelf-prev { left: 6px; }
  .shelf-next { right: 6px; }
  .shelf-foot { left: 16px; bottom: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .shelf-tab, .shelf-cursor-ring, .shelf-cursor-dot, .shelf-cursor-label { transition: none; }
}
```

- [ ] **Step 2: Run the suite** — `npx vitest run` → all pass.

- [ ] **Step 3: Look at it** with Jason's real library (dev server). Verify against the prototype: spines with titles fitting and surnames at the foot, centred face-out cover tilted, captions, rail switching, drag, wheel, arrows, hover lift, custom cursor (desktop only), the mobile preset, and reduced motion (macOS: System Settings → Accessibility → Display → Reduce motion — or emulate in the browser devtools). Check that the header stays above the shelf and the rail doesn't collide with the masthead at 1440×900 and 1280×720. Screenshot each.

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "Style the showcase shelf: cloth spines, tilted cover, caption, cursor"
```

**Milestone B done:** the shelf is the front door; the drawer still opens items. Show Jason.

---

# Milestone C — The detail overlay (spec steps 5–6)

### Task 13: `overlay.js` — overlay markup and geometry

**Files:**
- Create: `src/overlay.js`, `src/overlay.test.js`

- [ ] **Step 1: Write the failing tests** — `src/overlay.test.js`:

```js
// ABOUTME: Tests for the detail overlay's markup (parity with the drawer it replaces) and geometry.
// ABOUTME: Signed-in and signed-out renders are checked separately against the spec's checklist.

import { describe, it, expect } from 'vitest'
import { renderDetail, insetFrom } from './overlay.js'

const MEDIA = [
  { key: 'book', label: 'Books', creator: 'Author' },
  { key: 'album', label: 'Albums', creator: 'Artist' },
]
const DUNE = { id: 's2-dune', title: 'Dune', author: 'Frank Herbert', tags: ['sci-fi'], isbn: '9780441172719', rating: 4.5, notes: 'Spice.', dateRead: '2025-06-01', pages: 412, year: 1965, medium: 'book' }
const LINKS = [['Bookshop.org', 'https://bookshop.org/x'], ['Amazon', 'https://amazon.com/x'], ['Open Library', 'https://openlibrary.org/x']]

function show(book, opts = {}) {
  document.body.innerHTML = renderDetail(book, { readOnly: false, savingCover: false, media: MEDIA, links: LINKS, canPrev: true, canNext: true, settled: true, ...opts })
}
const $ = sel => document.querySelector(sel)

describe('renderDetail — always shown', () => {
  it('labels the medium and shows title, creator, notes, metadata and links', () => {
    show(DUNE)
    expect($('.detail-kicker').textContent).toBe('Book')
    expect($('[data-field="title"]').value).toBe('Dune')
    expect($('[data-field="author"]').value).toBe('Frank Herbert')
    expect($('[data-action="notes"]').value).toBe('Spice.')
    expect($('.detail-meta').textContent).toContain('1965')
    expect($('.detail-meta').textContent).toContain('412 pages')
    expect($('.detail-meta').textContent).toContain('read 2025-06-01')
    expect([...document.querySelectorAll('.detail-links a')].map(a => a.textContent)).toEqual(['Bookshop.org', 'Amazon', 'Open Library'])
  })

  it('shows the star display with halves and the numeric rating', () => {
    show(DUNE, { readOnly: true })
    expect(document.querySelectorAll('.star-display.filled')).toHaveLength(4)
    expect(document.querySelectorAll('.star-display.half-filled')).toHaveLength(1)
    expect($('.rating-value').textContent).toBe('4.5')
  })

  it('links to more by the author only when there is one', () => {
    show(DUNE, { readOnly: true })
    expect($('[data-action="author-route"]')).not.toBeNull()
    show({ ...DUNE, author: null })
    expect($('[data-action="author-route"]')).toBeNull()
  })

  it('reflects whether it can step to a previous or next item', () => {
    show(DUNE, { canPrev: false, canNext: true })
    expect($('[data-action="detail-prev"]').disabled).toBe(true)
    expect($('[data-action="detail-next"]').disabled).toBe(false)
  })

  it('keeps quoted and markup data intact in fields', () => {
    show({ ...DUNE, title: '<img src=x> & "Friends"', author: '<b>x</b>' })
    expect($('[data-field="title"]').value).toBe('<img src=x> & "Friends"')
    expect($('[data-field="author"]').value).toBe('<b>x</b>')
    expect($('.detail img')).toBeNull()
  })
})

describe('renderDetail — signed in', () => {
  it('offers medium, tags and ISBN inputs', () => {
    show(DUNE)
    expect($('[data-field="medium"]').value).toBe('book')
    expect($('[data-field="tags"]').value).toBe('sci-fi')
    expect($('[data-field="isbn"]').value).toBe('9780441172719')
  })

  it('offers rating targets, Clear, Change Cover and Remove Book', () => {
    show(DUNE)
    expect(document.querySelectorAll('[data-action="set-rating"]')).toHaveLength(10)
    expect($('[data-action="clear-rating"]')).not.toBeNull()
    expect($('[data-action="open-cover-picker"]').textContent.trim()).toBe('Change Cover')
    expect($('[data-action="delete-book"]')).not.toBeNull()
  })

  it('disables Change Cover with a spinner while a cover saves', () => {
    show(DUNE, { savingCover: true })
    expect($('[data-action="open-cover-picker"]').disabled).toBe(true)
    expect($('[data-action="open-cover-picker"] .loading')).not.toBeNull()
  })

  it('leaves the metadata line without the ISBN', () => {
    show(DUNE)
    expect($('.detail-meta').textContent).not.toContain('ISBN')
  })
})

describe('renderDetail — signed out', () => {
  it('makes title, creator and notes read-only and shows tags as chips', () => {
    show(DUNE, { readOnly: true })
    expect($('[data-field="title"]').hasAttribute('readonly')).toBe(true)
    expect($('[data-field="author"]').hasAttribute('readonly')).toBe(true)
    expect($('[data-action="notes"]').hasAttribute('readonly')).toBe(true)
    expect([...document.querySelectorAll('.detail-tag')].map(t => t.textContent)).toEqual(['sci-fi'])
  })

  it('drops every editing control and moves the ISBN into the metadata line', () => {
    show(DUNE, { readOnly: true })
    for (const sel of ['[data-field="medium"]', '[data-field="tags"]', '[data-field="isbn"]', '[data-action="set-rating"]', '[data-action="clear-rating"]', '[data-action="open-cover-picker"]', '[data-action="delete-book"]']) {
      expect($(sel)).toBeNull()
    }
    expect($('.detail-meta').textContent).toContain('ISBN 9780441172719')
  })
})

describe('insetFrom', () => {
  const viewport = { width: 1000, height: 800 }

  it('frames an unrotated rect exactly', () => {
    const { clip, origin } = insetFrom({ left: 100, top: 50, width: 200, height: 300 }, 0, viewport)
    expect(clip).toBe('inset(50px 700px 450px 100px round 3px)')
    expect(origin).toBe('200px 200px')
  })

  it('recovers the size of a rect drawn rotated, from its bounding box', () => {
    const a = 4.5 * Math.PI / 180
    const w = 100, h = 150
    const box = { width: w * Math.cos(a) + h * Math.sin(a), height: h * Math.cos(a) + w * Math.sin(a) }
    const rect = { left: 500 - box.width / 2, top: 400 - box.height / 2, ...box }
    const [top, right, bottom, left] = insetFrom(rect, -4.5, viewport).clip.match(/[\d.]+px/g).map(parseFloat)
    expect(viewport.width - left - right).toBeCloseTo(w)
    expect(viewport.height - top - bottom).toBeCloseTo(h)
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/overlay.test.js` → FAIL.

- [ ] **Step 3: Create `src/overlay.js`:**

```js
// ABOUTME: The detail overlay: one item's fields, rating, notes, links and actions on a full-viewport sheet.
// ABOUTME: Markup plus entrance/exit motion and the cover's ink reveal; editing wiring stays in main.js.

import { esc } from './html.js'
import { spinePalette, spineTitle } from './spines.js'

const STARS = [1, 2, 3, 4, 5]
const INK_BLOBS = [[190, 330, 0], [430, 600, 120], [316, 120, 220], [114, 760, 300], [506, 250, 360], [329, 860, 420], [291, 470, 180]]
const canAnimate = el => typeof el.animate === 'function'

function wrapWords(text, max) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > max && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 4)
}

function starsHtml(rating, readOnly) {
  const stars = STARS.map(star => {
    const fill = rating >= star ? 'filled' : rating >= star - 0.5 ? 'half-filled' : ''
    return `
      <span class="star-wrapper">
        <span class="star-display ${fill}">★</span>
        ${readOnly ? '' : `
        <button class="star-hit star-hit-left" data-action="set-rating" data-rating="${star - 0.5}" title="${star - 0.5} stars"></button>
        <button class="star-hit star-hit-right" data-action="set-rating" data-rating="${star}" title="${star} stars"></button>`}
      </span>`
  }).join('')
  return `
    <div class="detail-rating">
      ${stars}
      ${rating > 0 && !readOnly ? '<button class="star-clear" data-action="clear-rating">Clear</button>' : ''}
      ${rating > 0 ? `<span class="rating-value">${esc(rating)}</span>` : ''}
    </div>`
}

function posterHtml(book, settled) {
  const { bg, fg } = spinePalette(book.id)
  const lines = wrapWords(spineTitle(book.title).toUpperCase(), 13)
  const size = lines.some(l => l.length > 10) ? 52 : 62
  const radius = settled ? 900 : 0
  const tspans = lines.map((l, k) =>
    `<tspan x="300" y="${(450 - (lines.length - 1) * size * 0.55 + k * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`
  ).join('')
  return `
    <div class="detail-poster">
      <svg viewBox="0 0 600 900" aria-hidden="true">
        <defs>
          <filter id="detail-ink-filter" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1000" height="1300">
            <feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="3" seed="7" result="t"/>
            <feDisplacementMap in="SourceGraphic" in2="t" scale="120" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <mask id="detail-ink" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1000" height="1300">
            <g filter="url(#detail-ink-filter)" fill="#fff">
              ${INK_BLOBS.map(([cx, cy, delay]) => `<circle class="detail-ink-blob" cx="${cx}" cy="${cy}" r="${radius}" data-delay="${delay}"/>`).join('')}
            </g>
          </mask>
          <clipPath id="detail-clip"><rect width="600" height="900" rx="4"/></clipPath>
        </defs>
        <g clip-path="url(#detail-clip)"><g mask="url(#detail-ink)">
          <rect width="600" height="900" fill="${bg}"/>
          <text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="${fg}">${esc((book.author || '').toUpperCase())}</text>
          <text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${size}" fill="${fg}">${tspans}</text>
          <text x="300" y="830" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="${fg}">${esc(book.year || '')}</text>
          <image class="detail-cover-image" width="600" height="900" preserveAspectRatio="xMidYMid slice"/>
        </g></g>
      </svg>
    </div>`
}

export function renderDetail(book, { readOnly, savingCover, media, links, canPrev, canNext, settled }) {
  const medium = book.medium || 'book'
  const info = media.find(m => m.key === medium) || { label: `${medium}s`, creator: 'Author' }
  const rating = book.rating || 0
  const tags = book.tags || []
  const locked = readOnly ? 'readonly' : ''
  const titleRows = Math.min(4, Math.max(1, Math.ceil(String(book.title || '').length / 18)))
  const meta = [
    book.year ? esc(book.year) : null,
    book.pages ? `${esc(book.pages)} pages` : null,
    book.dateRead ? `read ${esc(book.dateRead)}` : null,
    readOnly && book.isbn ? `ISBN ${esc(book.isbn)}` : null,
  ].filter(Boolean).join(' &bull; ') || '&nbsp;'

  return `
    <div class="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button class="btn detail-close" data-action="close-detail">Close</button>
      <div class="detail-step">
        <button class="btn" data-action="detail-prev" aria-label="Previous item" ${canPrev ? '' : 'disabled'}>&larr;</button>
        <button class="btn" data-action="detail-next" aria-label="Next item" ${canNext ? '' : 'disabled'}>&rarr;</button>
      </div>
      <div class="detail-text">
        <div class="dm"><span class="detail-kicker">${esc(info.label.slice(0, -1))}</span></div>
        <div class="dm"><textarea id="detail-title" class="detail-title" data-field="title" data-original="${esc(book.title)}" placeholder="Title" rows="${titleRows}" ${locked}>${esc(book.title)}</textarea></div>
        <div class="dm"><input class="detail-author" data-field="author" value="${esc(book.author)}" data-original="${esc(book.author)}" placeholder="${esc(info.creator)}" ${locked}></div>
        ${readOnly ? '' : `
        <div class="dm"><select class="detail-medium" data-field="medium" data-original="${esc(medium)}">
          ${media.map(m => `<option value="${m.key}" ${medium === m.key ? 'selected' : ''}>${esc(m.label.slice(0, -1))}</option>`).join('')}
        </select></div>`}
        ${book.author ? '<div class="dm"><button class="detail-author-link" data-action="author-route">More by this author &rarr;</button></div>' : ''}
        <div class="dm">${starsHtml(rating, readOnly)}</div>
        <div class="dm">${readOnly
          ? `<div class="detail-tags">${tags.map(t => `<span class="detail-tag">${esc(t)}</span>`).join('')}</div>`
          : `<input class="detail-tags-input" data-field="tags" value="${esc(tags.join(', '))}" data-original="${esc(tags.join(', '))}" placeholder="tags, comma, separated">`}</div>
        <div class="dm"><div class="detail-meta">${meta}</div></div>
        ${readOnly ? '' : `
        <div class="dm"><label class="detail-isbn-row"><span>ISBN</span><input class="detail-isbn" data-field="isbn" value="${esc(book.isbn)}" data-original="${esc(book.isbn)}" placeholder="—"></label></div>`}
        <div class="dm detail-notes">
          <label class="notes-label">Notes</label>
          <textarea class="notes-input" data-action="notes" placeholder="${readOnly ? '' : 'Add your notes...'}" ${locked}>${esc(book.notes)}</textarea>
        </div>
        <div class="dm"><div class="detail-links">${links.map(([label, href]) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(label)}</a>`).join('')}</div></div>
        ${readOnly ? '' : `
        <div class="dm detail-actions">
          <button class="btn" data-action="open-cover-picker" ${savingCover ? 'disabled' : ''}>${savingCover ? '<span class="loading"></span>' : 'Change Cover'}</button>
          <button class="btn btn-danger" data-action="delete-book">Remove Book</button>
        </div>`}
      </div>
      ${posterHtml(book, settled)}
    </div>`
}

// Inset clip-path framing a rect that was drawn rotated by `deg` about its centre,
// recovered from that rotated rect's axis-aligned bounding box
export function insetFrom(rect, deg, viewport) {
  const a = Math.abs(deg) * Math.PI / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const c2 = c * c - s * s
  let w = (rect.width * c - rect.height * s) / c2
  let h = (rect.height * c - rect.width * s) / c2
  if (!(w > 0) || !(h > 0)) {
    w = rect.width
    h = rect.height
  }
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return {
    clip: `inset(${cy - h / 2}px ${viewport.width - (cx + w / 2)}px ${viewport.height - (cy + h / 2)}px ${cx - w / 2}px round 3px)`,
    origin: `${cx}px ${cy}px`,
  }
}

function revealInk(el, delay) {
  const blobs = [...el.querySelectorAll('.detail-ink-blob')]
  const start = performance.now() + delay
  const frame = now => {
    const elapsed = now - start
    blobs.forEach(b => {
      const p = Math.min(1, Math.max(0, (elapsed - Number(b.dataset.delay)) / 1250))
      b.setAttribute('r', (900 * (1 - Math.pow(1 - p, 3))).toFixed(1))
    })
    if (elapsed < 2400 && el.isConnected) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// `from` is { rect, rotate } for the cover or tile it grows out of, or null to fade in.
// Reduced motion always gets the plain fade, with the cover already inked in.
export function playEntrance(el, from, { reducedMotion = false } = {}) {
  if (!canAnimate(el)) return
  if (reducedMotion) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    return
  }
  if (from) {
    const { clip, origin } = insetFrom(from.rect, from.rotate, { width: innerWidth, height: innerHeight })
    el.style.transformOrigin = origin
    el.animate([
      { clipPath: clip, transform: `rotate(${from.rotate}deg)` },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'rotate(0deg)' },
    ], { duration: 1050, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' })
  } else {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' })
  }
  el.querySelectorAll('.dm > *').forEach((child, k) => {
    child.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }],
      { duration: 900, delay: (from ? 620 : 120) + k * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' })
  })
  revealInk(el, from ? 520 : 0)
}

// Animates a detached copy back into `to` so app state can change immediately
export function playExit(el, to) {
  if (!canAnimate(el)) return
  const ghost = el.cloneNode(true)
  ghost.classList.add('detail-ghost')
  ghost.removeAttribute('id')
  document.body.append(ghost)
  let frames = [{ opacity: 1 }, { opacity: 0 }]
  if (to) {
    const { clip, origin } = insetFrom(to.rect, to.rotate, { width: innerWidth, height: innerHeight })
    ghost.style.transformOrigin = origin
    frames = [
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'rotate(0deg)' },
      { clipPath: clip, transform: `rotate(${to.rotate}deg)` },
    ]
  }
  const animation = ghost.animate(frames, { duration: to ? 850 : 200, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' })
  animation.onfinish = () => ghost.remove()
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/overlay.test.js`, then `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add src/overlay.js src/overlay.test.js
git commit -m "Render the detail overlay with full drawer parity"
```

---

### Task 14: Every view opens the overlay

Replace the drawer with the overlay in `main.js`. The drawer's render function stays (unreachable) until the Task 16 checkpoint passes.

**Files:**
- Modify: `src/main.js`
- Modify: `src/main.test.js` — approved selector rewrites; new tests

- [ ] **Step 1: Rewrite the approved tests and write the failing tests.**

  Approved rewrites (selector or name only — behaviour under test unchanged):

| Test (old name → new name where it mentions the drawer) | Change |
|---|---|
| `shows metadata instead of shelf in the drawer` → `shows metadata instead of shelf in the detail` | `.drawer-meta` → `.detail-meta` |
| `Escape reverts the field and keeps the drawer open` → `…keeps the detail open` | `.drawer-panel` → `.detail` |
| `opens the drawer for a single-title route` → `opens the detail for a single-title route` | `.drawer-title` → `.detail-title` |
| `opens a book from the cover wall with the Enter key` | `.drawer-title` → `.detail-title` |
| `arrows move the selection and Enter opens` | `.drawer-title` → `.detail-title` |
| `left/right walk prev/next while the drawer is open` → `…while the detail is open` | `.drawer-title` → `.detail-title` (both) |
| `Escape closes the drawer, then clears the search` → `Escape closes the detail, then clears the search` | `.drawer-panel` → `.detail` |
| `saves a changed field on blur via PUT without rebuilding the drawer` → `…without rebuilding the detail` | name only; comment `// drawer not re-rendered…` → `// detail not re-rendered…` |
| `shows editable fields prefilled in the drawer, with no edit modal path` → `…in the detail, with no edit modal path` | name only |
| `drawer metadata` (describe) → `detail metadata` | name only |

  Add to the `shelf view` describe:

```js
  it('steps through the shelf group from the detail and re-centres the shelf on close', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    expect(document.querySelector('[data-field="title"]').value).toBe('Dune')
    press('ArrowRight')
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
    press('ArrowRight')
    expect(document.querySelector('[data-field="title"]').value).toBe('Flow')
    press('Escape')
    expect(document.querySelector('.detail')).toBeNull()
    expect(caption()).toBe('Flow')
  })

  it('slash does nothing while the detail is open', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    press('/')
    expect(document.activeElement?.dataset.action).not.toBe('search')
    expect(activeView()).toBe('shelf')
  })

  it('re-centres on the next item after removing one opened from the shelf', async () => {
    await loadApp(TWO_READING, { view: 'shelf' })
    press('Enter')
    document.querySelector('[data-action="delete-book"]').click()
    document.querySelector('[data-action="confirm-ok"]').click()
    await vi.waitFor(() => {
      if (document.querySelector('.detail')) throw new Error('detail still open')
    })
    expect(caption()).toBe('Flow')
  })
```

  Add to the `inline editing` describe (it opens Dune from the cover wall):

```js
  it('sets the rating from a star in the detail', async () => {
    openDune()
    document.querySelector('[data-action="set-rating"][data-rating="4"]').click()
    await vi.waitFor(() => {
      if (!fetch.mock.calls.some(([, o]) => o?.method === 'PUT')) throw new Error('no PUT yet')
    })
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(JSON.parse(put[1].body).rating).toBe(4)
    await vi.waitFor(() => {
      if (document.querySelector('.detail .rating-value')?.textContent !== '4') throw new Error('rating not shown yet')
    })
  })
```

  The delete test needs the harness to answer `DELETE /api/books/:id`. In `loadApp`'s fetch stub, before the final `throw`, add:

```js
    if (idMatch && opts.method === 'DELETE') {
      return { ok: true, json: async () => ({ ok: true }) }
    }
```

  (Check `api.deleteBook` in `main.js` for the exact method and response it expects, and match it.)

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/main.test.js` → the selector rewrites and the new tests FAIL (no `.detail`). Expected to **pass** already: the name-only rewrites, `Escape closes the detail, then clears the search` (its `toBeNull` holds before the overlay exists, so it is a guard here), and `sets the rating from a star in the detail` up to its last assertion — it fails only on the `.detail .rating-value` wait.

- [ ] **Step 3: Implement in `main.js`.**

  Import:

```js
import { renderDetail, playEntrance, playExit } from './overlay.js'
```

  State: rename `drawerOpen: false` to `detailOpen: false` and add after `selected: null`:

```js
  detailSource: 'results',
  detailEntrance: null,
```

  Rename every remaining `state.drawerOpen` to `state.detailOpen` and `closeDrawer` to `closeDetail` (the function and its callers):

```bash
grep -n "drawerOpen\|closeDrawer" src/main.js
```

  Expected after renaming: no output.

  Add helpers after `openBook`:

```js
const canAnimate = () => typeof Element.prototype.animate === 'function'
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The list the detail steps through: the shelf group it was opened from, or the current results
function detailList() {
  if (state.detailSource === 'shelf') return activeShelfGroup()?.items || []
  return getFilteredSorted()
}

function stepDetail(delta) {
  const list = detailList()
  const i = list.findIndex(b => b.id === state.selected?.id)
  const next = list[i + delta]
  if (!next) return
  if (state.detailSource === 'shelf') state.shelf.index = i + delta
  else state.selectedIndex = i + delta
  openBook(next.id, { source: state.detailSource, entrance: false })
}

function detailOrigin(source, id) {
  if (source === 'shelf') {
    const rect = shelfControl?.centreRect()
    return rect ? { rect, rotate: -4.5 } : null
  }
  const tile = [...document.querySelectorAll('#results [data-id]')].find(el => el.dataset.id === id)
  return tile ? { rect: tile.getBoundingClientRect(), rotate: 0 } : null
}

function renderDetailOverlay(settled) {
  const b = state.selected
  if (!b) return ''
  const list = detailList()
  const i = list.findIndex(x => x.id === b.id)
  return renderDetail(b, {
    readOnly: state.readOnly,
    savingCover: state.savingCover,
    media: MEDIA,
    links: [['Bookshop.org', bookshopLink(b)], ['Amazon', amazonLink(b)], ['Open Library', openLibraryLink(b)]],
    canPrev: i > 0,
    canNext: i >= 0 && i < list.length - 1,
    settled,
  })
}

function afterDetailRender(entrance, animate) {
  const el = document.querySelector('.detail')
  const book = state.selected
  if (!el || !book) return
  resolveCover(book).then(url => {
    const img = document.querySelector('.detail-cover-image')
    if (url && img && state.selected?.id === book.id) img.setAttribute('href', url)
  })
  if (animate) playEntrance(el, entrance.from, { reducedMotion: prefersReducedMotion() })
  if (entrance) el.querySelector('.detail-close')?.focus({ preventScroll: true })
}
```

  `openBook` becomes:

```js
function openBook(id, { from = null, source = 'results', entrance = true } = {}) {
  const book = state.books.find(b => b.id === id)
  if (!book) return
  state.selected = book
  state.detailOpen = true
  state.detailSource = source
  state.detailEntrance = entrance ? { from } : null
  const target = bookHash(book)
  if (target && location.hash !== target) {
    history.replaceState(null, '', target)
  }
  render()
}
```

  `closeDetail` (renamed from `closeDrawer`) becomes:

```js
function closeDetail() {
  const el = document.querySelector('.detail')
  const source = state.detailSource
  const id = state.selected?.id
  state.detailOpen = false
  state.selected = null
  const route = parseRoute(location.hash)
  if (route && (route.kind === 'title' || route.kind === 'isbn')) clearHash()
  render()
  if (el && canAnimate() && !prefersReducedMotion()) playExit(el, detailOrigin(source, id))
}
```

  In `applyHash`'s `resolved.open` branch, set `state.detailSource = 'results'` and `state.detailEntrance = { from: null }` alongside `state.detailOpen`.

  In `render()`, at the top (after the `loading`/`error` early returns), add:

```js
  const entrance = state.detailOpen ? state.detailEntrance : null
  state.detailEntrance = null
  const animateEntrance = !!entrance && canAnimate()
  // The ink reveal starts from bare paper only when it will actually play
  const settledCover = !animateEntrance || prefersReducedMotion()
```

  Replace `${state.drawerOpen ? renderDrawer() : ''}` with `${state.detailOpen ? renderDetailOverlay(settledCover) : ''}`, and after `mountShelfIfShown()` add `if (state.detailOpen) afterDetailRender(entrance, animateEntrance)`.

  In `attachEventListeners`:
  - Replace the `close-drawer` listener with:

```js
  document.querySelector('[data-action="close-detail"]')?.addEventListener('click', closeDetail)
  document.querySelector('[data-action="detail-prev"]')?.addEventListener('click', () => stepDetail(-1))
  document.querySelector('[data-action="detail-next"]')?.addEventListener('click', () => stepDetail(1))
```

  - Field listeners: `.drawer-panel [data-field]` → `.detail [data-field]`.
  - Results click and keydown handlers pass the tile's rect: `openBook(el.dataset.id, { from: { rect: el.getBoundingClientRect(), rotate: 0 } })`.
  - Delete handler: before `state.books = state.books.filter(…)` add

```js
      const list = state.detailSource === 'shelf' ? detailList() : null
      const removedAt = list ? list.findIndex(b => b.id === book.id) : -1
```

    and after `state.selected = null` add

```js
      if (removedAt >= 0) state.shelf.index = removedAt < list.length - 1 ? removedAt : Math.max(0, removedAt - 1)
      // The removed item's own link would now resolve to nothing
      if (['title', 'isbn'].includes(parseRoute(location.hash)?.kind)) clearHash()
```

  - Reword the three comments that describe a drawer:
    - above `saveField`: `// Inline field save - commits one drawer field, leaving the drawer DOM alone` → `// Inline field save - commits one detail field, leaving the detail DOM alone`
    - the `// Close drawer` comment goes with the listener it labelled (replaced above by the close/step listeners — label them `// Close and step the detail`)
    - `// Author route from the drawer` → `// Author route from the detail`

  In `onKeydown`:
  - Move the `if (e.key === '/') { … }` block so it comes **after** the detail block (the detail block returns for every key, so `/` does nothing while it is open).
  - The detail block's arrow branch becomes `stepDetail(e.key === 'ArrowRight' ? 1 : -1); return`.
  - Both `.drawer-panel [data-field="title"]` selectors → `.detail [data-field="title"]`.
  - The covers-view Enter (`openBook(filtered[state.selectedIndex]?.id)`) passes the selected tile's rect: `const tile = document.querySelector('.kb-selected'); openBook(filtered[state.selectedIndex]?.id, { from: tile ? { rect: tile.getBoundingClientRect(), rotate: 0 } : null })`.

- [ ] **Step 4: Run and confirm pass** — `npx vitest run` → all pass, pristine. `sets a book hash when opening from the wall and clears it on close` passes unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/main.test.js
git commit -m "Open every item in the detail overlay instead of the drawer"
```

---

### Task 15: Overlay styles and motion check

**Files:**
- Modify: `src/style.css` — add a `Detail overlay` section after `Shelf view`; move the star rules

- [ ] **Step 1: Move the shared rules out of the Drawer section.** The overlay reuses some drawer classes, and Task 17 deletes that section. Cut these rules out of the `Drawer` section and paste them into the new section below:
  - every rule whose selector starts with `.star-`, and `.rating-value` — recolour filled and half-filled stars to `var(--accent)`, empty stars to `rgba(20, 20, 20, 0.25)`;
  - `.notes-label`, `.notes-input` and `.notes-input:focus` — change the focus background from `var(--highlight)` to `rgba(31, 63, 176, 0.06)`.

  - the indented `.star-wrapper { font-size: 1.7rem; }` inside the Drawer section's mobile media query — recreate it inside the new section's `@media (max-width: 767px)` block.

  Then confirm nothing the overlay renders is still styled only from the Drawer section:

```bash
grep -n "^\s*\.\(star-\|rating-value\|notes-\)" src/style.css
```

  Every match must sit below the `/* ---------- Detail overlay ---------- */` heading.

- [ ] **Step 2: Add the section:**

```css
/* ---------- Detail overlay ---------- */

.detail {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: minmax(0, 1fr);
  gap: 4vw;
  padding: 110px 6vw 56px 7vw;
  overflow: hidden;
  background: var(--sheet);
}

.detail-ghost { pointer-events: none; z-index: 61; }

.detail-close {
  position: absolute;
  left: 32px;
  top: 34px;
  z-index: 2;
}

.detail-step {
  position: absolute;
  right: 32px;
  top: 34px;
  z-index: 2;
  display: flex;
}

.detail-step .btn + .btn { margin-left: -1px; }

.detail-text {
  align-self: center;
  max-width: 560px;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dm { overflow: hidden; padding-bottom: .08em; }
.dm > * { display: block; }

.detail-kicker {
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--accent);
}

.detail-title,
.detail-author {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  resize: none;
  overflow: hidden;
}

.detail-title {
  font-family: var(--display);
  font-weight: 400;
  font-size: clamp(36px, 4.6vw, 76px);
  line-height: 1.02;
  letter-spacing: -0.025em;
}

.detail-author {
  font-family: var(--display);
  font-size: 20px;
}

.detail [data-field]:not([readonly]):hover,
.detail [data-field]:focus {
  background: rgba(31, 63, 176, 0.06);
  outline: none;
}

.detail-medium { width: auto; }

.detail-author-link {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--accent);
  cursor: pointer;
}

.detail-rating { display: flex !important; align-items: center; gap: 2px; }

.detail-tags { display: flex !important; flex-wrap: wrap; gap: 6px; }

.detail-tag {
  padding: 4px 8px;
  border: 1px solid rgba(20, 20, 20, 0.35);
  border-radius: var(--radius);
  font-family: var(--sans);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.detail-meta {
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
}

.detail-isbn-row {
  display: flex !important;
  align-items: center;
  gap: 8px;
  font-family: var(--sans);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.detail-isbn { font-family: var(--mono); }

.detail-notes .notes-input { width: 100%; min-height: 4.5em; }

.detail-links,
.detail-actions { display: flex !important; flex-wrap: wrap; gap: 0.5rem; }

.detail-links .btn {
  color: var(--accent);
  border-color: var(--accent);
  text-decoration: none;
}

.detail-poster {
  align-self: center;
  justify-self: center;
  height: min(100%, 78vh);
  aspect-ratio: 2 / 3;
}

.detail-poster svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

@media (max-width: 767px) {
  .detail {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    align-content: start;
    gap: 24px;
    padding: 84px 22px 40px;
    overflow-y: auto;
  }

  .detail-close { left: 16px; top: 24px; }
  .detail-step { right: 16px; top: 24px; }
  .detail-poster { order: -1; height: 46svh; }
  .detail-text { max-height: none; overflow: visible; }
  .detail-title { font-size: 40px; }
}
```

- [ ] **Step 3: Run the suite** — `npx vitest run` → all pass.

- [ ] **Step 4: Look at it** (dev server, real library). Verify, with screenshots:
  - From the shelf: Enter / click centred cover → the sheet grows out of the tilted cover, straightening; text rises; cover inks in. Esc → it folds back into the cover the shelf re-centred on.
  - From covers and list: grows from the clicked tile; closes back into it.
  - ←/→ and the step buttons move through the group (shelf) or results (covers/list) and stop at the ends.
  - Rating click, notes edit, field edit, Change Cover (spinner), Remove Book → none of them replay the entrance animation.
  - Signed-out (static build: `npm run build:quick`, open `dist/index.html`): read-only parity per the spec checklist.
  - Reduced motion: a 200ms plain fade in with the cover already showing (no grow, no text rise, no ink), and an instant close.
  - Mobile preset: poster on top, text scrolls.

- [ ] **Step 5: Commit**

```bash
git add src/style.css
git commit -m "Style the detail overlay and its ink-revealed cover"
```

---

### Task 16: CHECKPOINT — parity review with Jason

**Stop here.** Do not start Task 17 until Jason approves.

- [ ] **Step 1:** Run `npx vitest run` and paste the summary line.
- [ ] **Step 2:** Walk Jason through the spec's "Parity checklist" item by item in the running app (signed in and the static read-only build), with screenshots, and the deliberate removal (no backdrop-click close).
- [ ] **Step 3:** Record his decision. If he asks for changes, make them (TDD) before Task 17.

---

### Task 17: Remove the drawer

Only after Task 16 is approved.

**Files:**
- Modify: `src/main.js` — delete `renderDrawer`; rename `.drawer-close` → `.modal-close` in the five modals
- Modify: `src/style.css` — delete the `Drawer` and `Drawer medium select` sections; move the close-button rules to `Modals`

- [ ] **Step 1: Confirm nothing reaches the drawer:**

```bash
grep -n "renderDrawer\|drawer" src/main.js src/main.test.js
```

Expected: `renderDrawer`'s own definition, and `drawer-close` in the five modal templates (Add Media, Cover Picker, Settings, Log In, Import). Nothing else. If anything else appears, stop and investigate.

- [ ] **Step 2:** Delete the `renderDrawer` function from `main.js`.

- [ ] **Step 3:** In `main.js`, replace `class="drawer-close"` with `class="modal-close"` in all five modal templates.

- [ ] **Step 4:** In `style.css`, copy the `.drawer-close` rules (including the one inside the mobile media query) into the `Modals` section renamed to `.modal-close`, then delete the whole `Drawer` section and the `Drawer medium select` section.

- [ ] **Step 5: Confirm it's all gone:**

```bash
grep -n "drawer" src/main.js src/style.css src/main.test.js
```

Expected: no output.

- [ ] **Step 6: Run and look** — `npx vitest run` → all pass, pristine. Open each modal and confirm its close button still looks right and works.

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/style.css
git commit -m "Remove the drawer now that the detail overlay replaces it"
```

---

### Task 18: README matches the app

**Files:**
- Modify: `README.md` — the tagline and the first description paragraph

- [ ] **Step 1:** Replace the tagline `**Your books, audiobooks, movies, podcasts, and albums — on one brutalist wall.**` and the paragraph beginning `Shelf is a self-hosted media library with a print-zine soul…` with a draft like:

```markdown
**Your books, audiobooks, movies, podcasts, and albums — on one well-kept shelf.**

Shelf is a self-hosted media library dressed like a bookcase: warm paper, cloth spines, serif type, one cobalt accent. It opens on a 3D showcase of what you're reading, your favorites, and what you just finished; the whole library is a click away as a cover wall or a list. It runs three ways from one codebase — a local app backed by a plain SQLite file, a free hosted deployment anyone can launch in minutes, or a single portable HTML file you can open from a thumb drive.
```

  Keep the rest of that paragraph's facts (the three ways it runs) intact.

- [ ] **Step 2: Fix the other stale lines:**
  - Features list: `click any field in an item's drawer and it autosaves…` → `click any field in an item's detail view and it autosaves…`
  - Keyboard table: `| \`v\` | Toggle Covers / List |` → `| \`v\` | Cycle Shelf / Covers / List |`; add `← →` moving the shelf if the table lists arrow keys.
  - Design note (`The design is deliberate brutalism: …`): draft a replacement in the same spirit for the paper gallery.

  Then confirm nothing stale is left:

```bash
grep -n "brutal\|drawer\|Toggle Covers\|zine\|red accent" README.md
```

  Expected: no output. **Ask Jason to approve all the wording** before committing — it's his voice.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Describe the paper gallery shelf in the README"
```

---

## Final verification

- [ ] `npx vitest run` → all pass, pristine. Report the counts.
- [ ] `npm run build:quick` → succeeds; open `dist/index.html` and confirm the read-only shelf and overlay work from the single file.
- [ ] Hand back to Jason with: what changed, screenshots (shelf, overlay, covers, list, one modal, mobile), anything not verified, and the branch name. Merging or opening a PR is his call (superpowers:finishing-a-development-branch).
