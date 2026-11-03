# Square covers for albums, podcasts and audiobooks

Agreed with Jason on 2026-11-03, using mockups in the brainstorming companion.

## Why

Every cover in Shelf is drawn 2:3, the shape of a book. Album and podcast art
is always square, and most audiobook art is too, so today that art is either
cropped to a tall frame or letterboxed in one. Jason now has 1,804 albums, most
of them still showing the typographic cover until Find missing covers reaches
them.

## Which items are square

`coverShape(item)` in `src/showcase.js`, next to `mediumOf`, returns `'square'`
for the `album`, `podcast` and `audiobook` media and `'tall'` for everything
else, including an item with no medium. Every view asks it; nothing else
decides shape from the medium. The existing CSS rule that letterboxes album and
podcast art on the wall by medium (`.cover-tile.medium-album .cover-img`,
`.cover-tile.medium-podcast .cover-img`, style.css ~394) is replaced by a rule
keyed on the shape.

The shape comes from the medium, not from the image, so it is known before
anything loads, and items whose art hasn't been found yet are square too.

**Art never gets cropped in a square frame.** Square art fills it exactly.
Tall art on a square item (an audiobook carrying its print cover) is shown
whole, centred on the paper colour (`var(--paper)`). This holds in all three
places art appears: the wall (`object-fit: contain`), the detail poster
(`preserveAspectRatio="xMidYMid meet"` over a paper-coloured rectangle) and the
shelf face (`background-size: contain` on the paper colour). Tall items keep
today's behaviour everywhere.

## The typographic cover

`coverTypeSvg(book)` in `src/spines.js` draws the cover for an item with no art.
It gains the square shape:

- An **album** with no art is a record in its sleeve: the item's cloth colour
  fills the square, a near-black disc sits inset about 14% from each edge, and a
  round centre label in the light paper colour carries the artist and the short
  title, with a small spindle hole in the disc colour so it shows on every
  label. A thin rim in the sleeve's light colour (its `fg`, at about 45%
  opacity) edges the disc, so it stands out on the near-black sleeve; on light
  sleeves `fg` is dark and the rim disappears into the disc. Label lines too
  long for the label (one long word, or unspaced non-Latin text) are cut with
  an ellipsis. Same palette and type families as today.
- A **podcast** or **audiobook** with no art gets today's type cover (creator,
  short title, year) set in a square.
- Tall items are unchanged, and their output stays byte for byte the same.

It draws shapes for a 600×600 viewBox when square and 600×900 when tall, and
exports a way to get that viewBox (for example `coverViewBox(book)`), so callers
wrap it without hard-coding 900.

## The 3D shelf

A square item opens as a **full-height square face**, so its face is as wide as
the shelf is tall. Its spine is a **CD spine**: about half a book spine's width,
with the title in small capitals running up it.

### The face

The shelf face is HTML, not SVG: `tapeHtml` in `src/shelf.js` builds a
`.tape-cover-type` block of three spans. It keeps doing so:

- Tall items: exactly today's markup.
- Square podcasts and audiobooks: the same three-span markup in the square face.
- Square albums: a record drawn in HTML and CSS (a disc and a centre label
  carrying artist and short title), matching the SVG record's proportions.

The face's type is sized from a fixed `2h/3` measure, not from the face width,
so a square face's text is the same size as a book face's rather than half as
big again. Found art on a square face uses `background-size: contain` on the
paper colour.

### Spacing per item

Today every item shares one spine width and one face width (CSS variables
`--ws` and `--d` set once on the stage in `measure`), and `slotOffset` in
`src/carousel.js` places each slot from one stride. That changes to sizes per
item:

- Each item has its own spine width and face width. Books: spine `0.165h`, face
  `2h/3`, as today. Square items: spine `0.08h`, face `h`. The gap between items
  stays `0.03h`.
- The sizes are set on each item's element rather than on the stage, so each 3D
  box draws at its own size.
- Slot positions add up the actual spine widths (plus gaps) between the centre
  and each slot, rather than multiplying one stride. The open face pushes its
  neighbours apart by its own width. Partway through a glide the push blends
  between the widths of the two items either side, so a mixed tab glides with
  no jump: offsets are continuous in the position.
- Long lists still wrap by laying three copies end to end, as today.
- Everything that used the one face width uses the centred item's instead: the
  open button's position, the "Open" hover zone over the cover, and the settle
  distance. The visibility limit allows for the widest face on the shelf.
- **Drag and wheel** turn pixels into positions using the actual widths too, not
  the one `stride()`: a drag keeps the item under the finger under the finger,
  across books and albums alike, and a wheel notch moves the same distance in
  pixels as today.
- A list of only books lays out, glides, drags and scrolls exactly as it does
  today.

### Phones

No width cap is added. The main rules hold the shelf height to at most 31% of
the shelf's width on desktop and 80% on phones. The short-landscape rule
(`@container (max-height: 340px)`) has no width term, but it only applies to
wide, short shelves. The 96px and 120px floors could overrun only on a shelf
narrower than about 280px, where a book face is already cramped.

## The Covers wall

Each tile takes its item's shape:

- A wall of only square items (an Albums, Podcasts or Audiobooks view) is
  therefore a clean grid of squares, like a record shop, with no special case.
- On a mixed wall, books stay 2:3 and square items are square. The tile itself
  still stretches the full row height, so the grid's rules stay unbroken; only
  the cover box sits at the bottom of its tile, so covers in a row share a
  bottom edge and square covers sit lower with paper above them. Order and the
  arrow keys stay row by row. The hover overlay keeps covering the whole tile.
- The list view has no covers and does not change.

## The detail view

A square item gets a square poster. In `posterHtml` (`src/overlay.js`) these
follow the shape:

- the SVG viewBox
- the clip rectangle
- the `<image>` size, which uses `meet` on paper, as above. The paper
  backing appears only once art has loaded (when the image gets its `href`),
  so an item with no art still shows its record or type cover
- the mask and filter regions
- the ink blobs' positions, which are scaled into the square

The reveal radius (900 in `posterHtml` and in `revealInk`) already covers a
600×600 square's diagonal and stays. The poster's sizing rules (style.css ~1432
and the narrow layout at ~1525) use a 1:1 ratio instead of 2:3 for a square
item.

## The cover picker

The picker frames its options by `coverShape` of the item being edited (not by
`activeMedium()`, which follows the route and says `book` on mixed views), so
an album's options are square (`.cover-option-img-wrap`, style.css ~1704).

## Every hard-coded tall shape this touches

- **`generatePlaceholder`** in `src/main.js` (~350): its 600×900 SVG wrapper.
- **`posterHtml`** in `src/overlay.js`: the viewBox, clip rectangle, `<image>`
  size, the 1000×1300 mask and filter regions, and `INK_BLOBS` (y values up to
  860).
- **`coverTypeSvg`**: its comment and its layout constants.
- **2:3 ratios in `src/style.css`:**
  - `.cover-aspect` (~573)
  - `.detail-poster` (~1432–1433, ~1525)
  - `.cover-option-img-wrap` (~1704)
- **Shelf sizes:** `measure` in `src/shelf.js` sets the single `--ws` and `--d`,
  and `.tape-cover-type` sizes its type from `--d`.

## Out of scope

- Detecting a cover's real shape from the image.
- A per-item shape setting.
- Any change to data, the server or the import.

## Testing

- **`src/carousel.test.js`:** the per-item slot offsets match today's numbers
  exactly for a list of books. They are correct for all-square and mixed lists,
  continuous across a glide between a book and an album, and still right when
  wrapping. Pixel-to-position conversion for drag: dragging by an item's stride
  moves exactly one item, for books, albums and a mix.
- **`src/showcase.test.js`:** `coverShape` for each medium and for an item with
  no medium.
- **`src/spines.test.js`:**
  - the record cover for an album: cloth colour, disc, label text escaped, a
    600×600 viewBox
  - the square type cover for a podcast and for an audiobook
  - tall covers byte for byte unchanged
- **`src/shelf.test.js`:**
  - square items get their own spine and face sizes
  - an album's face has the record markup, and a podcast's has the type markup
  - a books-only shelf's markup and sizes are unchanged
- **`src/main.test.js`:**
  - an Albums-only wall has square tiles
  - a mixed wall puts each cover at the bottom of its tile
  - square art is never cropped
  - an album's detail poster is square, and its image uses `meet`
  - an album with no art still shows the record in the poster
  - the cover picker's options are square for an album
- **Manual, read-only:** the shelf (glide, drag, wheel), the wall and the detail
  view on Jason's real library, in the browser pane at desktop and phone sizes.
