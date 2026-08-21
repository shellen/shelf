# Shelf

**Your books, audiobooks, movies, podcasts, and albums — on one brutalist wall.**

Shelf is a self-hosted media library with a print-zine soul: hard black rules, monospace metadata, one red accent, zero clutter. It runs three ways from one codebase — a local app backed by a plain SQLite file, a free hosted deployment anyone can launch in minutes, or a single portable HTML file you can open from a thumb drive.

Name it yours — set *"Mary Steiner's Shelf"* in settings and it takes over the masthead, the browser tab, and every shared link.

---

## Deploy your own (free, no credit card)

Shelf's hosted mode runs on **Vercel** (app + API) and **Turso** (database) —
both free tiers, neither asks for a card.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fshellen%2Fshelf&project-name=shelf&repository-name=shelf&env=SHELF_OWNER_EMAIL,SHELF_PASSWORD&envDescription=The%20email%20and%20password%20you%20will%20sign%20in%20with%20to%20edit%20your%20shelf&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22tursocloud%22%2C%22productSlug%22%3A%22database%22%2C%22protocol%22%3A%22storage%22%7D%5D)

That button really is the whole setup. Turso Cloud is a native Vercel
Marketplace integration, so the deploy provisions a database for you and
injects `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into the project itself.
The only things it asks you for are the email and password you want to sign
in with — run `npm run password` first if you'd like a strong one to paste.

Then open your shelf, sign in, and import your Goodreads library or start
quick-adding titles. The schema builds itself on first run.

### If you'd rather drive it from a terminal

```bash
npm i -g vercel && vercel login
curl -sSfL https://get.tur.so/install.sh | bash && turso auth signup

git clone https://github.com/shellen/shelf && cd shelf && npm install
vercel link            # create or pick the Vercel project
npm run setup          # database, credentials, deploy
```

`npm run setup` creates the Turso database, reads back its URL and token, asks
for your sign-in email, generates a password, writes all four variables to
Vercel's Production environment, and deploys. It prints the generated password
once at the end — store it then, because nothing keeps a copy.

```
npm run setup -- --dry-run      # show what it would do, run nothing
npm run setup -- --db my-books  # a different database name
npm run setup -- --no-deploy    # set the variables, deploy later
```

Re-running it is safe: it reuses an existing database and replaces the
variables rather than failing on them. Use this path too if you already have a
Turso database you want to keep, or if the Marketplace integration is
unavailable in your region or plan.

### Checking it worked

Sign in, then open `/api/health` in the same browser:

```json
{"status":"ok","database":{"kind":"turso","readable":true,"writable":true}}
```

`"kind":"turso"` with `"writable":true` is a healthy shelf. `"kind":"file"`
means no database was attached — the deploy is running on the empty schema
baked into the build, which reads fine and can never be written to. The probe
says as much in a `hint`, and `npm run setup` fixes it.

Anyone can browse your shelf; only you, signed in with your email and password,
can change it. A hosted shelf with no credentials set is read-only — forgetting
to configure sign-in leaves your shelf locked, never open.

| Env var | What it does | Set by |
|---|---|---|
| `TURSO_DATABASE_URL` | Your Turso database (`libsql://…`) | The Marketplace integration |
| `TURSO_AUTH_TOKEN` | Its access token | The Marketplace integration |
| `SHELF_OWNER_EMAIL` | The email you sign in with | You |
| `SHELF_PASSWORD` | The password you sign in with | You |

Both sign-in halves are needed to unlock editing. Set neither and a hosted shelf
stays read-only; running locally, they are optional and the shelf is writable
with no login. `BOOKSHELF_PASSWORD` is still read as a fallback for instances
deployed under the older name.

Setting the sign-in pair by hand:

```bash
npm run password       # generates one, and prints the commands below filled in

printf '%s' 'you@example.com'        | vercel env add SHELF_OWNER_EMAIL production
printf '%s' 'the-generated-password' | vercel env add SHELF_PASSWORD production
vercel --prod          # env changes only take effect on a new deployment
```

`npm run password` gives you 32 unambiguous characters — about 188 bits, no
glyphs you could misread and none your shell will mangle. `-- --length 48` for
more, `-- --quiet` to print the bare password for piping. Use `printf` rather
than `echo`, which appends a newline that becomes part of the password.

### Other ways to run it

- **Locally:** `npm install && npm run dev` — a plain SQLite file in `data/`, writable, no login, nothing to configure.
- **As a single file:** `npm run build` produces `dist/index.html` — your entire library, covers embedded, read-only, working search/routes/keyboard — openable from disk or any static host.

## Features

- **Five media types** — books, audiobooks, movies, podcasts, albums. Medium tabs, a sectioned landing page in the order you choose, and square album art treated with respect.
- **Cover wall & list views** — dense gridded covers or a sortable table. Sort by title, author, rating, date read, date added, pages, or year; re-select to flip direction.
- **Goodreads import** — drop in `goodreads_library_export.csv`. New items are added, existing ones get their blanks filled (never overwritten), tags are unioned, and media-type tags (`audiobook`, `vinyl`, `movies`, `podcasts`…) categorize items automatically. Large exports upload in chunks.
- **Quick add** — in List view, type titles and press Enter to queue them; **Resolve** looks everything up at the end (author, year, cover, ISBN) and keeps anything unmatched exactly as you typed it.
- **Lookup built in** — ISBN autofill for books via Open Library; movies, albums, podcasts, and audiobooks via Apple's keyless iTunes Search API.
- **Edit in place** — click any field in an item's drawer and it autosaves on blur; Enter commits, Esc reverts. No forms, no save buttons.
- **Keyboard-first** — navigate the whole app without a mouse; press `?` for the map.
- **Shareable URLs with real link previews** — every author, title, tag, medium, and ISBN has a URL, and hosted deployments serve OpenGraph pages so links unfurl with cover art in Slack and social apps.
- **No image hosting** — covers are linked from their sources at display time; your deployment stores metadata only.

## URLs

| Route | Meaning |
|-------|---------|
| `#/title/snow-crash` | A title; a single match opens it directly |
| `#/author/vonnegut` | An author — partial names resolve (`vonnegut` → Kurt Vonnegut Jr.) and canonicalize |
| `#/tags/cycling` | A tag filter |
| `#/medium/album` | Everything of one medium |
| `#/isbn/9780441172719` | An exact item by ISBN (dashes and case ignored) |

Matching is case-insensitive with word-subset fuzziness (`made-stick` finds "Made to Stick"). On hosted deployments the same routes exist as real paths (`/author/vonnegut`) for crawlers and link previews.

## Keyboard

| Key | Action |
|-----|--------|
| `/` | Focus search |
| Arrows | Navigate the wall/list |
| `Enter` | Open selection |
| `←` `→` (item open) | Previous / next |
| `Esc` | Close panels, then clear search |
| `v` | Toggle Covers / List |
| `s` | Cycle sort field |
| `a` | Add media |
| `e` | Edit selection |
| `i` | Import |
| `1`–`9` | Toggle Nth tag filter |
| `?` | Shortcut help |

## Covers, legally

Shelf never copies cover images to your server. Art resolves at display time:

1. The item's saved cover URL — picked from the built-in search, supplied by iTunes lookup, or **an image URL you pasted yourself** for hard-to-find art (linked, never stored)
2. A local cache in `public/covers/` (dev and single-file builds only)
3. [Open Library's cover service](https://openlibrary.org/dev/docs/api/covers) by ISBN
4. A generated placeholder in the house style

Book metadata and covers come from [Open Library](https://openlibrary.org); movie, album, podcast, and audiobook metadata and artwork from Apple's [iTunes Search API](https://performance-partners.apple.com/search-api). `npm run fetch-covers` caches book covers locally for offline single-file builds.

## Data model

```json
{
  "id": "flow",
  "title": "Flow",
  "author": "Mihaly Csikszentmihalyi",
  "medium": "book",
  "tags": ["psychology", "creativity"],
  "isbn": "9780061339202",
  "coverUrl": "https://…",
  "rating": 4.5,
  "notes": "…",
  "dateRead": "2024-07-04",
  "dateAdded": "2023-01-02",
  "pages": 336,
  "year": 1990
}
```

`author` holds the creator for every medium (director, artist, host); ids are title slugs. The API is a small REST surface (`/api/books`, `/api/import`, `/api/lookup`, `/api/settings`, `/api/session`) with public reads and cookie-authed writes.

## Stack

Vanilla JavaScript front end (no framework, one render loop), Express, and [libSQL](https://github.com/tursodatabase/libsql) — a local `file:` database in dev and Turso in production, through the same client. Vite builds it; `vite-plugin-singlefile` produces the portable snapshot; ~130 Vitest tests cover the merge logic, auth, routes, OpenGraph pages, and the UI.

## Development

```bash
npm install
npm run dev        # app + API at localhost:5173
npm test           # the whole suite
npm run build      # fetch covers, then build the single-file snapshot
```

The design is deliberate brutalism: if it looks like a xeroxed zine taped to a record-shop wall, it's working as intended.
