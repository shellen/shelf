# Music import: Apple Music and Spotify libraries

## Goal

Let Jason bring his albums and podcasts into Shelf from Apple Music and
Spotify, through the existing Import box, without connecting an account.

## Decisions (made with Jason, 2026-11-02)

- **Files, not account linking.** Apple's Music app exports the library as XML
  in seconds, and Spotify's privacy download includes `YourLibrary.json`. Files
  work in every way Shelf runs and reuse the Goodreads import's merge rules.
- **Both sources in the first version.**
- **Apple:** every album name in the library becomes an album, even if only one
  of its songs is in the library.
- **Spotify:** saved albums, the album of every liked song, and followed
  podcasts.
- **Tags:** the genre (Apple only; Spotify's export has none) and the source
  (`apple-music` or `spotify`).
- **Ratings:** Apple's album rating maps to stars. A Loved album with no rating
  gets 5 stars.
- **Covers:** looked up after the import is confirmed, in the background.
- **One Import box** that recognises each file type.
- Different editions of an album ("Abbey Road" and "Abbey Road (2019 Mix)") stay
  separate items. Matching compares titles exactly, as the Goodreads import does.

## How the import works today

The browser reads the file, maps rows to item entries, and posts them in chunks
to `POST /api/import`: first with `dryRun` for the preview counts, then for real
on Confirm. The server matches each entry to an existing item by ISBN, else by
normalised title plus creator. It adds unmatched entries, fills blank fields on
matched items without overwriting, and merges tags. The only server change for
music import is that `/api/import` also returns the ids of the items it added
(see Covers after import).

## Readers (`src/musicimport.js`)

A pure module with two functions. Each returns an array of import entries in
the shape the Goodreads mapper already produces (`title`, `author`, `year`,
`medium`, `tags`, `rating`, `dateAdded`, and nulls for the rest).

### `parseAppleLibrary(text)`

The file is an XML property list. Its `Tracks` dictionary holds one dictionary
per track, with keys such as `Name`, `Artist`, `Album Artist`, `Album`, `Year`,
`Genre`, `Date Added`, `Album Rating`, `Album Rating Computed`, `Album Loved`,
`Podcast`, `Movie`, `TV Show`, `Music Video` and `Kind`.

- Parse with `DOMParser` (available in browsers and in happy-dom).
- Skip tracks with no `Album`, and tracks that are podcast episodes, movies, TV
  shows or music videos.
- Group the remaining tracks by album title plus album artist (`Album Artist`,
  falling back to `Artist`). Each group becomes one entry:
  - `title`: the album title; `author`: the album artist; `medium`: `album`.
  - `year`: the earliest `Year` in the group, or null.
  - `tags`: the most common `Genre` in the group, lowercased (ties broken
    alphabetically), and `apple-music`.
  - `rating`: `Album Rating` ÷ 20, rounded to the nearest half star, when
    present and `Album Rating Computed` is not true. Otherwise 5 if
    `Album Loved` is true on any track in the group. Otherwise null.
  - `dateAdded`: the earliest `Date Added` in the group, as `YYYY-MM-DD`.
- Albums whose album artist is "Various Artists" or which are compilations keep
  that artist name; no special handling.

### `parseSpotifyLibrary(text)`

The file is JSON with arrays including `tracks` (`artist`, `album`, `track`,
`uri`), `albums` (`artist`, `album`, `uri`) and `shows` (`name`, `publisher`,
`uri`). Other arrays are ignored.

- Albums from `albums`, plus the album of each entry in `tracks`, de-duplicated
  by album title plus artist. Each becomes `{ title: album, author: artist,
  medium: 'album', tags: ['spotify'] }`.
- Each entry in `shows` becomes `{ title: name, author: publisher,
  medium: 'podcast', tags: ['spotify'] }`.
- Year, rating and date added are null; the export doesn't carry them.

### File-type detection

`detectImportFile(name, text)` returns `'goodreads'`, `'apple'`, `'spotify'` or
null:

- `apple`: the text parses as an XML property list whose root dictionary has a
  `Tracks` key.
- `spotify`: the text parses as JSON with at least one of `albums`, `tracks`
  or `shows` as arrays.
- `goodreads`: a CSV whose header includes the Goodreads columns the existing
  parser requires.
- Detection uses the contents, not the file extension. A null result shows
  "Shelf can't import this file. Drop a Goodreads CSV, an Apple Music library
  XML or a Spotify YourLibrary.json." in the Import box.

## Import box

- The drop zone text names all three files, and the file input accepts
  `.csv`, `.xml` and `.json`.
- After detection, the chosen reader runs and the existing preview shows its
  counts (added, filled, unchanged), followed by Confirm, exactly as for
  Goodreads. The preview line names the detected source ("Apple Music
  library: 412 albums").
- Large files still upload in the existing chunks.

## Covers after import

After Confirm succeeds:

- Collect the entries the import **added** (not the ones it filled) whose
  medium is album or podcast and which have no cover.
  `/api/import` returns counts today, not ids. The server returns the ids of
  added items alongside the counts, so the browser knows which to look up.
- Look each one up through the existing `GET /api/lookup?medium=&q=` (iTunes
  search), two at a time with a short pause between requests, so a large import
  doesn't trip iTunes rate limits.
- Take the first result whose title and artist match the entry closely enough:
  case-insensitive, after the same normalisation the import uses. If nothing
  matches, leave the item as it is.
- Save only blank fields: the cover URL, and the year when it is missing.
  Never overwrite.
- A toast shows progress ("Finding covers 12 / 140") and a final count
  ("Found 131 covers"). Closing the tab stops the lookups; items not reached
  keep the typographic cover.
- The lookups need the signed-in, writable app. They don't run in the static
  read-only build, which has no Import box anyway.

## Errors

- A file that doesn't parse, or is recognised but contains nothing to import,
  shows a one-line message in the Import box and leaves the library untouched.
- A failed chunk stops the import with the existing error message.
- A failed lookup skips that item and carries on; the final toast counts only
  covers found.

## Testing (TDD)

- `src/musicimport.test.js`:
  - Apple: grouping by album and album artist; skipping podcasts, videos and
    album-less tracks; earliest year and date added; most common genre with an
    alphabetical tiebreak; rating from `Album Rating`, ignoring computed
    ratings; Loved giving 5 stars; the source tag.
  - Spotify: saved albums plus liked songs' albums, de-duplicated; shows as
    podcasts; the source tag; ignoring other arrays.
  - Detection for each type, and null for unrelated XML, JSON and CSV.
- `src/main.test.js`: dropping each file type shows the source and counts in
  the preview, and Confirm posts the mapped entries; an unrecognised file shows
  the message.
- Server: `/api/import` returns the ids of added items.
- Cover lookup, with a stubbed lookup endpoint: fills a blank cover and year,
  never overwrites, skips non-matching results, limits concurrency, and reports
  progress and the final count.

## Out of scope

- Connecting a Spotify or Apple account, or keeping a library in sync.
- Merging different editions of the same album.
- Apple's privacy-export files, Spotify's streaming history, playlists.
