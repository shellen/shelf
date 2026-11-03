# Square covers for albums, podcasts and audiobooks

Agreed with Jason on 2026-11-03, using mockups in the brainstorming companion.

## Why

Every cover in Shelf is drawn 2:3, the shape of a book. Album and podcast art
is always square, and most audiobook art is too, so today that art is cropped to
a tall frame. Jason now has 1,804 albums, most of them still showing the
typographic cover until Find missing covers reaches them.

## Which items are square

`coverShape(item)` in `src/showcase.js`, next to `mediumOf`, returns `'square'`
for the `album`, `podcast` and `audiobook` media and `'tall'` for everything
else. Every view asks it; none checks the medium itself.

The shape comes from the medium, not from the image, so it is known before
anything loads and covers nothing has been found for yet are square too. Tall
art on a square item (an audiobook carrying its print cover) is shown whole,
centred on the paper colour, never cropped. Square art on a tall item keeps
today's behaviour.

## The typographic cover

`coverTypeSvg(book)` in `src/spines.js` draws the cover for an item with no art.
It gains the square shape:

- An **album** with no art is a record in its sleeve: the item's cloth colour
  fills the square, a near-black disc sits inset about 14% from each edge, and a
  round centre label in the light paper colour carries the artist and the short
  title, with a small spindle hole. Same palette and type families as today.
- A **podcast** or **audiobook** with no art gets today's type cover (creator,
  short title, year) set in a square.
- Tall items are unchanged, and their output stays byte for byte the same.

The function returns shapes sized for its own viewBox (600×600 square, 600×900
tall); callers that wrap it in an `<svg>` take the viewBox from the shape.

## The 3D shelf

A square item opens as a **full-height square face**, so its face is as wide as
the shelf is tall. Its spine is a **CD spine**: about half a book spine's width,
with the title in small capitals running up it.

Today every item on the shelf shares one spine width and one face width (CSS
variables `--ws` and `--d` set once on the stage), and `slotOffset` in
`src/carousel.js` places each slot from one stride. That changes to sizes per
item:

- Each item has its own spine width and face width. Books: spine `0.165h`, face
  `2h/3`, as today. Square items: spine about `0.08h`, face `h`. The gap between
  items stays `0.03h`.
- The sizes are set on each item's element rather than on the stage, so each 3D
  box draws at its own size.
- Slot positions add up the actual spine widths (plus gaps) between the centre
  and each slot, rather than multiplying one stride. The open face pushes its
  neighbours apart by its own width. Partway through a glide the push blends
  between the widths of the two items either side, so a mixed tab glides with
  no jump.
- Long lists still wrap by laying three copies end to end, as today.
- Everything that used the one face width uses the centred item's instead: the
  open button's position, the "Open" hover zone over the cover, and the settle
  distance. The visibility limit allows for the widest face.
- A list of only books lays out exactly as it does today.

No width cap is needed on phones: every `--shelf-h` rule keeps the shelf height
at or below 80% of the shelf's width, so a full-height square always fits.

## The Covers wall

- When the wall shows only square items (the Albums, Podcasts or Audiobooks
  route), every tile is square: a clean grid, like a record shop.
- On a mixed wall, books stay 2:3 and square items are square, and each row is
  aligned along its bottom edge, so square tiles sit lower with a gap above.
  Order and the arrow keys stay row by row.
- The list view has no covers and does not change.

## The detail view

A square item gets a square poster. The SVG viewBox, the clip rectangle, the ink
reveal's mask and its blobs follow the shape, and the poster's sizing rules
(desktop and the narrow single-column layout) use a 1:1 ratio instead of 2:3.
The found-cover `<image>` fills the square the same way it fills the tall
poster today.

## The cover picker

Choosing art for a square item shows the options in square frames.

## Out of scope

- Detecting a cover's real shape from the image.
- A per-item shape setting.
- Any change to data, the server or the import.

## Testing

- `src/carousel.test.js`: the per-item slot offsets match today's numbers
  exactly for a list of books; they are correct for all-square lists and mixed
  lists; there is no jump at any point of a glide between a book and an album
  (offsets are continuous in the position); wrapping still works.
- `src/showcase.test.js`: `coverShape` for each medium, and for an item with no
  medium.
- `src/spines.test.js`: the record cover for an album (cloth colour, disc, label
  text escaped, viewBox 600×600); the square type cover for a podcast and an
  audiobook; tall covers unchanged.
- `src/shelf.test.js`: square items get their own spine and face sizes and a
  record or square type cover on the face; a books-only shelf is unchanged.
- `src/main.test.js`: an Albums-only wall has square tiles; a mixed wall aligns
  rows along the bottom; an album's detail poster is square; the cover picker's
  options are square for an album.
- Manual, read-only: the shelf, the wall and the detail view on Jason's real
  library in the browser pane at desktop and phone sizes.
