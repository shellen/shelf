# Square Covers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw albums, podcasts and audiobooks square everywhere Shelf shows a cover (the 3D shelf, the Covers wall, the detail poster and the cover picker), with a record in its sleeve for an album that has no art, and never crop art in a square frame.

**Architecture:** `coverShape(item)` in `src/showcase.js` is the one place that decides shape from the medium. `src/spines.js` draws the typographic cover and the record on a page of `coverSize(item)`. `src/carousel.js` gains `shelfLayout(sizes, gap)`, pure geometry for a shelf whose items each have their own spine and face width: slot offsets that add up the actual strides, blend the open face's room between neighbours mid-glide, wrap, and turn drag and wheel pixels into positions. `src/shelf.js` sizes each tape from its shape and drives the carousel through that layout. The wall, the detail poster and the picker take a `shape-square` or `shape-tall` class, and `src/style.css` does the rest.

**Tech Stack:** Vanilla JS (ES modules), Vite 7, vitest 4 + happy-dom 20 (happy-dom computes styles from a real stylesheet, which the wall, detail and picker tests use).

**Spec:** `docs/superpowers/specs/2026-11-03-square-covers-design.md`. Read it fully before starting. Where this plan and the spec disagree, stop and ask Jason.

---

## Ground rules (read once)

- **Branch:** `wip/square-covers` (already checked out). Never commit to `main`.
- **Baseline:** `npx vitest run` → `Test Files 24 passed (24)`, `Tests 585 passed (585)`, and nothing else printed (no warnings, no errors, no stray logs). Every task ends with the full suite green and that pristine output. Each task states the expected new total.
- **Jason's rules that bite here:**
  - TDD for every behaviour: write the failing test, watch it fail for the stated reason, write the minimal code, watch it pass. A few tests are marked as guards: they pin today's behaviour and pass from the start, and the step says so.
  - Every new code file starts with two `// ABOUTME: ` lines. (This plan creates no new files.)
  - Style: no semicolons, 2-space indent, single quotes, template strings. Match the surrounding code.
  - Comments describe what the code does now. Never "new", "now", "moved", "used to", "instead of", "improved".
  - **Never delete or weaken a test.** If an existing test fails, stop and raise it with Jason.
  - **`\u` escapes stay escapes.** If any code you write or paste contains a `\u…` escape, it must be in the file as the six characters `\`, `u` and four hex digits, never the character it stands for. Some editing tools quietly turn escapes into raw characters; after editing, check with `grep -n '\\u' <file>`. (This plan's code has none, but its strings do contain the raw characters `…` and `×`, exactly as the surrounding code already does; keep those as they are.)
- **Commits:** one per task. Stage files by name, never `git add -A` or `git add .`. Message style: one plain imperative sentence describing the user-visible effect, no `feat:` prefix, then the co-author line as a second `-m`:
  ```bash
  git commit -m "Draw albums, podcasts and audiobooks square on the wall" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  Commits are SSH-signed through 1Password. If signing fails (for example `1Password: failed to fill whole buffer`), stop and ask Jason to unlock 1Password. **Never bypass signing** (no `--no-gpg-sign`, no `-c commit.gpgsign=false`), and never skip hooks.
- **Run one test file:** `npx vitest run src/carousel.test.js`. **One describe or test by name:** `npx vitest run src/main.test.js -t "cover shapes on the wall"`.
- **Never read or commit anything in `data/`.** It holds Jason's personal library. `.gitignore` already covers `data/*`; never force-add past it.
- **Never write to Jason's database.** Jason runs his own dev server on ports 5173 (Vite) and 3001 (API) against his real library. Never send POST/PUT/PATCH/DELETE to it, and never click anything that saves (stars, fields, Change Cover's choices, Remove, Import, Find missing covers). The manual check in Task 13 is read-only.
- **Steps marked "Controller runs this, not a subagent"** need Jason in the conversation. A subagent stops before them and reports back.
- **Between tasks the app is mid-change.** From Task 2 a square podcast or audiobook draws its typographic cover on a square page, and from Task 3 an album draws a record, but the wall keeps a 2:3 frame until Task 9 and the detail poster a 2:3 page until Task 10. That is expected; only the finished branch is checked by eye (Task 13).

## How the pieces fit (orientation for someone new to this codebase)

- **Shape.** `mediumOf(item)` in `src/showcase.js` gives `item.medium || 'book'`. This plan adds `coverShape(item)` beside it: `'square'` for `album`, `podcast` and `audiobook`, `'tall'` for everything else. Every view asks it.
- **Typographic cover.** `coverTypeSvg(item)` in `src/spines.js` returns SVG shapes (no `<svg>` wrapper) for a 600-wide page. Three callers wrap it: `generatePlaceholder` in `src/main.js` (a data URI for the wall's `<img>` fallback chain and the tile's background), `posterHtml` in `src/overlay.js` (the detail poster, under the art `<image>`), and nothing else. This plan adds `coverSize(item)` → `{ width: 600, height: 600 | 900 }` so the callers size their wrapper from the item.
- **The 3D shelf.** `src/shelf.js`'s `mountShelf` lays out every item (three copies end to end when the list has 8 or more, so it wraps) as a `.tape`: a spine face and a cover face in 3D. `measure()` reads the shelf height `h` from a probe styled `height: var(--shelf-h)`, and `tick()` places each tape every frame at `slotOffset(r, …)` pixels from the centre, where `r = relativePosition(slot, pos, count)` is its signed distance in item units from the continuous position `pos`. The CSS reads `--h`, `--ws` (spine width) and `--d` (face width). Today `--ws` and `--d` are set once on `.shelf-stage`; this plan sets them on each `.tape`. Drag and wheel turn pixels into positions; today they divide by one `stride()`.
- **The shelf geometry this plan builds** (`shelfLayout` in `src/carousel.js`). Each item has a stride `spineWidth + gap` and a room `faceWidth - spineWidth + 1.6 * gap` (how far its face, turned out at the centre, pushes the neighbours apart). Slot `j`'s spine owns the stretch of position from `j - 0.5` to `j + 0.5`, so `along(x)`, the pixels along the row of spines up to position `x`, is a prefix sum of strides plus a share of the stride `x` is in. A slot `r` away from `pos` sits at `along(pos + r) - along(pos) + room(pos) * spread(r)`, where `spread` is today's easing (0 at the centre, ±½ from one slot out) and `room(pos)` blends the room of the item at `floor(pos)` into the next item's with the same smoothstep the faces turn with (`faceOut`). With every item the same size this is today's `slotOffset`, term for term; the offset is continuous in `pos` because `along` and `room` are; and the sizes repeat every `count` slots, so the three copies lay out identically. `moveBy(pos, pixels)` inverts `along` for drag and wheel.
- **The wall.** `renderCoversView` in `src/main.js` draws a `.wall` grid of `.cover-tile`s, each with a `.cover-aspect` box (2:3, the placeholder as its background) holding the `.cover-img` and a hover `.cover-overlay`.
- **The detail.** `renderDetail` in `src/overlay.js` draws the poster with `posterHtml`; `afterDetailRender` in `src/main.js` resolves the art and sets the poster `<image>`'s `href`.
- **The picker.** `renderCoverPicker` in `src/main.js` lists `state.coverOptions` from `searchCovers` (Open Library and Google Books) in a `.cover-picker-grid`.
- **Tests.** `src/main.test.js`'s `loadApp(books, { view })` renders the whole app with `fetch` stubbed (`MIXED` holds three books, the album Abbey Road with art at `https://art.example/abbey.jpg`, and the podcast Radiolab). happy-dom does no layout, so `getBoundingClientRect` is 0 unless a test mocks it; in `src/shelf.test.js` the `measuring its own box` describe mocks the probe to a 600px shelf (a book's spine is 99, face 400, gap 18). Vitest doesn't load CSS, so tests that check what the stylesheet does put `src/style.css` on the page with a helper Task 8 adds, and read `getComputedStyle`.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/showcase.js` | modify | `coverShape`: square for albums, podcasts and audiobooks |
| `src/showcase.test.js` | modify | `coverShape` for each medium and none |
| `src/spines.js` | modify | `coverSize`; `coverTypeSvg` on a square page for square items; the record for albums |
| `src/spines.test.js` | modify | Square type covers, the record, and a line-for-line guard on tall covers |
| `src/carousel.js` | modify | `shelfLayout(sizes, gap)`: `offset`, `moveBy`, `widestFace`; `slotOffset` shares its easing |
| `src/carousel.test.js` | modify | Per-item offsets (books, albums, mixed, mid-glide, continuity, wrapping), pixel conversion |
| `src/shelf.js` | modify | Per-tape sizes by shape, layout-driven offsets, visibility, open button, settle, drag and wheel; the record face and the square tape class |
| `src/shelf.test.js` | modify | Sizes, offsets, visibility, open button, drag and wheel at mixed sizes; tape markup |
| `src/overlay.js` | modify | Square poster: viewBox, clip, `<image>` with `meet`, mask and filter regions, scaled ink blobs, paper backing |
| `src/overlay.test.js` | modify | Poster shape and paper |
| `src/main.js` | modify | `generatePlaceholder` by `coverSize`; wall tile and picker grid `shape-*` classes; `has-art` on the poster once art loads |
| `src/main.test.js` | modify | Stylesheet helper; wall, poster, poster art, picker and shelf-art shape tests |
| `src/style.css` | modify | Square tiles, covers at the foot of their tiles, uncropped square art, CD spines, record face, face type from `2h/3`, square poster and picker options |

---

### Task 1: Albums, podcasts and audiobooks are square

**Files:**
- Modify: `src/showcase.js` (line 2's `ABOUTME`, and below `mediumOf` at line 7)
- Test: `src/showcase.test.js` (the import at line 5, and a new describe at the end)

- [ ] **Step 1: Write the failing test.** In `src/showcase.test.js`, replace:

```js
import { shelfTabs, captionState, starText, mediumOf, singular, counted } from './showcase.js'
```

with:

```js
import { shelfTabs, captionState, starText, mediumOf, singular, counted, coverShape } from './showcase.js'
```

Append to `src/showcase.test.js`:

```js
describe('coverShape', () => {
  it('makes albums, podcasts and audiobooks square', () => {
    expect(coverShape({ medium: 'album' })).toBe('square')
    expect(coverShape({ medium: 'podcast' })).toBe('square')
    expect(coverShape({ medium: 'audiobook' })).toBe('square')
  })

  it('keeps books and movies tall', () => {
    expect(coverShape({ medium: 'book' })).toBe('tall')
    expect(coverShape({ medium: 'movie' })).toBe('tall')
  })

  it('keeps an item with no medium tall, as a book', () => {
    expect(coverShape({})).toBe('tall')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/showcase.test.js` → `Tests 3 failed | 17 passed (20)`, each with `TypeError: coverShape is not a function`.

- [ ] **Step 3: Add `coverShape`.** In `src/showcase.js`, replace:

```js
// ABOUTME: Also names an item's medium, counts things, and formats its caption state line and star rating as text.
```

with:

```js
// ABOUTME: Also names an item's medium and cover shape, counts things, and formats its caption state line and star rating as text.
```

In `src/showcase.js`, replace:

```js
export const mediumOf = b => b.medium || 'book'
```

with:

```js
export const mediumOf = b => b.medium || 'book'
// Album and podcast art is square, and so is most audiobook art; everything else is drawn 2:3
const SQUARE_MEDIA = new Set(['album', 'podcast', 'audiobook'])
export const coverShape = b => SQUARE_MEDIA.has(mediumOf(b)) ? 'square' : 'tall'
```

- [ ] **Step 4: Run it.** `npx vitest run src/showcase.test.js` → `Tests 20 passed (20)`. Then `npx vitest run` → `Tests 588 passed (588)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/showcase.js src/showcase.test.js
git commit -m "Know which items have square covers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: A square page for podcast and audiobook covers

`coverTypeSvg` draws on a 600×900 page today. A square item gets a 600×600 page: the creator stays 90 from the top, the title is centred on the page, and the year sits 70 from the foot, as on a tall cover. A guard test pins a tall cover line for line, so the refactor can't move it.

**Files:**
- Modify: `src/spines.js` (imports at line 4; `coverTypeSvg` at lines 75–88)
- Test: `src/spines.test.js` (the import at line 5; the end of `describe('coverTypeSvg', …)`; a new describe)

- [ ] **Step 1: Write the failing tests.** In `src/spines.test.js`, replace:

```js
import { SPINE_PALETTE, spinePalette, spineTitle, spineCreator, wrapWords, coverTypeSvg } from './spines.js'
```

with:

```js
import { SPINE_PALETTE, spinePalette, spineTitle, spineCreator, wrapWords, coverTypeSvg, coverSize } from './spines.js'
```

In `src/spines.test.js`, replace:

```js
    expect([...doc.querySelectorAll('tspan')].map(t => t.textContent).join(' ')).toBe('<B>BOLD</B> & CO')
  })
})
```

with:

```js
    expect([...doc.querySelectorAll('tspan')].map(t => t.textContent).join(' ')).toBe('<B>BOLD</B> & CO')
  })

  it('sets a tall item\'s cover on a 600 by 900 page, line for line', () => {
    const book = { id: 's2-dune', title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', year: 1969, medium: 'book' }
    expect(coverTypeSvg(book)).toBe([
      '<rect width="600" height="900" fill="#6B3A4B"/>',
      '<text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="#EDE3CC">URSULA K. LE GUIN</text>',
      '<text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="47" fill="#EDE3CC"><tspan x="300" y="424.1">THE LEFT HAND</tspan><tspan x="300" y="475.8">OF DARKNESS</tspan></text>',
      '<text x="300" y="830" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="#EDE3CC">1969</text>',
    ].join('\n    '))
  })

  it.each(['podcast', 'audiobook'])('sets the creator, short title and year of a %s on a square page', medium => {
    const doc = draw({ id: 'radiolab', title: 'Radiolab: Season One', author: 'WNYC Studios', year: 2002, medium })
    const { bg, fg } = spinePalette('radiolab')
    const rect = doc.querySelector('rect')
    expect([rect.getAttribute('height'), rect.getAttribute('fill')]).toEqual(['600', bg])
    expect([...doc.querySelectorAll('text')].map(t => [t.textContent, t.getAttribute('fill')])).toEqual([
      ['WNYC STUDIOS', fg], ['RADIOLAB', fg], ['2002', fg],
    ])
    // The title is centred on the square and the year sits as far from its foot as on a tall cover
    expect(doc.querySelector('tspan').getAttribute('y')).toBe('300.0')
    expect(doc.querySelectorAll('text')[2].getAttribute('y')).toBe('530')
  })
})

describe('coverSize', () => {
  it('is 600 by 900 for a tall item and 600 by 600 for a square one', () => {
    expect(coverSize({ medium: 'book' })).toEqual({ width: 600, height: 900 })
    expect(coverSize({})).toEqual({ width: 600, height: 900 })
    expect(coverSize({ medium: 'podcast' })).toEqual({ width: 600, height: 600 })
    expect(coverSize({ medium: 'album' })).toEqual({ width: 600, height: 600 })
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/spines.test.js` → `Tests 3 failed | 23 passed (26)`: the podcast and audiobook tests with `AssertionError: expected [ '900', '#6B3A4B' ] to deeply equal [ '600', '#6B3A4B' ]`, and `coverSize` with `TypeError: coverSize is not a function`. The line-for-line test is a guard and passes already.

- [ ] **Step 3: Draw on a page of the item's size.** In `src/spines.js`, replace:

```js
import { esc } from './html.js'
```

with:

```js
import { esc } from './html.js'
import { coverShape } from './showcase.js'
```

In `src/spines.js`, replace:

```js
// The typographic cover for an item with no art, as shapes for a 600×900 SVG:
// its cloth colour behind its creator, its short title and its year
export function coverTypeSvg(book) {
  const { bg, fg } = spinePalette(book.id)
  const lines = wrapWords((spineTitle(book.title) || 'Untitled').toUpperCase(), 13)
  const size = titleSize(lines)
  const tspans = lines.map((l, k) =>
    `<tspan x="300" y="${(450 - (lines.length - 1) * size * 0.55 + k * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`
  ).join('')
  return `<rect width="600" height="900" fill="${bg}"/>
    <text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="${fg}">${esc(shortCreator((book.author || '').toUpperCase()))}</text>
    <text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${size}" fill="${fg}">${tspans}</text>
    <text x="300" y="830" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="${fg}">${esc(book.year || '')}</text>`
}
```

with:

```js
// The size of the page a cover is drawn on: square for a square item, 2:3 otherwise
export function coverSize(book) {
  return { width: 600, height: coverShape(book) === 'square' ? 600 : 900 }
}

// The typographic cover for an item with no art, as shapes for an SVG of coverSize(book):
// its cloth colour behind its creator, its short title and its year
export function coverTypeSvg(book) {
  const { height } = coverSize(book)
  const { bg, fg } = spinePalette(book.id)
  const lines = wrapWords((spineTitle(book.title) || 'Untitled').toUpperCase(), 13)
  const size = titleSize(lines)
  const tspans = lines.map((l, k) =>
    `<tspan x="300" y="${(height / 2 - (lines.length - 1) * size * 0.55 + k * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`
  ).join('')
  return `<rect width="600" height="${height}" fill="${bg}"/>
    <text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="${fg}">${esc(shortCreator((book.author || '').toUpperCase()))}</text>
    <text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${size}" fill="${fg}">${tspans}</text>
    <text x="300" y="${height - 70}" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="${fg}">${esc(book.year || '')}</text>`
}
```

`spines.js` importing from `showcase.js` makes no cycle: `showcase.js` imports nothing.

- [ ] **Step 4: Run them.** `npx vitest run src/spines.test.js` → `Tests 26 passed (26)`. Then `npx vitest run` → `Tests 592 passed (592)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/spines.js src/spines.test.js
git commit -m "Set a podcast or audiobook without art on a square cover" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: An album without art is a record in its sleeve

On the 600×600 page: the cloth colour fills the square, a near-black disc (`#141414`, radius 216) sits 84 units (14%) in from each edge, a round label in the palette's light paper colour (`#EDE3CC`, radius 100) carries the artist above the spindle hole and the short title below it, and the spindle hole (radius 7) shows the sleeve through. The label's title keeps to two lines; its artist is cut at 18 characters.

**Files:**
- Modify: `src/spines.js` (the import added in Task 2; constants at about line 64; `shortCreator`; `coverTypeSvg`)
- Test: `src/spines.test.js` (a new describe at the end)

- [ ] **Step 1: Write the failing tests.** Append to `src/spines.test.js`:

```js
describe('the record cover', () => {
  const draw = book => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${coverTypeSvg(book)}</svg>`, 'image/svg+xml')
  const ALBUM = { id: 'ok-computer', title: 'OK Computer: OKNOTOK 1997 2017', author: 'Radiohead', year: 1997, medium: 'album' }
  const circles = doc => [...doc.querySelectorAll('circle')].map(c => [c.getAttribute('cx'), c.getAttribute('cy'), c.getAttribute('r'), c.getAttribute('fill')])

  it('fills a square sleeve with the album\'s cloth colour', () => {
    const rect = draw(ALBUM).querySelector('rect')
    expect([rect.getAttribute('width'), rect.getAttribute('height'), rect.getAttribute('fill')]).toEqual(['600', '600', spinePalette('ok-computer').bg])
  })

  it('draws a near-black disc 14% in from each edge, a paper label, and a spindle hole showing the sleeve', () => {
    expect(circles(draw(ALBUM))).toEqual([
      ['300', '300', '216', '#141414'],
      ['300', '300', '100', '#EDE3CC'],
      ['300', '300', '7', spinePalette('ok-computer').bg],
    ])
  })

  it('carries the artist and the short title on the label, in ink', () => {
    const texts = [...draw(ALBUM).querySelectorAll('text')]
    expect(texts.map(t => [t.textContent, t.getAttribute('fill')])).toEqual([['RADIOHEAD', '#141414'], ['OK COMPUTER', '#141414']])
    expect(texts.map(t => t.getAttribute('font-family'))).toEqual(['Inter Tight, sans-serif', 'Newsreader, Georgia, serif'])
  })

  it('sets the artist above the spindle hole and the title below it', () => {
    const doc = draw(ALBUM)
    const [artist, title] = doc.querySelectorAll('text')
    // The hole spans 293 to 307; a line reaches at most its font size above its baseline
    expect(Number(artist.getAttribute('y'))).toBeLessThan(293)
    const size = Number(title.getAttribute('font-size'))
    expect([...title.querySelectorAll('tspan')].every(t => Number(t.getAttribute('y')) - size > 307)).toBe(true)
  })

  it('keeps a long title to two lines on the label, ending the second with an ellipsis', () => {
    const lines = [...draw({ ...ALBUM, title: 'The Freewheelin\' Bob Dylan Remastered Mono Edition' }).querySelectorAll('tspan')].map(t => t.textContent)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  it('cuts a long artist short to fit the label', () => {
    const artist = draw({ ...ALBUM, author: 'The London Symphony Orchestra and Chorus' }).querySelector('text').textContent
    expect(artist.length).toBeLessThanOrEqual(18)
    expect(artist.endsWith('…')).toBe(true)
  })

  it('names an untitled album', () => {
    expect([...draw({ id: 'x', medium: 'album' }).querySelectorAll('tspan')].map(t => t.textContent)).toEqual(['UNTITLED'])
  })

  it('sets album data as text', () => {
    const doc = draw({ id: 'h', title: '<b>Bold</b> & Co', author: '"Q" <i>', medium: 'album' })
    expect(doc.querySelector('b')).toBeNull()
    expect(doc.querySelector('i')).toBeNull()
    expect(doc.querySelector('text').textContent).toBe('"Q" <I>')
    expect([...doc.querySelectorAll('tspan')].map(t => t.textContent).join(' ')).toBe('<B>BOLD</B> & CO')
  })

  it('is drawn only for albums', () => {
    expect(draw({ ...ALBUM, medium: 'podcast' }).querySelector('circle')).toBeNull()
    expect(draw({ ...ALBUM, medium: 'book' }).querySelector('circle')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/spines.test.js` → `Tests 5 failed | 30 passed (35)`:
  - the disc test: `AssertionError: expected [] to deeply equal [ …(3) ]`
  - the label test: `AssertionError: expected [ [ 'RADIOHEAD', '#EDE3CC' ], …(2) ] to deeply equal [ [ 'RADIOHEAD', '#141414' ], …(1) ]`
  - above and below the hole: `AssertionError: expected false to be true`
  - two lines: `AssertionError: expected [ 'THE', 'FREEWHEELIN\'', …(2) ] to have a length of 2 but got 4`
  - the long artist: `AssertionError: expected 30 to be less than or equal to 18`

  The square sleeve, untitled, escaping and albums-only tests pass already (the album is drawn as a square type cover since Task 2).

- [ ] **Step 3: Draw the record.** In `src/spines.js`, replace:

```js
import { coverShape } from './showcase.js'
```

with:

```js
import { coverShape, mediumOf } from './showcase.js'
```

In `src/spines.js`, replace:

```js
const CREATOR_CHARS = 30
```

with:

```js
const CREATOR_CHARS = 30
// The record's label is a circle of radius 100 at the centre of the square, around a spindle hole
const RECORD_INK = '#141414'
const LABEL_PAPER = '#EDE3CC'
const LABEL_TITLE_ROOM = 140
const LABEL_CREATOR_CHARS = 18
```

In `src/spines.js`, replace:

```js
function shortCreator(name) {
  return name.length > CREATOR_CHARS ? `${name.slice(0, CREATOR_CHARS - 1).trimEnd()}…` : name
}
```

with:

```js
function shortCreator(name, max = CREATOR_CHARS) {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name
}

// A title on the record's label keeps to two lines, the second ending with an ellipsis when text is left over
function labelLines(title) {
  const lines = wrapWords(title, 12)
  return lines.length <= 2 ? lines : [lines[0], `${lines[1]}…`]
}

// A record in its sleeve: the cloth colour fills the square, a near-black disc sits 84 units (14%)
// in from each edge, and the paper label carries the artist above the spindle hole and the short title below it
function recordSvg(book) {
  const { bg } = spinePalette(book.id)
  const lines = labelLines((spineTitle(book.title) || 'Untitled').toUpperCase())
  const longest = Math.max(1, ...lines.map(l => l.length))
  const size = Math.max(12, Math.min(26, Math.floor(LABEL_TITLE_ROOM / (longest * TITLE_CHAR_WIDTH))))
  const tspans = lines.map((l, k) =>
    `<tspan x="300" y="${(318 + size * 0.8 + k * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`
  ).join('')
  return `<rect width="600" height="600" fill="${bg}"/>
    <circle cx="300" cy="300" r="216" fill="${RECORD_INK}"/>
    <circle cx="300" cy="300" r="100" fill="${LABEL_PAPER}"/>
    <text x="300" y="272" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="12" letter-spacing="2.4" fill="${RECORD_INK}">${esc(shortCreator((book.author || '').toUpperCase(), LABEL_CREATOR_CHARS))}</text>
    <text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${size}" fill="${RECORD_INK}">${tspans}</text>
    <circle cx="300" cy="300" r="7" fill="${bg}"/>`
}
```

In `src/spines.js`, replace:

```js
// The typographic cover for an item with no art, as shapes for an SVG of coverSize(book):
// its cloth colour behind its creator, its short title and its year
export function coverTypeSvg(book) {
  const { height } = coverSize(book)
```

with:

```js
// The typographic cover for an item with no art, as shapes for an SVG of coverSize(book):
// a record for an album, otherwise its cloth colour behind its creator, its short title and its year
export function coverTypeSvg(book) {
  if (mediumOf(book) === 'album') return recordSvg(book)
  const { height } = coverSize(book)
```

- [ ] **Step 4: Run them.** `npx vitest run src/spines.test.js` → `Tests 35 passed (35)`. Then `npx vitest run` → `Tests 601 passed (601)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/spines.js src/spines.test.js
git commit -m "Draw an album without art as a record in its sleeve" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Shelf geometry with a size per item

`shelfLayout(sizes, gap)` is pure: `sizes` holds one `{ spineWidth, faceWidth }` per item, in item order. This task builds `offset(r, pos)` and `widestFace`; Task 5 adds `moveBy`. The orientation section above explains the formula. The tests use small sizes so the arithmetic is easy to check by hand: a book is `{ spineWidth: 20, faceWidth: 100 }` (stride 22, room 100 − 20 + 3.2 = 83.2) and an album `{ spineWidth: 10, faceWidth: 150 }` (stride 12, room 143.2), with a gap of 2. They catch the likely wrong formulas: taking the room from the nearest item (jumps at half a slot), blending it linearly (wrong mid-glide value), or multiplying one stride (wrong mixed spacing). `toBeCloseTo(…, 9)` allows for floating-point rounding only.

**Files:**
- Modify: `src/carousel.js` (line 2's `ABOUTME`; `slotOffset` at lines 36–40)
- Test: `src/carousel.test.js` (the import at line 5; a new describe at the end)

- [ ] **Step 1: Write the failing tests.** In `src/carousel.test.js`, replace:

```js
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset } from './carousel.js'
```

with:

```js
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset, shelfLayout } from './carousel.js'
```

Append to `src/carousel.test.js`:

```js
describe('shelfLayout', () => {
  // A book's spine stride is 22 and the room its face opens is 100 - 20 + 3.2 = 83.2;
  // an album's are 12 and 150 - 10 + 3.2 = 143.2
  const BOOK = { spineWidth: 20, faceWidth: 100 }
  const ALBUM = { spineWidth: 10, faceWidth: 150 }
  const GAP = 2
  const POSITIONS = [0, 0.25, 0.5, 0.75, 1, 2.6, 4]
  const RS = [-3, -1.5, -1, -0.6, -0.5, 0, 0.3, 0.5, 1, 2, 3.25]

  describe('offset', () => {
    it('places every slot of a shelf of books where slotOffset does', () => {
      const layout = shelfLayout(Array(5).fill(BOOK), GAP)
      for (const pos of POSITIONS) {
        for (const r of RS) expect(layout.offset(r, pos)).toBeCloseTo(slotOffset(r, { ...BOOK, gap: GAP }), 9)
      }
    })

    it('places every slot of a shelf of albums where slotOffset does at the album size', () => {
      const layout = shelfLayout(Array(5).fill(ALBUM), GAP)
      for (const pos of POSITIONS) {
        for (const r of RS) expect(layout.offset(r, pos)).toBeCloseTo(slotOffset(r, { ...ALBUM, gap: GAP }), 9)
      }
    })

    it('puts the centre at zero wherever it is', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      for (const pos of POSITIONS) expect(layout.offset(0, pos)).toBe(0)
    })

    it('opens the room of the centred item\'s own face, and packs each spine by its own width', () => {
      const layout = shelfLayout([ALBUM, ALBUM, BOOK, BOOK, BOOK], GAP)
      // Book 2 centred: half its stride, half its neighbour's, and half its own room
      expect(layout.offset(1, 2)).toBeCloseTo(11 + 11 + 41.6, 9)
      expect(layout.offset(-1, 2)).toBeCloseTo(-(11 + 6 + 41.6), 9)
      expect(layout.offset(2, 2) - layout.offset(1, 2)).toBeCloseTo(22, 9)
      expect(layout.offset(-2, 2) - layout.offset(-1, 2)).toBeCloseTo(-12, 9)
      // Album 1 centred opens its wider face
      expect(layout.offset(1, 1)).toBeCloseTo(6 + 11 + 71.6, 9)
      expect(layout.offset(-1, 1)).toBeCloseTo(-(6 + 6 + 71.6), 9)
    })

    it('blends the room between the two items either side partway through a glide', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      // A slot two or more away has the room's full half: the spines from 0.25 to 3, plus half the room
      // at 0.25, where the book's share eases from 1 as the album's face turns out
      const share = 0.75 * 0.75 * (3 - 2 * 0.75)
      const spines = 22 * 0.25 + 12 + 22 + 12 * 0.5
      expect(layout.offset(2.75, 0.25)).toBeCloseTo(spines + (83.2 * share + 143.2 * (1 - share)) / 2, 9)
      // Halfway, each item has half the say
      expect(layout.offset(1.5, 0.5)).toBeCloseTo(12 + 11 + (83.2 + 143.2) / 4, 9)
    })

    it('moves every slot continuously through glides between books and albums', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      const step = 0.001
      for (let v = 0; v < 5; v++) {
        for (let pos = 0; pos < 4; pos += step) {
          const jump = Math.abs(layout.offset(v - (pos + step), pos + step) - layout.offset(v - pos, pos))
          expect(jump, `slot ${v} near position ${pos.toFixed(3)}`).toBeLessThan(0.5)
        }
      }
    })

    it('wraps, laying a long shelf out the same at every copy', () => {
      const sizes = [BOOK, ALBUM, BOOK, BOOK, ALBUM, BOOK, BOOK, ALBUM]
      const layout = shelfLayout(sizes, GAP)
      for (const pos of POSITIONS) {
        for (const r of RS) {
          expect(layout.offset(r, pos + 8)).toBeCloseTo(layout.offset(r, pos), 9)
          expect(layout.offset(r, pos + 16)).toBeCloseTo(layout.offset(r, pos), 9)
          expect(layout.offset(r, pos - 8)).toBeCloseTo(layout.offset(r, pos), 9)
        }
      }
      // From the first item, the slot before it is the last album
      expect(layout.offset(-1, 0)).toBeCloseTo(-(6 + 11 + 41.6), 9)
    })
  })

  it('knows its widest face', () => {
    expect(shelfLayout([BOOK, ALBUM, BOOK], GAP).widestFace).toBe(150)
    expect(shelfLayout([BOOK, BOOK], GAP).widestFace).toBe(100)
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/carousel.test.js` → `Tests 8 failed | 14 passed (22)`, each with `TypeError: shelfLayout is not a function`.

- [ ] **Step 3: Build the layout.** In `src/carousel.js`, replace:

```js
// ABOUTME: Positions are in item units; slotOffset converts them to pixels.
```

with:

```js
// ABOUTME: Positions are in item units; slotOffset and shelfLayout convert them to pixels.
```

In `src/carousel.js`, replace:

```js
// Spines sit side by side; the centred face pushes its neighbours apart by its own width
export function slotOffset(r, { spineWidth, faceWidth, gap }) {
  const spread = r <= -1 ? -0.5 : r >= 1 ? 0.5 : (r + Math.sin(Math.PI * r) / Math.PI) / 2
  return r * (spineWidth + gap) + (faceWidth - spineWidth + 1.6 * gap) * spread
}
```

with:

```js
// How much of the centred face's room lies between the centre and a slot r away:
// none at the centre, easing to half of it a slot away on either side
function spread(r) {
  return r <= -1 ? -0.5 : r >= 1 ? 0.5 : (r + Math.sin(Math.PI * r) / Math.PI) / 2
}

// Spines sit side by side; the centred face pushes its neighbours apart by its own width
export function slotOffset(r, { spineWidth, faceWidth, gap }) {
  return r * (spineWidth + gap) + (faceWidth - spineWidth + 1.6 * gap) * spread(r)
}

const mod = (i, n) => ((i % n) + n) % n

// The geometry of a shelf whose items each have their own spine and face width: `sizes` holds one
// { spineWidth, faceWidth } per item in order, and `gap` sits between spines. Slot j's spine owns the
// stretch of position from j - 0.5 to j + 0.5, so neighbours sit half of each one's stride apart.
// The sizes repeat every `sizes.length` slots, for lists that wrap.
export function shelfLayout(sizes, gap) {
  const count = sizes.length
  const strides = sizes.map(s => s.spineWidth + gap)
  const rooms = sizes.map(s => s.faceWidth - s.spineWidth + 1.6 * gap)
  const starts = [0]
  strides.forEach(w => starts.push(starts.at(-1) + w))
  const total = starts[count]

  // Pixels along the row of spines, from the start of slot 0's stretch to position x
  function along(x) {
    const j = Math.floor(x + 0.5)
    const k = mod(j, count)
    return (j - k) / count * total + starts[k] + strides[k] * (x + 0.5 - j)
  }

  // The room the centred face opens: an item's own at its slot, handing over to the next
  // item's as that item's face turns out
  function room(pos) {
    const j = Math.floor(pos)
    const t = pos - j
    return rooms[mod(j, count)] * faceOut(t) + rooms[mod(j + 1, count)] * faceOut(1 - t)
  }

  return {
    widestFace: Math.max(...sizes.map(s => s.faceWidth)),
    // Pixels from the centre to the slot r away from position pos
    offset: (r, pos) => along(pos + r) - along(pos) + room(pos) * spread(r),
  }
}
```

`slotOffset` keeps its tests and its numbers; it and `shelfLayout` share the `spread` easing. The shelf stops calling `slotOffset` in Task 6, but its tests stay (never delete a test), and Task 4's tests use it as the reference for a shelf of one size.

- [ ] **Step 4: Run them.** `npx vitest run src/carousel.test.js` → `Tests 22 passed (22)`. Then `npx vitest run` → `Tests 609 passed (609)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/carousel.js src/carousel.test.js
git commit -m "Lay out a shelf whose items each have their own width" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Turn drag and wheel pixels into positions along the actual spines

`moveBy(pos, pixels)` is the position `pixels` further along the row of spines: `along` inverted, finding the stretch by halving the prefix sums (Jason's library has 1,804 albums, so a linear walk per pointer move would be wasteful). Today's drag divides by one stride; with every item the same size `moveBy(pos, px)` is `pos + px / stride`. Today's `stride()` falls back to 1 when the shelf hasn't been measured yet (happy-dom always reports 0, and many shelf tests depend on one item per pixel); `moveBy` does the same when the strides add up to 0.

**Files:**
- Modify: `src/carousel.js` (the `return` at the end of `shelfLayout`)
- Test: `src/carousel.test.js` (inside `describe('shelfLayout', …)`, above `it('knows its widest face', …)`)

- [ ] **Step 1: Write the failing tests.** In `src/carousel.test.js`, replace:

```js
  it('knows its widest face', () => {
```

with:

```js
  describe('moveBy', () => {
    it('moves a shelf of books one item per stride', () => {
      const layout = shelfLayout(Array(5).fill(BOOK), GAP)
      expect(layout.moveBy(0, 22)).toBe(1)
      for (const pos of POSITIONS) {
        for (const px of [-70, -22, -5, 0, 7, 22, 61]) expect(layout.moveBy(pos, px)).toBeCloseTo(pos + px / 22, 9)
      }
    })

    it('moves a shelf of albums one item per album stride', () => {
      const layout = shelfLayout(Array(5).fill(ALBUM), GAP)
      expect(layout.moveBy(0, 12)).toBeCloseTo(1, 9)
      expect(layout.moveBy(3, -24)).toBeCloseTo(1, 9)
    })

    it('moves one item for the stride between neighbours on a mixed shelf', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      // Half a book's stride and half an album's apart
      expect(layout.moveBy(0, 17)).toBeCloseTo(1, 9)
      expect(layout.moveBy(1, 17)).toBeCloseTo(2, 9)
      expect(layout.moveBy(0, 34)).toBeCloseTo(2, 9)
      expect(layout.moveBy(2, -34)).toBeCloseTo(0, 9)
      // Within a book's stretch a pixel is a 22nd of an item, within an album's a 12th
      expect(layout.moveBy(0, 5.5)).toBeCloseTo(0.25, 9)
      expect(layout.moveBy(1, 3)).toBeCloseTo(1.25, 9)
    })

    it('comes back to where it started when moved back', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      for (const pos of POSITIONS) {
        for (const px of [-40, -9, 3, 26]) expect(layout.moveBy(layout.moveBy(pos, px), -px)).toBeCloseTo(pos, 9)
      }
    })

    it('carries on into the next copy of a long shelf', () => {
      const sizes = [BOOK, ALBUM, BOOK, BOOK, ALBUM, BOOK, BOOK, ALBUM]
      const layout = shelfLayout(sizes, GAP)
      expect(layout.moveBy(7, 17)).toBeCloseTo(8, 9)
      expect(layout.moveBy(0, -17)).toBeCloseTo(-1, 9)
      expect(layout.moveBy(2, 5 * 22 + 3 * 12)).toBeCloseTo(10, 9)
    })

    it('moves one item per pixel on a shelf not laid out yet', () => {
      const layout = shelfLayout(Array(5).fill({ spineWidth: 0, faceWidth: 0 }), 0)
      expect(layout.moveBy(3, 7)).toBe(10)
      expect(layout.moveBy(3, -2)).toBe(1)
    })
  })

  it('knows its widest face', () => {
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/carousel.test.js` → `Tests 6 failed | 22 passed (28)`, each with `TypeError: layout.moveBy is not a function`.

- [ ] **Step 3: Add `moveBy`.** In `src/carousel.js`, replace:

```js
  return {
    widestFace: Math.max(...sizes.map(s => s.faceWidth)),
    // Pixels from the centre to the slot r away from position pos
    offset: (r, pos) => along(pos + r) - along(pos) + room(pos) * spread(r),
  }
}
```

with:

```js
  // The position whose distance along the row of spines is p: the last stretch starting at or
  // before p, found by halving, and the share of that stretch p reaches into
  function positionAlong(p) {
    const copies = Math.floor(p / total)
    const rest = p - copies * total
    let lo = 0
    let hi = count - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (starts[mid] <= rest) lo = mid
      else hi = mid - 1
    }
    return copies * count + lo - 0.5 + (rest - starts[lo]) / strides[lo]
  }

  return {
    widestFace: Math.max(...sizes.map(s => s.faceWidth)),
    // Pixels from the centre to the slot r away from position pos
    offset: (r, pos) => along(pos + r) - along(pos) + room(pos) * spread(r),
    // The position `pixels` further along the row of spines than pos, for a drag or a wheel turn.
    // A shelf not laid out yet has no widths, so it moves one item per pixel.
    moveBy: (pos, pixels) => total > 0 ? positionAlong(along(pos) + pixels) : pos + pixels,
  }
}
```

- [ ] **Step 4: Run them.** `npx vitest run src/carousel.test.js` → `Tests 28 passed (28)`. Then `npx vitest run` → `Tests 615 passed (615)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/carousel.js src/carousel.test.js
git commit -m "Turn shelf drags and wheel turns into travel along spines of any width" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The shelf sizes each item by its shape

`measure()` sizes every item from its shape (books: spine `0.165h`, face `2h/3`, exactly today's expressions; square items: spine `0.08h`, face `h`; gap `0.03h`), sets `--ws` and `--d` on each tape instead of once on the stage (the stage keeps `--h`), and builds the layout. `tick()` places tapes with `layout.offset`, keeps tapes visible as far out as the widest face needs, and puts the open button and the "Open" hover zone at the centred item's face. The settle distance uses the item being settled on. Drag and wheel keep dividing by one stride until Task 7: here that is the centred item's stride, which is today's stride on a shelf of books.

The new tests go in `describe('measuring its own box', …)`, where the probe reports a 600px shelf: a book's spine is 99 and face 400, an album's spine 48 and face 600, the gap 18. happy-dom's window is 1024 wide.

**Files:**
- Modify: `src/shelf.js` (imports at lines 5–7; a `SIZES` table below `TILT_DEG`; `measure`, `stride`, `centreTravel`, `settleDistance` at lines 127–143; `tick` at lines 225, 240 and 245)
- Test: `src/shelf.test.js` (an `albums` helper below `books` at line 9; tests above `it('disconnects the observer when destroyed', …)` at about line 561)

- [ ] **Step 1: Write the failing tests.** In `src/shelf.test.js`, replace:

```js
const tab = (items, key = 'reading', label = 'Reading') => ({ key, label, items })
```

with:

```js
const albums = n => Array.from({ length: n }, (_, i) => ({
  id: `a${i}`, title: `Album ${i}`, author: `Artist ${i}`, tags: [], rating: null, dateRead: null, year: 1990 + i, medium: 'album',
}))
const tab = (items, key = 'reading', label = 'Reading') => ({ key, label, items })
```

In `src/shelf.test.js`, replace:

```js
    it('disconnects the observer when destroyed', () => {
```

with:

```js
    const tapeOf = (id, copy = 0) => document.querySelectorAll(`.tape[data-id="${id}"]`)[copy]
    const px = (el, name) => parseFloat(el.style.getPropertyValue(name))
    const across = el => Number(el.style.transform.match(/translate3d\(([-\d.e]+)px/)[1])

    it('sizes each item\'s spine and face from its own shape', () => {
      const podcast = { id: 'p0', title: 'Radiolab', author: 'WNYC', tags: [], medium: 'podcast' }
      const audiobook = { id: 'ab0', title: 'Dune', author: 'Frank Herbert', tags: [], medium: 'audiobook' }
      mountWith([...books(2), ...albums(1), podcast, audiobook])
      expect([px(tapeOf('b0'), '--ws'), px(tapeOf('b0'), '--d')]).toEqual([600 * 0.165, 600 * 2 / 3])
      for (const id of ['a0', 'p0', 'ab0']) {
        expect(px(tapeOf(id), '--ws')).toBeCloseTo(48, 9)
        expect(px(tapeOf(id), '--d')).toBe(600)
      }
    })

    it('gives every copy of every book on a shelf of books the sizes of a 2:3 cover', () => {
      mountWith(books(10))
      const tapes = [...document.querySelectorAll('.tape')]
      expect(tapes.every(t => px(t, '--ws') === 600 * 0.165 && px(t, '--d') === 600 * 2 / 3)).toBe(true)
      expect(stageHeight()).toBe('600px')
    })

    it('resizes every item when the shelf changes height', () => {
      mountWith([...books(1), ...albums(1)])
      shelfHeight = 480
      fire(1200, 800)
      expect(px(tapeOf('b0'), '--ws')).toBeCloseTo(79.2, 9)
      expect([px(tapeOf('a0'), '--ws'), px(tapeOf('a0'), '--d')]).toEqual([480 * 0.08, 480])
    })

    it('lays a shelf of books out a stride apart, with the centred face\'s room around it', () => {
      mountWith(books(10))
      // Book 0 is centred in the middle copy; a stride is 99 + 18 and its face opens 400 - 99 + 28.8
      expect(across(tapeOf('b0', 1))).toBe(0)
      expect(across(tapeOf('b1', 1))).toBeCloseTo(117 + 329.8 / 2, 6)
      expect(across(tapeOf('b2', 1))).toBeCloseTo(2 * 117 + 329.8 / 2, 6)
      expect(across(tapeOf('b9', 0))).toBeCloseTo(-(117 + 329.8 / 2), 6)
    })

    it('opens the centred album\'s own width around it and packs its spine at its own width', () => {
      mountWith([...albums(1), ...books(2)])
      // Half the album's stride (48 + 18), half a book's (99 + 18), and half the album's room (600 - 48 + 28.8)
      expect(across(tapeOf('b0'))).toBeCloseTo(33 + 58.5 + 580.8 / 2, 6)
      expect(across(tapeOf('b1')) - across(tapeOf('b0'))).toBeCloseTo(117, 6)
    })

    it('keeps spines in view as far out as the widest face on the shelf needs', () => {
      // Nine books out from the centre sit 9 * 117 + 164.9 from it: beyond a book face's reach
      // (half the 1024 window plus one and a half 400 faces) but within an album's
      mountWith([...books(10), ...albums(1)])
      expect(tapeOf('b9', 1).style.visibility).toBe('')
      expect(across(tapeOf('b9', 1))).toBeCloseTo(9 * 117 + 164.9, 6)
    })

    it('sits the open button at the corner of the centred item\'s face', () => {
      const frames = holdFrames()
      mountWith([...albums(1), ...books(2)])
      const left = () => document.querySelector('.shelf-open').style.left
      expect(left()).toBe(`${-0.5 * 600 - 6}px`)
      control.step(1)
      frames.settle()
      expect(left()).toBe(`${-0.5 * 400 - 6}px`)
    })

    it('disconnects the observer when destroyed', () => {
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/shelf.test.js` → `Tests 6 failed | 63 passed (69)`:
  - sizes by shape: `AssertionError: expected [ NaN, NaN ] to deeply equal [ 99, 400 ]`
  - every copy of every book: `AssertionError: expected false to be true`
  - resizing: `AssertionError: expected NaN to be close to 79.2, received difference is NaN, but expected 5e-10`
  - the centred album: `AssertionError: expected 281.9 to be close to 381.9, received difference is 100, but expected 5e-7`
  - the widest face: `AssertionError: expected 'hidden' to be ''`
  - the open button: `AssertionError: expected '-206px' to be '-306px'`

  The shelf-of-books layout test is a guard: it passes already, and must keep passing.

- [ ] **Step 3: Size each tape and lay the shelf out through `shelfLayout`.** In `src/shelf.js`, replace:

```js
import { captionState, starText } from './showcase.js'
import { spinePalette, spineTitle, spineCreator } from './spines.js'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset } from './carousel.js'
```

with:

```js
import { captionState, starText, coverShape } from './showcase.js'
import { spinePalette, spineTitle, spineCreator } from './spines.js'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, shelfLayout } from './carousel.js'
```

In `src/shelf.js`, replace:

```js
export const TILT_DEG = -4.5
```

with:

```js
export const TILT_DEG = -4.5

// Each shape's spine and face width on a shelf h tall: a book's 2:3 face, or a full-height
// square face with a spine about half a book's, like a CD's
const SIZES = {
  tall: h => ({ spineWidth: h * 0.165, faceWidth: h * 2 / 3 }),
  square: h => ({ spineWidth: h * 0.08, faceWidth: h }),
}
```

In `src/shelf.js`, replace:

```js
    const h = probe.getBoundingClientRect().height
    probe.remove()
    const size = { h, spineWidth: h * 0.165, faceWidth: h * 2 / 3, gap: h * 0.03 }
    stage.style.setProperty('--h', `${size.h}px`)
    stage.style.setProperty('--ws', `${size.spineWidth}px`)
    stage.style.setProperty('--d', `${size.faceWidth}px`)
    return size
  }

  const stride = () => (geom.spineWidth + geom.gap) || 1
  // Near the centre a face travels its stride plus the room it opens, per slot
  const centreTravel = () => stride() + geom.faceWidth - geom.spineWidth + 1.6 * geom.gap
  const settleDistance = () => geom.faceWidth > 0 ? 0.5 / centreTravel() : 1e-3
```

with:

```js
    const h = probe.getBoundingClientRect().height
    probe.remove()
    const sizes = items.map(book => SIZES[coverShape(book)](h))
    stage.style.setProperty('--h', `${h}px`)
    tapes.forEach((t, v) => {
      const { spineWidth, faceWidth } = sizes[v % count]
      t.el.style.setProperty('--ws', `${spineWidth}px`)
      t.el.style.setProperty('--d', `${faceWidth}px`)
    })
    const gap = h * 0.03
    return { h, gap, sizes, layout: shelfLayout(sizes, gap) }
  }

  // The size of the item nearest position x, whose face is the one turned out there
  const sizeAt = x => geom.sizes[itemIndexAt(x, count)]
  const stride = () => (sizeAt(target).spineWidth + geom.gap) || 1
  // Near the centre a face travels its stride plus the room it opens, per slot
  function centreTravel() {
    const { spineWidth, faceWidth } = sizeAt(target)
    return (spineWidth + geom.gap) + faceWidth - spineWidth + 1.6 * geom.gap
  }
  const settleDistance = () => sizeAt(target).faceWidth > 0 ? 0.5 / centreTravel() : 1e-3
```

In `src/shelf.js`, replace:

```js
    const { h, faceWidth } = geom
```

with:

```js
    const { h, layout } = geom
    const { faceWidth } = sizeAt(pos)
```

In `src/shelf.js`, replace:

```js
    const limit = innerWidth / 2 + 1.5 * faceWidth
```

with:

```js
    const limit = innerWidth / 2 + 1.5 * layout.widestFace
```

In `src/shelf.js`, replace:

```js
      const x = slotOffset(r, geom)
```

with:

```js
      const x = layout.offset(r, pos)
```

`measure()` runs before `tapes` is used: `tapes` is built a few lines above `let geom = measure()`, so the tapes exist when it sets their sizes. The CSS needs no change: the spine and cover faces read `--ws` and `--d` from the tape they sit in.

- [ ] **Step 4: Run them.** `npx vitest run src/shelf.test.js` → `Tests 69 passed (69)`. Then `npx vitest run` → `Tests 622 passed (622)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/shelf.js src/shelf.test.js
git commit -m "Give albums, podcasts and audiobooks a full-height square face and a CD spine on the shelf" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Drag and wheel follow the actual spines on the shelf

A drag moves `moveBy(t0, -dx)`, and a wheel notch moves half its pixels along the row (`moveBy(target, delta * unit * 0.5)`), the same distance in pixels as today. On a shelf of books both are exactly today's `t0 - dx / stride()` and `target + delta * unit / stride() * 0.5`, so every existing drag and wheel test keeps passing.

The tests alternate books and albums (Book 0, Album 0, Book 1, …), where one stride can't be right: a book's stride is 117 and an album's 66.

**Files:**
- Modify: `src/shelf.js` (`stride` from Task 6; `onPointerMove` at about line 318; the wheel listener at about line 376)
- Test: `src/shelf.test.js` (above `it('disconnects the observer when destroyed', …)`)

- [ ] **Step 1: Write the failing tests.** In `src/shelf.test.js`, replace:

```js
    it('disconnects the observer when destroyed', () => {
```

with:

```js
    // Book 0, Album 0, Book 1, Album 1, …: a book's stride is 117 at this size and an album's 66
    const alternating = n => books(n).flatMap((book, i) => [book, albums(n)[i]])

    it('turns a drag into travel along the actual spines, so the item under the finger stays under it', () => {
      mountWith(alternating(5))
      const press = (type, x, buttons) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10, buttons })
      document.querySelector('.shelf-stage-wrap').dispatchEvent(press('pointerdown', 400, 1))
      // Half of Book 0's stride, all of Album 0's, then 35.5 into Book 1's: past halfway to Book 1
      window.dispatchEvent(press('pointermove', 240, 1))
      expect(caption()).toBe('Book 1')
    })

    it('turns a wheel notch into the same distance along the actual spines', () => {
      mountWith(alternating(5), 1)
      // Half a 240-pixel turn: half of Album 0's stride, then 87 into Book 1's, short of halfway to Album 1
      document.querySelector('.shelf-view').dispatchEvent(Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), { deltaY: 240, deltaX: 0, deltaMode: 0 }))
      expect(caption()).toBe('Book 1')
    })

    it('disconnects the observer when destroyed', () => {
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/shelf.test.js` → `Tests 2 failed | 69 passed (71)`: the drag with `AssertionError: expected 'Album 0' to be 'Book 1'` (160 / 117 rounds to one item) and the wheel with `AssertionError: expected 'Album 1' to be 'Book 1'` (120 / 66 rounds to two).

- [ ] **Step 3: Use `moveBy`.** In `src/shelf.js`, replace:

```js
  const sizeAt = x => geom.sizes[itemIndexAt(x, count)]
  const stride = () => (sizeAt(target).spineWidth + geom.gap) || 1
```

with:

```js
  const sizeAt = x => geom.sizes[itemIndexAt(x, count)]
```

In `src/shelf.js`, replace:

```js
    if (drag.moved) setTarget(drag.t0 - dx / stride())
```

with:

```js
    if (drag.moved) setTarget(geom.layout.moveBy(drag.t0, -dx))
```

In `src/shelf.js`, replace:

```js
    setTarget(target + delta * unit / stride() * 0.5)
```

with:

```js
    setTarget(geom.layout.moveBy(target, delta * unit * 0.5))
```

- [ ] **Step 4: Run them.** `npx vitest run src/shelf.test.js` → `Tests 71 passed (71)`. Then `npx vitest run` → `Tests 624 passed (624)`, pristine. The existing drag tests (`'Book 7'` after 7px at an unmeasured height, `'b2'` after a slot and a half at 117px a slot) are the books-only check: they must pass unchanged.

- [ ] **Step 5: Commit.**

```bash
git add src/shelf.js src/shelf.test.js
git commit -m "Keep a dragged album under the finger on the shelf" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Square faces and CD spines on the shelf

The tape of a square item gets the class `tape-square`. An album's face is a record drawn in HTML and CSS in the SVG record's proportions; a podcast's or audiobook's keeps today's three-span type markup in its square face. A book's tape markup stays character for character the same (a guard test pins it). The face's type is sized from a fixed `2h/3` (`--type`), so a square face's type matches a book's. Found art on a square face uses `background-size: contain` on paper.

This task also adds the stylesheet helper to `src/main.test.js`: happy-dom computes styles from a real stylesheet, so a test can put `src/style.css` on the page and read `getComputedStyle`. `useStylesheet()` removes it again when the test finishes, pass or fail.

**Files:**
- Modify: `src/shelf.js` (the showcase import; `tapeHtml` at lines 33–51)
- Modify: `src/style.css` (`.tape-spine-creator` to `.tape-cover-year`, about lines 999–1058)
- Test: `src/shelf.test.js` (a new describe at the end)
- Test: `src/main.test.js` (imports at lines 4–5; the shelf `covers` describe at about line 1373)

- [ ] **Step 1: Write the failing tests.** Append to `src/shelf.test.js`:

```js
describe('tape faces', () => {
  const tapeOf = id => document.querySelector(`.tape[data-id="${id}"]`)
  const spans = el => [...el.querySelectorAll('span')].map(s => [s.className, s.textContent])

  it('draws a book\'s tape with a spine and a typographic face, line for line', () => {
    mountWith([{ id: 'dune', title: 'Dune: Deluxe Edition', author: 'Frank Herbert', tags: [], year: 1965 }])
    expect(tapeOf('dune').className).toBe('tape')
    expect(tapeOf('dune').innerHTML).toBe([
      '',
      '      <div class="tape-face tape-spine" style="--len: 8.00; --shade: 0.550;">',
      '        <span class="tape-spine-title">Dune</span>',
      '        <span class="tape-spine-creator">Herbert</span>',
      '      </div>',
      '      <div class="tape-face tape-cover" style="--shade: 0.000;">',
      '        <div class="tape-cover-type">',
      '          <span class="tape-cover-creator">Frank Herbert</span>',
      '          <span class="tape-cover-title">Dune</span>',
      '          <span class="tape-cover-year">1965</span>',
      '        </div>',
      '      </div>',
      '    ',
    ].join('\n'))
  })

  it('marks the tape of an album, a podcast and an audiobook as square', () => {
    mountWith([
      ...books(1),
      { id: 'al', title: 'Abbey Road', author: 'The Beatles', tags: [], medium: 'album' },
      { id: 'po', title: 'Radiolab', author: 'WNYC', tags: [], medium: 'podcast' },
      { id: 'au', title: 'Dune', author: 'Frank Herbert', tags: [], medium: 'audiobook' },
    ])
    expect(['b0', 'al', 'po', 'au'].map(id => tapeOf(id).classList.contains('tape-square'))).toEqual([false, true, true, true])
  })

  it('draws an album\'s face as a record whose label carries the artist and short title', () => {
    mountWith([{ id: 'okc', title: 'OK Computer: OKNOTOK 1997 2017', author: 'Radiohead', tags: [], year: 1997, medium: 'album' }])
    const record = tapeOf('okc').querySelector('.tape-cover .tape-cover-type.tape-cover-record')
    expect(record).not.toBeNull()
    expect(spans(record.querySelector('.tape-record-label'))).toEqual([
      ['tape-record-creator', 'Radiohead'],
      ['tape-record-title', 'OK Computer'],
    ])
    expect(record.querySelector('.tape-cover-year')).toBeNull()
  })

  it('sets a podcast\'s face in type, with its creator, short title and year', () => {
    mountWith([{ id: 'rl', title: 'Radiolab: Season One', author: 'WNYC', tags: [], year: 2002, medium: 'podcast' }])
    const face = tapeOf('rl').querySelector('.tape-cover .tape-cover-type')
    expect(face.classList.contains('tape-cover-record')).toBe(false)
    expect(spans(face)).toEqual([
      ['tape-cover-creator', 'WNYC'],
      ['tape-cover-title', 'Radiolab'],
      ['tape-cover-year', '2002'],
    ])
  })

  it('sets a record\'s label text as text', () => {
    mountWith([{ id: 'h', title: '<b>Bold</b>', author: '<i>x</i>', tags: [], medium: 'album' }])
    const label = tapeOf('h').querySelector('.tape-record-label')
    expect(label.querySelector('b, i')).toBeNull()
    expect(label.textContent.replace(/\s+/g, ' ').trim()).toBe('<i>x</i> <b>Bold</b>')
  })
})
```

In `src/main.test.js`, replace:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spinePalette } from './spines.js'
```

with:

```js
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spinePalette } from './spines.js'

// The app's stylesheet, for tests of the shape it gives what the app draws
const STYLESHEET = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'style.css'), 'utf8')

// Puts the app's stylesheet on the page for the rest of the current test
function useStylesheet() {
  const style = document.createElement('style')
  style.textContent = STYLESHEET
  document.head.append(style)
  onTestFinished(() => style.remove())
}
```

(Build the path with `fileURLToPath` and `join` exactly as above. `readFileSync(new URL('./style.css', import.meta.url))` fails under happy-dom with `TypeError: The URL must be of scheme file`, because happy-dom replaces the global `URL`.)

In `src/main.test.js`, replace:

```js
    it('shows a cover that a refresh newly makes available', async () => {
```

with:

```js
    it('shows an album\'s art whole on paper, and a book\'s filling its face', async () => {
      useStylesheet()
      width = url => url.startsWith('https://') ? 100 : 0
      const library = MIXED.map(b => ({ ...b, tags: [...b.tags], ...(b.id === 's2-dune' ? { coverUrl: 'https://covers.example/dune.jpg' } : {}) }))
      await loadApp(library, { view: 'shelf' })
      chooseTab('all')
      const cover = id => document.querySelector(`.tape[data-id="${id}"] .tape-cover`)
      await vi.waitFor(() => expect(['abbey-road', 's2-dune'].every(id => cover(id).classList.contains('has-image'))).toBe(true))
      expect(getComputedStyle(cover('abbey-road')).backgroundSize).toBe('contain')
      expect(getComputedStyle(cover('s2-dune')).backgroundSize).toBe('cover')
    })

    it('shows a cover that a refresh newly makes available', async () => {
```

- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run src/shelf.test.js` → `Tests 3 failed | 73 passed (76)`: the square class with `AssertionError: expected [ false, false, false, false ] to deeply equal [ false, true, true, true ]`, the record with `AssertionError: expected null not to be null`, and the label text with `TypeError: Cannot read properties of null (reading 'querySelector')`. The book's line-for-line markup and the podcast's type face are guards and pass already.
  - `npx vitest run src/main.test.js -t "whole on paper"` → `Tests 1 failed | 207 skipped (208)` with `AssertionError: expected 'cover' to be 'contain'`.

- [ ] **Step 3: Draw the square faces.** In `src/shelf.js`, replace:

```js
import { captionState, starText, coverShape } from './showcase.js'
```

with:

```js
import { captionState, starText, coverShape, mediumOf } from './showcase.js'
```

In `src/shelf.js`, replace:

```js
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
```

with:

```js
// The face shown until art arrives: a record carrying the artist and short title for an album,
// otherwise the creator, short title and year set in type
function faceTypeHtml(book, title) {
  if (mediumOf(book) === 'album') {
    return `
        <div class="tape-cover-type tape-cover-record">
          <div class="tape-record-label">
            <span class="tape-record-creator">${esc(book.author || '')}</span>
            <span class="tape-record-title">${esc(title)}</span>
          </div>
        </div>`
  }
  return `
        <div class="tape-cover-type">
          <span class="tape-cover-creator">${esc(book.author || '')}</span>
          <span class="tape-cover-title">${esc(title)}</span>
          <span class="tape-cover-year">${esc(book.year || '')}</span>
        </div>`
}

function tapeHtml(book) {
  const { bg, fg } = spinePalette(book.id)
  const title = spineTitle(book.title)
  const len = Math.max(8, title.length * 0.62).toFixed(2)
  const shape = coverShape(book) === 'square' ? ' tape-square' : ''
  return `
    <div class="tape${shape}" data-id="${esc(book.id)}" style="--bg:${bg};--fg:${fg}">
      <div class="tape-face tape-spine" style="--len:${len}">
        <span class="tape-spine-title">${esc(title)}</span>
        <span class="tape-spine-creator">${esc(spineCreator(book.author))}</span>
      </div>
      <div class="tape-face tape-cover">${faceTypeHtml(book, title)}
      </div>
    </div>`
}
```

In `src/style.css`, replace:

```css
.tape-cover {
  width: var(--d);
```

with:

```css
/* A square item's spine is a CD's: its title alone, in small capitals running up it */
.tape-square .tape-spine::before,
.tape-square .tape-spine-creator { display: none; }

.tape-square .tape-spine-title {
  font-family: var(--sans);
  font-weight: 600;
  letter-spacing: 0.12em;
  transform: rotate(180deg);
}

.tape-cover {
  width: var(--d);
```

In `src/style.css`, replace:

```css
.tape-cover-type {
  position: absolute;
```

with:

```css
/* The face's type is sized from a book face's width, 2h/3, so type on a square face is the same size */
.tape-cover-type {
  --type: calc(var(--h) * 2 / 3);
  position: absolute;
```

In `src/style.css`, replace:

```css
.tape-cover.has-image .tape-cover-type { display: none; }
```

with:

```css
.tape-cover.has-image .tape-cover-type { display: none; }

/* Art on a square face is never cropped: tall art sits whole on paper */
.tape-square .tape-cover.has-image {
  background-color: var(--paper);
  background-size: contain;
  background-repeat: no-repeat;
}
```

In `src/style.css`, replace:

```css
.tape-cover-creator {
  font-family: var(--sans);
  font-weight: 600;
  font-size: calc(var(--d) * .034);
```

with:

```css
.tape-cover-creator {
  font-family: var(--sans);
  font-weight: 600;
  font-size: calc(var(--type) * .034);
```

In `src/style.css`, replace:

```css
  font-size: calc(var(--d) * .11);
```

with:

```css
  font-size: calc(var(--type) * .11);
```

In `src/style.css`, replace:

```css
.tape-cover-year {
  font-family: var(--sans);
  font-weight: 500;
  font-size: calc(var(--d) * .036);
  letter-spacing: 0.14em;
}
```

with:

```css
.tape-cover-year {
  font-family: var(--sans);
  font-weight: 500;
  font-size: calc(var(--type) * .036);
  letter-spacing: 0.14em;
}

/* An album with no art is a record in its sleeve, in its drawn cover's proportions: a disc 14% in
   from each edge, and a paper label a third of the face across carrying the artist above the
   spindle hole and the short title below it */
.tape-cover-record { padding: 0; }

.tape-cover-record::before {
  content: "";
  position: absolute;
  inset: 14%;
  border-radius: 50%;
  background: #141414;
}

.tape-record-label {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(100% / 3);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #EDE3CC;
  color: #141414;
  text-align: center;
}

.tape-record-label::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 7%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--bg);
}

.tape-record-creator {
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: 58%;
  overflow: hidden;
  font-family: var(--sans);
  font-weight: 600;
  font-size: calc(var(--type) * .03);
  letter-spacing: 0.2em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.tape-record-title {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 57%;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-family: var(--display);
  font-size: calc(var(--type) * .045);
  line-height: 1.05;
  text-transform: uppercase;
}
```

The face's padding still comes from `--d`, so a square face keeps proportionate margins; only its type is held to a book's size.

- [ ] **Step 4: Run them.** `npx vitest run src/shelf.test.js` → `Tests 76 passed (76)`. `npx vitest run src/main.test.js -t "whole on paper"` → `Tests 1 passed | 207 skipped (208)`. Then `npx vitest run` → `Tests 630 passed (630)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/shelf.js src/shelf.test.js src/style.css src/main.test.js
git commit -m "Show an album without art as a record on the shelf" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Square tiles on the Covers wall

Each tile takes its item's shape: `shape-square` or `shape-tall` replaces the `medium-*` class, whose only use was the letterbox rule this task replaces. A tile stretches the full row height as before; it becomes a flex column with its cover box at the foot, so covers in a row share a bottom edge and square covers sit lower with paper above them. Square art is never cropped: `object-fit: contain` on paper. The placeholder is drawn on a page of the item's size.

**Files:**
- Modify: `src/main.js` (imports at lines 10 and 13; `generatePlaceholder` at about line 349; `renderCoversView` at about line 693)
- Modify: `src/style.css` (the letterbox rule at about lines 393–398; `.cover-tile` at about line 560; below `.cover-img` at about line 583)
- Test: `src/main.test.js` (a new describe above `describe('shelf view', …)`)

- [ ] **Step 1: Write the failing tests.** In `src/main.test.js`, replace:

```js
describe('shelf view', () => {
```

with:

```js
describe('cover shapes on the wall', () => {
  const tile = id => document.querySelector(`.cover-tile[data-id="${id}"]`)
  const searchFor = q => {
    const search = document.querySelector('[data-action="search"]')
    search.value = q
    search.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('draws each item\'s placeholder on a page of its own shape', async () => {
    await loadApp(MIXED)
    const placeholderOf = id => {
      const last = tile(id).querySelector('.cover-img').dataset.fallbacks.split('\n').at(-1)
      const svg = decodeURIComponent(last.replace('data:image/svg+xml;charset=utf-8,', ''))
      return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    }
    const page = el => ['width', 'height', 'viewBox'].map(name => el.getAttribute(name))
    expect(page(placeholderOf('s2-dune'))).toEqual(['600', '900', '0 0 600 900'])
    expect(page(placeholderOf('radiolab'))).toEqual(['600', '600', '0 0 600 600'])
    expect(page(placeholderOf('abbey-road'))).toEqual(['600', '600', '0 0 600 600'])
    expect(placeholderOf('abbey-road').querySelectorAll('circle')).toHaveLength(3)
  })

  it('gives an Albums wall square tiles', async () => {
    useStylesheet()
    await loadApp(MIXED)
    document.querySelector('.media-tab[data-medium="album"]').click()
    const tiles = [...document.querySelectorAll('.cover-tile')]
    expect(tiles.map(t => t.dataset.id)).toEqual(['abbey-road'])
    expect(tiles.every(t => t.classList.contains('shape-square'))).toBe(true)
    expect(getComputedStyle(tiles[0].querySelector('.cover-aspect')).aspectRatio).toBe('1 / 1')
  })

  it('keeps books 2:3 and squares square on a mixed wall, each cover at the bottom of its tile', async () => {
    useStylesheet()
    await loadApp(MIXED)
    searchFor('r')
    expect(['s2-dune', 'abbey-road', 'radiolab'].every(id => tile(id))).toBe(true)
    expect(getComputedStyle(tile('s2-dune').querySelector('.cover-aspect')).aspectRatio).toBe('2 / 3')
    expect(getComputedStyle(tile('radiolab').querySelector('.cover-aspect')).aspectRatio).toBe('1 / 1')
    for (const t of document.querySelectorAll('.cover-tile')) {
      const style = getComputedStyle(t)
      expect([style.display, style.flexDirection, style.justifyContent]).toEqual(['flex', 'column', 'flex-end'])
    }
  })

  it('never crops square art: tall art in a square frame sits whole on paper', async () => {
    useStylesheet()
    const audiobook = { ...BOOKS[1], id: 'dune-audiobook', tags: [], medium: 'audiobook' }
    await loadApp([...MIXED, audiobook])
    searchFor('r')
    const img = id => getComputedStyle(tile(id).querySelector('.cover-img'))
    for (const id of ['abbey-road', 'radiolab', 'dune-audiobook']) {
      expect([img(id).objectFit, img(id).backgroundColor]).toEqual(['contain', '#EDEBE6'])
    }
    expect(img('s2-dune').objectFit).toBe('cover')
  })
})

describe('shelf view', () => {
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/main.test.js -t "cover shapes on the wall"` → `Tests 4 failed | 208 skipped (212)`:
  - the placeholder: `AssertionError: expected [ '600', '900', '0 0 600 900' ] to deeply equal [ '600', '600', '0 0 600 600' ]`
  - the Albums wall: `AssertionError: expected false to be true`
  - the mixed wall: `AssertionError: expected '2 / 3' to be '1 / 1'`
  - square art: `AssertionError: expected [ 'contain', '#141414' ] to deeply equal [ 'contain', '#EDEBE6' ]` (today's letterbox is ink, and only for albums and podcasts)

- [ ] **Step 3: Shape the wall.** In `src/main.js`, replace:

```js
import { shelfTabs, mediumOf, singular, counted } from './showcase.js'
```

with:

```js
import { shelfTabs, mediumOf, singular, counted, coverShape } from './showcase.js'
```

In `src/main.js`, replace:

```js
import { coverTypeSvg } from './spines.js'
```

with:

```js
import { coverTypeSvg, coverSize } from './spines.js'
```

In `src/main.js`, replace:

```js
function generatePlaceholder(book) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">${coverTypeSvg(book)}</svg>`
```

with:

```js
function generatePlaceholder(book) {
  const { width, height } = coverSize(book)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${coverTypeSvg(book)}</svg>`
```

In `src/main.js`, replace:

```js
        <div class="cover-tile medium-${esc(mediumOf(b))} ${offset + i === state.selectedIndex ? 'kb-selected' : ''}" data-action="open-book" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.title)}${b.author ? ` by ${esc(b.author)}` : ''}">
```

with:

```js
        <div class="cover-tile shape-${coverShape(b)} ${offset + i === state.selectedIndex ? 'kb-selected' : ''}" data-action="open-book" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.title)}${b.author ? ` by ${esc(b.author)}` : ''}">
```

In `src/style.css`, replace the letterbox rule (about line 393) and the blank line after it, so the comment that follows moves up:

```css
/* Square art (albums, podcasts) letterboxed in the standard cell */
.cover-tile.medium-album .cover-img,
.cover-tile.medium-podcast .cover-img {
  object-fit: contain;
  background: var(--ink);
}

/* ---------- Lookup results (add modal) ---------- */
```

with:

```css
/* ---------- Lookup results (add modal) ---------- */
```

In `src/style.css`, replace:

```css
.cover-tile {
  position: relative;
  cursor: pointer;
```

with:

```css
/* A tile fills its row; its cover sits at the bottom, so covers in a row share a bottom edge */
.cover-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  cursor: pointer;
```

In `src/style.css`, replace:

```css
.cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

with:

```css
.cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* A square item's cover is square, and its art is never cropped: tall art sits whole on paper */
.cover-tile.shape-square .cover-aspect { aspect-ratio: 1 / 1; }

.cover-tile.shape-square .cover-img {
  object-fit: contain;
  background: var(--paper);
}
```

The hover overlay is `position: absolute; inset: 0` on the tile, so it still covers the whole tile; the list view has no covers and doesn't change.

- [ ] **Step 4: Run them.** `npx vitest run src/main.test.js -t "cover shapes on the wall"` → `Tests 4 passed | 208 skipped (212)`. Then `npx vitest run` → `Tests 634 passed (634)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js src/style.css
git commit -m "Draw albums, podcasts and audiobooks square on the wall" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: A square poster in the detail view

`posterHtml` follows the shape: the viewBox, the clip rectangle, the `<image>` size (`meet` for a square item, so its art is never cropped; `slice` for a tall one, as today), the mask and filter regions (the page plus 200 on every side), and the ink blobs, whose heights are scaled into the square (`Math.round(cy * height / 900)`, which leaves a tall poster's blobs exactly where they are). The reveal radius of 900 already covers a 600×600 square's diagonal and stays. The poster gets `shape-square` or `shape-tall`, and the stylesheet sizes a square poster 1:1, on the wide layout and the narrow one.

**Files:**
- Modify: `src/overlay.js` (imports at lines 5–6; `INK_BLOBS` at line 9; `posterHtml` at lines 31–54)
- Modify: `src/style.css` (`.detail-poster` at about line 1429; the narrow layout at about line 1525)
- Test: `src/overlay.test.js` (a new describe above `describe('renderDetail — signed in', …)`)
- Test: `src/main.test.js` (a new describe above `describe('detail motion', …)`)

- [ ] **Step 1: Write the failing tests.** In `src/overlay.test.js`, replace:

```js
describe('renderDetail — signed in', () => {
```

with:

```js
describe('renderDetail — poster shape', () => {
  const ALBUM = { ...DUNE, id: 'abbey-road', title: 'Abbey Road', author: 'The Beatles', medium: 'album' }
  const attrs = (sel, names) => names.map(name => $(sel).getAttribute(name))
  const blobs = () => [...document.querySelectorAll('.detail-ink-blob')].map(b => [b.getAttribute('cx'), b.getAttribute('cy')])

  it('draws a book\'s poster on a 600 by 900 page, its art filling the page', () => {
    show(DUNE)
    expect($('.detail-poster').className).toBe('detail-poster shape-tall')
    expect($('.detail-poster svg').getAttribute('viewBox')).toBe('0 0 600 900')
    expect(attrs('#detail-clip rect', ['width', 'height'])).toEqual(['600', '900'])
    expect(attrs('.detail-cover-image', ['width', 'height', 'preserveAspectRatio'])).toEqual(['600', '900', 'xMidYMid slice'])
    expect(attrs('#detail-ink', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1300'])
    expect(attrs('#detail-ink-filter', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1300'])
    expect(blobs()).toEqual([['190', '330'], ['430', '600'], ['316', '120'], ['114', '760'], ['506', '250'], ['329', '860'], ['291', '470']])
  })

  it('draws a square item\'s poster on a 600 by 600 page, its art whole within it', () => {
    show(ALBUM)
    expect($('.detail-poster').className).toBe('detail-poster shape-square')
    expect($('.detail-poster svg').getAttribute('viewBox')).toBe('0 0 600 600')
    expect(attrs('#detail-clip rect', ['width', 'height'])).toEqual(['600', '600'])
    expect(attrs('.detail-cover-image', ['width', 'height', 'preserveAspectRatio'])).toEqual(['600', '600', 'xMidYMid meet'])
    expect(attrs('#detail-ink', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1000'])
    expect(attrs('#detail-ink-filter', ['x', 'y', 'width', 'height'])).toEqual(['-200', '-200', '1000', '1000'])
    // The blobs land at the same places, with their heights scaled into the square
    expect(blobs()).toEqual([['190', '220'], ['430', '400'], ['316', '80'], ['114', '507'], ['506', '167'], ['329', '573'], ['291', '313']])
  })

  it('draws an album\'s record under its art', () => {
    show(ALBUM)
    const inked = $('.detail-poster [mask]')
    expect(inked.querySelectorAll('circle')).toHaveLength(3)
    expect(inked.lastElementChild.classList.contains('detail-cover-image')).toBe(true)
  })
})

describe('renderDetail — signed in', () => {
```

In `src/main.test.js`, replace:

```js
describe('detail motion', () => {
```

with:

```js
describe('detail poster shape', () => {
  it('gives an album a square poster and a book a 2:3 one', async () => {
    useStylesheet()
    await loadApp(MIXED)
    const posterRatio = () => getComputedStyle(document.querySelector('.detail-poster')).aspectRatio
    document.querySelector('.cover-tile[data-id="abbey-road"]').click()
    expect(posterRatio()).toBe('1 / 1')
    document.querySelector('[data-action="close-detail"]').click()
    document.querySelector('.cover-tile[data-id="s2-dune"]').click()
    expect(posterRatio()).toBe('2 / 3')
  })
})

describe('detail motion', () => {
```

- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run src/overlay.test.js` → `Tests 2 failed | 20 passed (22)`: the book with `AssertionError: expected 'detail-poster' to be 'detail-poster shape-tall'`, the square item with `AssertionError: expected 'detail-poster' to be 'detail-poster shape-square'`. The record-under-art test is a guard and passes already.
  - `npx vitest run src/main.test.js -t "detail poster shape"` → `Tests 1 failed | 212 skipped (213)` with `AssertionError: expected '2 / 3' to be '1 / 1'`.

- [ ] **Step 3: Shape the poster.** In `src/overlay.js`, replace:

```js
import { coverTypeSvg } from './spines.js'
import { singular } from './showcase.js'
```

with:

```js
import { coverTypeSvg, coverSize } from './spines.js'
import { singular, coverShape } from './showcase.js'
```

In `src/overlay.js`, replace:

```js
const INK_BLOBS = [[190, 330, 0], [430, 600, 120], [316, 120, 220], [114, 760, 300], [506, 250, 360], [329, 860, 420], [291, 470, 180]]
```

with:

```js
// Where the ink blobs land on a 600×900 poster, with their delays; a square poster scales their heights into it
const INK_BLOBS = [[190, 330, 0], [430, 600, 120], [316, 120, 220], [114, 760, 300], [506, 250, 360], [329, 860, 420], [291, 470, 180]]
```

In `src/overlay.js`, replace:

```js
function posterHtml(book, settled) {
  const radius = settled ? 900 : 0
  return `
    <div class="detail-poster">
      <svg viewBox="0 0 600 900" aria-hidden="true">
        <defs>
          <filter id="detail-ink-filter" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1000" height="1300">
```

with:

```js
// A square item's art is shown whole on its square page; a tall item's fills its page
function posterHtml(book, settled) {
  const radius = settled ? 900 : 0
  const shape = coverShape(book)
  const { width, height } = coverSize(book)
  return `
    <div class="detail-poster shape-${shape}">
      <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <defs>
          <filter id="detail-ink-filter" filterUnits="userSpaceOnUse" x="-200" y="-200" width="${width + 400}" height="${height + 400}">
```

In `src/overlay.js`, replace:

```js
          <mask id="detail-ink" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1000" height="1300">
            <g filter="url(#detail-ink-filter)" fill="#fff">
              ${INK_BLOBS.map(([cx, cy, delay]) => `<circle class="detail-ink-blob" cx="${cx}" cy="${cy}" r="${radius}" data-delay="${delay}"/>`).join('')}
            </g>
          </mask>
          <clipPath id="detail-clip"><rect width="600" height="900" rx="4"/></clipPath>
        </defs>
        <g clip-path="url(#detail-clip)"><g mask="url(#detail-ink)">
          ${coverTypeSvg(book)}
          <image class="detail-cover-image" width="600" height="900" preserveAspectRatio="xMidYMid slice"/>
```

with:

```js
          <mask id="detail-ink" maskUnits="userSpaceOnUse" x="-200" y="-200" width="${width + 400}" height="${height + 400}">
            <g filter="url(#detail-ink-filter)" fill="#fff">
              ${INK_BLOBS.map(([cx, cy, delay]) => `<circle class="detail-ink-blob" cx="${cx}" cy="${Math.round(cy * height / 900)}" r="${radius}" data-delay="${delay}"/>`).join('')}
            </g>
          </mask>
          <clipPath id="detail-clip"><rect width="${width}" height="${height}" rx="4"/></clipPath>
        </defs>
        <g clip-path="url(#detail-clip)"><g mask="url(#detail-ink)">
          ${coverTypeSvg(book)}
          <image class="detail-cover-image" width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${shape === 'square' ? 'meet' : 'slice'}"/>
```

In `src/style.css`, replace:

```css
.detail-poster {
  align-self: center;
  justify-self: center;
  width: min(100%, calc(min(100vh - 166px, 78vh) * 2 / 3));
  aspect-ratio: 2 / 3;
}
```

with:

```css
.detail-poster {
  align-self: center;
  justify-self: center;
  width: min(100%, calc(min(100vh - 166px, 78vh) * 2 / 3));
  aspect-ratio: 2 / 3;
}

.detail-poster.shape-square {
  width: min(100%, min(100vh - 166px, 78vh));
  aspect-ratio: 1 / 1;
}
```

In `src/style.css`, replace:

```css
  .detail-poster { order: -1; width: min(100%, calc(46svh * 2 / 3)); }
```

with:

```css
  .detail-poster { order: -1; width: min(100%, calc(46svh * 2 / 3)); }
  .detail-poster.shape-square { width: min(100%, 46svh); }
```

The narrow layout needs its own square rule: `.detail-poster.shape-square` above has two classes, so it would otherwise beat the narrow layout's one-class `.detail-poster` width.

- [ ] **Step 4: Run them.** `npx vitest run src/overlay.test.js` → `Tests 22 passed (22)`. `npx vitest run src/main.test.js -t "detail poster shape"` → `Tests 1 passed | 212 skipped (213)`. Then `npx vitest run` → `Tests 638 passed (638)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/overlay.js src/overlay.test.js src/style.css src/main.test.js
git commit -m "Show an album, podcast or audiobook on a square poster in the detail view" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Square art sits on paper once it loads

Tall art on a square poster (an audiobook carrying its print cover) is shown whole, so the poster needs paper behind it. The paper must not hide the record or type cover of an item with no art, so it shows only once art has loaded: `afterDetailRender` already sets the `<image>`'s `href` when `resolveCover` finds art, and now also marks the poster `has-art`; the stylesheet shows the paper only on a poster marked so.

**Files:**
- Modify: `src/overlay.js` (`posterHtml`, from Task 10)
- Modify: `src/main.js` (`afterDetailRender`, at about line 1054)
- Modify: `src/style.css` (below `.detail-poster svg`, at about line 1441)
- Test: `src/overlay.test.js` (a new describe above `describe('renderDetail — signed in', …)`)
- Test: `src/main.test.js` (a new describe above `describe('detail motion', …)`)

- [ ] **Step 1: Write the failing tests.** In `src/overlay.test.js`, replace:

```js
describe('renderDetail — signed in', () => {
```

with:

```js
describe('renderDetail — paper behind square art', () => {
  it('lays paper the size of a square page between the drawn cover and the art', () => {
    show({ ...DUNE, medium: 'podcast' })
    const paper = $('.detail-cover-paper')
    expect(['width', 'height'].map(name => paper.getAttribute(name))).toEqual(['600', '600'])
    expect(paper.nextElementSibling.classList.contains('detail-cover-image')).toBe(true)
  })

  it('lays no paper under a book\'s art, which fills its page', () => {
    show(DUNE)
    expect($('.detail-cover-paper')).toBeNull()
  })
})

describe('renderDetail — signed in', () => {
```

In `src/main.test.js`, replace:

```js
describe('detail motion', () => {
```

with:

```js
describe('detail poster art', () => {
  const IN_RAINBOWS = { id: 'in-rainbows', title: 'In Rainbows', author: 'Radiohead', tags: [], isbn: null, coverUrl: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: 2007, medium: 'album' }
  const poster = () => document.querySelector('.detail-poster')
  const paperVisibility = () => getComputedStyle(document.querySelector('.detail-cover-paper')).visibility

  beforeEach(() => {
    // Stands in for the network: art on https:// loads, nothing else does
    vi.stubGlobal('Image', class {
      set src(url) {
        queueMicrotask(() => {
          if (url.startsWith('https://')) { this.naturalWidth = 600; this.onload?.() } else this.onerror?.()
        })
      }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows an album\'s art on paper once it loads', async () => {
    useStylesheet()
    await loadApp(MIXED)
    document.querySelector('.cover-tile[data-id="abbey-road"]').click()
    await vi.waitFor(() => expect(document.querySelector('.detail-cover-image').getAttribute('href')).toBe('https://art.example/abbey.jpg'))
    expect(poster().classList.contains('has-art')).toBe(true)
    expect(paperVisibility()).toBe('visible')
  })

  it('keeps an album\'s record showing while it has no art', async () => {
    useStylesheet()
    await loadApp([...MIXED, IN_RAINBOWS])
    document.querySelector('.cover-tile[data-id="in-rainbows"]').click()
    // Its one candidate, the local cover, fails to load
    await new Promise(r => setTimeout(r, 0))
    expect(document.querySelector('.detail-cover-image').hasAttribute('href')).toBe(false)
    expect(poster().classList.contains('has-art')).toBe(false)
    expect(paperVisibility()).toBe('hidden')
    expect(poster().querySelectorAll('[mask] circle')).toHaveLength(3)
  })
})

describe('detail motion', () => {
```

- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run src/overlay.test.js` → `Tests 1 failed | 23 passed (24)`: the paper with `TypeError: Cannot read properties of null (reading 'getAttribute')`. The no-paper-under-a-book test is a guard and passes already.
  - `npx vitest run src/main.test.js -t "detail poster art"` → `Tests 2 failed | 213 skipped (215)`: the album with art with `AssertionError: expected false to be true` (no `has-art`), the album without with `TypeError: Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.` (no paper yet).

- [ ] **Step 3: Lay paper under square art and show it once art loads.** In `src/overlay.js`, replace:

```js
// A square item's art is shown whole on its square page; a tall item's fills its page
```

with:

```js
// A square item's art is shown whole, on paper, on its square page; a tall item's fills its page
```

In `src/overlay.js`, replace:

```js
          ${coverTypeSvg(book)}
          <image class="detail-cover-image" width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${shape === 'square' ? 'meet' : 'slice'}"/>
```

with:

```js
          ${coverTypeSvg(book)}
          ${shape === 'square' ? `<rect class="detail-cover-paper" width="${width}" height="${height}"/>` : ''}
          <image class="detail-cover-image" width="${width}" height="${height}" preserveAspectRatio="xMidYMid ${shape === 'square' ? 'meet' : 'slice'}"/>
```

In `src/main.js`, replace:

```js
    const img = document.querySelector('.detail-cover-image')
    if (url && img && state.selected?.id === book.id) img.setAttribute('href', url)
```

with:

```js
    const img = document.querySelector('.detail-cover-image')
    if (url && img && state.selected?.id === book.id) {
      img.setAttribute('href', url)
      // The paper behind square art shows only once there is art on it
      img.closest('.detail-poster').classList.add('has-art')
    }
```

In `src/style.css`, replace:

```css
.detail-poster svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
```

with:

```css
.detail-poster svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* The paper behind a square item's art; until art loads, the drawn cover shows instead */
.detail-cover-paper { fill: var(--paper); visibility: hidden; }
.detail-poster.has-art .detail-cover-paper { visibility: visible; }
```

- [ ] **Step 4: Run them.** `npx vitest run src/overlay.test.js` → `Tests 24 passed (24)`. `npx vitest run src/main.test.js -t "detail poster art"` → `Tests 2 passed | 213 skipped (215)`. Then `npx vitest run` → `Tests 642 passed (642)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/overlay.js src/overlay.test.js src/main.js src/main.test.js src/style.css
git commit -m "Show square art whole on paper in the detail view, keeping the record until art loads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Square options in the cover picker

The picker frames its options by `coverShape` of the item being edited (`state.selected`), not by `activeMedium()`, which follows the route and says `book` on mixed views. The tests open the picker from the landing wall, a mixed view, so `activeMedium()` would be wrong there.

**Files:**
- Modify: `src/main.js` (`renderCoverPicker`, `.cover-picker-grid` at about line 788)
- Modify: `src/style.css` (below `.cover-option-img-wrap img`, at about line 1720)
- Test: `src/main.test.js` (a new describe above `describe('shelf identity', …)`)

- [ ] **Step 1: Write the failing test.** In `src/main.test.js`, replace:

```js
describe('shelf identity', () => {
```

with:

```js
describe('cover picker shape', () => {
  // Open Library answers with one cover, so the picker has an option to frame
  function answerOneCover() {
    const respond = fetch.getMockImplementation()
    fetch.mockImplementation(async (url, opts = {}) => String(url).startsWith('https://openlibrary.org/search.json')
      ? { ok: true, json: async () => ({ docs: [{ title: 'A Cover', author_name: ['Someone'], cover_i: 42 }] }) }
      : respond(url, opts))
  }

  async function pickerOptionFor(id) {
    useStylesheet()
    await loadApp(MIXED)
    answerOneCover()
    document.querySelector(`.cover-tile[data-id="${id}"]`).click()
    document.querySelector('[data-action="open-cover-picker"]').click()
    await vi.waitFor(() => {
      if (!document.querySelector('.cover-option-img-wrap')) throw new Error('no options yet')
    })
    const wrap = document.querySelector('.cover-option-img-wrap')
    return { wrap: getComputedStyle(wrap), img: getComputedStyle(wrap.querySelector('img')) }
  }

  it('frames an album\'s options square, showing any art whole', async () => {
    const { wrap, img } = await pickerOptionFor('abbey-road')
    expect([wrap.aspectRatio, img.objectFit]).toEqual(['1 / 1', 'contain'])
  })

  it('frames a book\'s options 2:3', async () => {
    const { wrap, img } = await pickerOptionFor('s2-dune')
    expect([wrap.aspectRatio, img.objectFit]).toEqual(['2 / 3', 'cover'])
  })
})

describe('shelf identity', () => {
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/main.test.js -t "cover picker shape"` → `Tests 1 failed | 1 passed | 215 skipped (217)`: the album with `AssertionError: expected [ '2 / 3', 'cover' ] to deeply equal [ '1 / 1', 'contain' ]`. The book's is a guard and passes already.

- [ ] **Step 3: Shape the options.** In `src/main.js`, replace:

```js
            <div class="cover-picker-grid">
```

with:

```js
            <div class="cover-picker-grid shape-${coverShape(b)}">
```

In `src/style.css`, replace:

```css
.cover-option-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

with:

```css
.cover-option-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* A square item's options are square, and their art is never cropped */
.cover-picker-grid.shape-square .cover-option-img-wrap { aspect-ratio: 1 / 1; }
.cover-picker-grid.shape-square .cover-option-img-wrap img { object-fit: contain; }
```

- [ ] **Step 4: Run it.** `npx vitest run src/main.test.js -t "cover picker shape"` → `Tests 2 passed | 215 skipped (217)`. Then `npx vitest run` → `Test Files 24 passed (24)`, `Tests 644 passed (644)`, pristine.

- [ ] **Step 5: Commit.**

```bash
git add src/main.js src/main.test.js src/style.css
git commit -m "Frame an album's cover choices square" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Look at it on Jason's library, at desktop and phone sizes

**Controller runs this, not a subagent.** It is read-only. Jason's dev server (ports 5173 and 3001) runs against his real library: only look, step, drag, scroll and open. Never click stars, edit a field, choose a cover in the picker or paste a URL there, Remove, Import, or Find missing covers, and never send POST/PUT/PATCH/DELETE. Opening the cover picker is fine (it only searches Open Library and Google Books); close it with Cancel.

**Files:** none, unless something needs fixing (then stop and agree a fix with Jason first; any fix is its own test-first task).

- [ ] **Step 1: Open the app.** If Jason's dev server is running, open `http://localhost:5173` in the browser pane. If it isn't, ask Jason to start it (`npm run dev` in his Terminal panel); don't start a second one against his database.
- [ ] **Step 2: The shelf at desktop size.** Set the pane to 1280×800 (`resize_window` with `width: 1280, height: 800`). On the shelf, open the Albums tab. Check, with screenshots:
  - Albums show full-height square faces; one without art shows a record (black disc, paper label with the artist above the spindle hole and the title below) on its cloth colour, and found art fills its square.
  - Album spines are about half a book spine's width, with the title alone, running up.
  - Step with the arrows and the arrow keys: the glide is smooth, and the open button sits at the square face's bottom-left corner once settled.
  - Drag a few items each way: the item under the pointer stays roughly under it. Turn the wheel a notch or two: it moves about as far as on the Books tab.
  - On the All tab, step from a book to an album and back several times: no jump mid-glide, and a book's face type is the same size as a podcast's.
  - Open the Podcasts and Audiobooks tabs if Jason has them: square faces with type covers; an audiobook's tall print cover sits whole on paper.
- [ ] **Step 3: The shelf at phone size.** Set the pane to the `mobile` preset and repeat the Albums and All checks briefly. Expect a square face about 80% of the shelf's width, so only slivers of the neighbouring spines show beside an album (the spec chose no width cap); note for Jason how it looks.
- [ ] **Step 4: The wall.** Back at 1280×800, switch to Covers. On the Albums wall, every tile is square, a clean grid. Search for something that hits books and albums alike: books stay 2:3, squares sit at the bottom of their tiles with paper above, covers in a row share a bottom edge, hover shows the overlay over the whole tile, and the arrow keys still move row by row. Repeat at the `mobile` preset.
- [ ] **Step 5: The detail and the picker.** Open an album with art (square poster, art whole), an album without art (the record, no paper hiding it), and a book (unchanged 2:3 poster). If Jason has an audiobook with a tall cover, open it: the cover whole on paper. Open Change Cover on an album, check the options are square with nothing cropped, then Cancel. Check the detail at the `mobile` preset too.
- [ ] **Step 6: Reset and report.** Reset the pane with the `desktop` preset. Report to Jason what looked right and anything odd, with screenshots. Don't fix anything without his go-ahead.

---

## Spec coverage check

| Spec item | Task |
|---|---|
| `coverShape` beside `mediumOf`: square for album, podcast, audiobook; tall otherwise, including no medium | 1 |
| Shape from the medium, so items without art are square too | 1, 2, 3 |
| Square type cover for podcasts and audiobooks; tall covers byte for byte unchanged | 2 |
| Record for an album with no art: cloth colour, disc 14% in, paper label with artist and short title, spindle hole, escaped text, 600×600 | 3 |
| A way to get the cover's page size (`coverSize`), so callers don't hard-code 900 | 2, 9, 10 |
| Per-item spine and face sizes, set on each tape | 6 |
| Slot offsets add up actual strides; the open face pushes by its own width; blended mid-glide, continuous; wrap | 4, 6 |
| Open button, "Open" hover zone and settle distance use the centred item's face; visibility limit allows for the widest face | 6 |
| Drag and wheel convert pixels with the actual widths; a books-only shelf unchanged | 5, 7 |
| Square face: record for albums, three-span type for podcasts and audiobooks; tall markup unchanged | 8 |
| CD spine about half a book's, title in small capitals running up | 6 (width), 8 (style) |
| Face type sized from a fixed `2h/3` | 8 |
| Found art on a square face uses `contain` on paper | 8 |
| Wall tiles take their shape; mixed walls put covers at the foot of their tiles; overlay covers the whole tile; letterbox rule replaced by a shape rule | 9 |
| Square art never cropped: wall (`contain`), poster (`meet` on paper), shelf face (`contain` on paper) | 8, 9, 10, 11 |
| `generatePlaceholder` on a page of the item's size | 9 |
| Detail poster: viewBox, clip, `<image>` with `meet`, mask and filter regions, scaled ink blobs; poster CSS 1:1 including the narrow layout | 10 |
| Paper backing only once art loads; an album with no art still shows its record | 11 |
| Cover picker options square by the item's shape, not `activeMedium()` | 12 |
| Manual, read-only check at desktop and phone sizes | 13 |

Not covered by an automated test, by the nature of the thing: the 3D look of the CD spine and the HTML record (Task 13 checks them by eye), the "Open" hover zone and settle distance at a square face (they read the same `sizeAt` value the tested open button reads), and the narrow-layout poster width (happy-dom's window is a wide one).
