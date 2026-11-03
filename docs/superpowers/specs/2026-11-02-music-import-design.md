# Music import: Apple Music and Spotify libraries

## Goal

Let Jason bring his albums and podcasts into Shelf from Apple Music and
Spotify, through the existing Import box, without connecting an account.

## Decisions (made with Jason, 2026-11-02)

- **Files, not account linking.** Apple's Music app exports the library as XML
  in seconds, and Spotify's privacy download includes `YourLibrary.json`. Files
  work in every way Shelf runs and reuse the Goodreads import's merge rules.
- **Both sources in the first version.** Apple contributes albums; Spotify
  contributes albums and podcasts.
- **Apple:** every album name in the library becomes an album, even if only one
  of its songs is in the library. Songs only added to a playlist
  (`Playlist Only`) are skipped.
- **Spotify:** saved albums, the album of every liked song (so a liked single
  becomes an album), and followed podcasts.
- **Tags:** the genre (Apple only; Spotify's export has none) and the source
  (`apple-music` or `spotify`).
- **Ratings:** Apple's album rating maps to stars. An album Jason loved (the
  album itself, not one of its songs) with no rating gets 5 stars.
- **Covers:** looked up in the background after the import, at about one
  lookup every 3 seconds (iTunes allows roughly 20 a minute). A **Find missing
  covers** menu item resumes the lookup for any album or podcast still without
  a cover.
- **One Import box** that recognises each file type.
- Different editions of an album ("Abbey Road" and "Abbey Road (2019 Mix)") stay
  separate items. Matching compares normalised titles exactly, as the Goodreads
  import does.
- An album whose title and creator match an existing item of another medium
  merges into it. This is rare and accepted.

## How the import works today

The browser reads the file, maps rows to item entries, and posts them in chunks
to `POST /api/import`: first with `dryRun` for the preview counts, then for real
on Confirm. The server matches each entry to an existing item by ISBN, else by
`normKey(title)|normKey(author)`. It adds unmatched entries, fills blank fields
on matched items without overwriting, and merges tags.

## Matching that works in every script

`normKey` in `server/db.js` keeps only `[a-z0-9 ]`. "Björk" becomes "bjrk", and
a title and creator written entirely in a non-Latin script reduce to an empty
key, so every such album would collide with the others. Music libraries hit
this far more often than book libraries.

`normKey` becomes Unicode-aware: decompose (`NFKD`), drop combining diacritics
(U+0300–U+036F) only where they follow a Latin letter (so "Björk" → "bjork",
while Cyrillic й and Japanese voiced kana keep their marks), recompose (`NFC`), lowercase, and keep letters, numbers and the remaining
combining marks in any script (`[^\p{L}\p{M}\p{N} ]` removed, so vowel signs in
scripts such as Devanagari and Thai survive), then collapse spaces. The function moves to a shared
module (`src/match.js`) so the server merge, the browser's album grouping and
the cover matching all use the same key. Keys are computed on every import, so
nothing stored needs migrating.

## Readers (`src/musicimport.js`)

A pure module. Each reader returns `{ books, failed }` like
`parseGoodreadsCsv`, where `books` are import entries (`title`, `author`,
`year`, `medium`, `tags`, `rating`, `dateAdded`, and nulls for the rest). The
music readers always return `failed: []`; a file they can't read is an error
(see Errors in the Import box), and records missing an album or title are
simply skipped.

### `parseAppleLibrary(text)`

The file is an XML property list: dictionaries are alternating `<key>` and
value siblings, values are typed (`<string>`, `<integer>`, `<date>` in ISO-8601
UTC, `<true/>`), and false booleans are simply absent. The root dictionary's
`Tracks` value holds one dictionary per track.

- The exact key names are confirmed against Jason's own exported
  `Library.xml` before the reader is written, and recorded here. The expected
  keys are `Name`, `Artist`, `Album Artist`, `Album`, `Year`, `Genre`,
  `Date Added`, `Album Rating`, `Album Rating Computed`, `Album Loved` (or
  `Album Favorited` on newer macOS), `Compilation`, `Playlist Only`, `Podcast`,
  `Movie`, `TV Show` and `Music Video`.
- Performance: a large library file can be 50–100 MB. Cut the text at the
  first `<key>Playlists</key>` and append `</dict></plist>` so it stays
  well-formed (the playlists section is ignored and often large), then parse it
  once with `DOMParser`.
- Skip tracks with no `Album`, and tracks marked `Playlist Only`, `Podcast`,
  `Movie`, `TV Show` or `Music Video`.
- A track's album artist is `Album Artist`; else "Various Artists" when
  `Compilation` is true; else `Artist`.
- Group tracks by `normKey(album) | normKey(album artist)`. Each group becomes
  one entry:
  - `title`: the album title as written on the group's first track.
  - `author`: the most common album artist spelling in the group.
  - `medium`: `album`.
  - `year`: the earliest `Year` in the group, or null.
  - `tags`: the most common non-empty `Genre`, lowercased (ties broken
    alphabetically), plus `apple-music`. No genre tag when no track has one.
  - `rating`: the highest `Album Rating` in the group that isn't marked
    `Album Rating Computed`, ÷ 20, rounded to the nearest half star. Otherwise
    5 if any track has `Album Loved` (or `Album Favorited`). Otherwise null.
    Track-level `Loved` doesn't count.
  - `dateAdded`: the earliest `Date Added` in the group, as its UTC date
    (`YYYY-MM-DD`).

### `parseSpotifyLibrary(text)`

The download arrives as a zip (`my_spotify_data.zip`). The file to import is
`YourLibrary.json` inside it. It is JSON with arrays including `tracks`
(`artist`, `album`, `track`, `uri`), `albums` (`artist`, `album`, `uri`) and
`shows` (`name`, `publisher`, `uri`); other arrays are ignored. The field names
are checked against Jason's file when it arrives.

- Albums come from `albums` plus the album of each entry in `tracks`,
  de-duplicated by `normKey(album) | normKey(artist)`. Each becomes
  `{ title: album, author: artist, medium: 'album', tags: ['spotify'] }`.
- Each entry in `shows` becomes `{ title: name, author: publisher,
  medium: 'podcast', tags: ['spotify'] }`.
- Year, rating and date added are null.

### File-type detection

`detectImportFile(text)` returns `'goodreads'`, `'apple'`, `'spotify'` or null,
using the contents, not the file name. It checks in this order, so a large XML
file is never run through `JSON.parse` or the CSV parser:

- `apple`: the first 4 KB contain `<plist` and `<key>Tracks</key>`.
- `spotify`: the first 4 KB, after leading whitespace, start with `{` and
  contain an `"albums"`, `"tracks"` or `"shows"` key. The file isn't parsed to
  name it, so a Spotify file that is cut short is still recognised and then
  reported as damaged.
- `goodreads`: a CSV whose header row contains `Title`, which is what the
  Goodreads parser requires today.

## Import box

- The modal title becomes "Import". The drop zone reads "Drop a Goodreads CSV,
  an Apple Music Library.xml or Spotify's YourLibrary.json here, or click to
  choose", and the file input accepts `.csv`, `.xml` and `.json`.
- The Goodreads-only export hint becomes one line per source:
  - "Goodreads: My Books → Import and export → Export library."
  - "Apple Music: in the Music app, File → Library → Export Library…"
  - "Spotify: Account → Privacy settings → Download your data, then unzip it and
    use YourLibrary.json."
- After detection the matching reader runs, and the existing preview shows its
  counts with today's labels (new / updates / already complete). A line above
  them names the source and what was read: "Apple Music library: 412 albums",
  "Spotify library: 380 albums, 12 podcasts", "Goodreads library: 227 books".
- Confirm, chunking and the merge are unchanged.

## Errors in the Import box

A new `state.importError` shows a one-line message in the modal. It is cleared
when a new file is chosen or the modal closes, and Confirm stays disabled while
it is set. It is set when:

- the file isn't recognised: "Shelf can't import this file. Drop a Goodreads
  CSV, an Apple Music Library.xml, or the YourLibrary.json from Spotify's zip
  (unzip it first).";
- a recognised file fails to parse: "This file looks damaged. Export it again
  and retry.";
- a recognised file contains nothing to import: "Nothing to import in this
  file.";
- the preview (dry run) request fails: the server's error message.

Reading and parsing failures are caught; today an exception leaves the box stuck
on "Reading file…".

## Finding covers

Covers are found after the import, in the background, and on demand later.

- **Which items:** after Confirm, once the library has reloaded, every album or
  podcast whose cover is blank. **Find missing covers**, a new item in the
  signed-in avatar menu, runs the same process at any time. A second run while
  one is going does nothing. When no album or podcast is missing a cover, the
  menu item shows "Nothing missing. Looking sharp." When some are missing one
  but none can be looked up (no creator for an album, or an empty title), it
  shows "Nothing left to look up."
- **The query:** `GET /api/lookup?medium=<medium>&q=<query>`, where the query is
  "title creator" for albums and the title for podcasts.
- **A match:** the first result whose normalised title equals the item's, after
  removing iTunes' " - Single" and " - EP" suffixes, and, for albums, whose
  normalised creator also equals the item's. Podcasts match on title alone,
  because Spotify's publisher and iTunes' artist often differ. An empty
  normalised title or creator never matches.
- **Saving:** re-read the item from `state.books`. If its cover is still blank,
  `PUT /api/books/:id` with `{ ...item, coverUrl: result.coverUrl, year:
  item.year ?? result.year }`. Never overwrite a field that has a value.
- **Pace:** one lookup at a time, about 3 seconds apart. After 3 lookups in a
  row fail, stop with "Stopped finding covers: iTunes isn't answering. Try Find
  missing covers later."
- **Progress:** a persistent toast that updates in place: "Finding covers 12 /
  140 · about 6 min left". It ends with "Found 131 covers", which then clears
  like a normal toast. `showToast` gains this persistent, updatable mode; a
  normal toast shown meanwhile appears briefly and the progress toast returns.
- Found covers appear in the library at most every 15 seconds and when the run
  ends. The library isn't redrawn under an open detail (closing it shows
  everything) or while the shelf is being dragged.
- An unexpected failure ends the run with the same "Stopped finding covers"
  message, and Find missing covers can be run again.
- Closing the tab stops the run. Items not reached keep the typographic cover
  until the next run.
- Known limit: items that never match are tried again on every run, at about
  3 seconds each.
- The static read-only build has no Import box or menu, so none of this runs
  there.

## Testing (TDD)

- `src/match.test.js`: `normKey` keeps letters and numbers in any script, drops
  accents ("Björk" → "bjork"), gives distinct keys for two different
  all-Japanese album titles, and keeps がっこう and かっこう distinct.
- Server: the import keeps two non-Latin albums separate.
- `src/musicimport.test.js`:
  - Apple: grouping by normalised album and album artist; "Various Artists"
    for compilations without an album artist; the most common album artist;
    skipping album-less, `Playlist Only`, podcast and video tracks; earliest
    year and UTC date added; most common genre with an alphabetical tiebreak
    and no tag when empty; the highest non-computed album rating; `Album Loved`
    and `Album Favorited` giving 5 stars while track `Loved` doesn't; the source
    tag; a fixture with a `Playlists` section still parses its tracks with no
    error.
  - Spotify: saved albums plus liked songs' albums, de-duplicated by normalised
    key; shows as podcasts; the source tag; other arrays ignored.
  - Detection for each type; an existing `Title,Author` CSV still detected as
    Goodreads; null for unrelated XML, JSON and CSV.
- `src/main.test.js`:
  - Dropping each file type shows the source line and counts, and Confirm posts
    the mapped entries.
  - Each error case shows its message and disables Confirm: unrecognised, bad
    XML, bad JSON, nothing to import, and a failed dry run.
- Finding covers, with a stubbed lookup endpoint and fake timers
  (`vi.useFakeTimers()`, so the 3-second pace doesn't slow the suite): fills a blank cover and a
  missing year; never overwrites a cover set in the meantime; skips
  non-matching results and empty keys; strips " - Single" / " - EP"; runs one
  at a time; stops after 3 consecutive failures with its message; reports
  progress and the final count; Find missing covers picks up items a previous
  run missed, and shows "Nothing missing. Looking sharp." or "Nothing left to
  look up." when there is nothing for it to do.
- The Import box shows the three export hints.
- Manual: import Jason's real `Library.xml` (and `YourLibrary.json` when it
  arrives) in the browser and note the parse time.

## Out of scope

- Connecting a Spotify or Apple account, or keeping a library in sync.
- Merging different editions of the same album.
- Apple's privacy-export files, Spotify's streaming history, playlists.
