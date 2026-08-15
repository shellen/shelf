# Bookshelf

A simple, portable bookshelf app with local SQLite storage that builds to a single HTML file.

## Quick Start

```bash
npm install
npm run db:migrate   # Import existing books.json into SQLite
npm run dev          # Dev server + API at localhost:5173
```

## Features

- **Cover wall view** - Visual grid of book covers
- **List view** - Sortable table with all book details (click column headers to sort)
- **Search** - Filter by title, author, or tags
- **Sort by anything** - Title, author, rating, date read, date added, pages, or year; re-select to flip direction
- **Goodreads import** - Drop in a `goodreads_library_export.csv`; new books are added, existing ones get blanks filled
- **Keyboard-first** - Full navigation without the mouse; press `?` for the shortcut list
- **Add & edit books** - In-app forms with ISBN lookup (saves instantly)
- **Change covers** - Pick from Open Library, Google Books results
- **SQLite storage** - All changes persist immediately
- **Local cover caching** - Downloads covers once, embeds in final HTML
- **Single file output** - One portable `index.html` file (read-only snapshot with covers embedded)

## Adding Books

### Option 1: In-App Form
1. Run `npm run dev`
2. Click "+ Add Book"
3. Enter ISBN (auto-fills title/author) or enter manually
4. Click "Add Book" - saves instantly to SQLite

### Option 2: CLI Script
```bash
npm run add-book
# Follow prompts to search by ISBN or title
```

### Option 3: Import from Goodreads
1. On Goodreads: My Books → Tools → Import and Export → Export Library
2. In the app, click **Import** (or press `i`) and drop the downloaded `goodreads_library_export.csv`
3. Review the preview (new / updates / unparseable) and confirm

Import merging is fill-in-blanks: books matched by ISBN or title+author keep everything they already have; only empty fields (rating, notes, dates, pages, year, ISBN) are filled from the export, and tags are unioned. Goodreads shelves (including `read` / `to-read` / `currently-reading`) become tags.

### Option 4: Edit books.json + migrate
1. Add entries to `books.json`
2. Run `npm run db:migrate` to sync to SQLite

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| Arrows | Navigate the wall/list |
| `Enter` | Open selected book |
| `←` `→` (book open) | Previous / next book |
| `Esc` | Close panels, then clear search |
| `v` | Toggle Covers / List |
| `s` | Cycle sort field |
| `a` | Add book |
| `e` | Edit selected book |
| `i` | Import from Goodreads |
| `1`–`9` | Toggle Nth tag filter |
| `?` | Show shortcut help |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server + API (changes save instantly) |
| `npm run build` | Fetch covers + build single HTML |
| `npm run build:quick` | Build without fetching covers |
| `npm run fetch-covers` | Download covers from Open Library |
| `npm run add-book` | Interactive CLI to add a book |
| `npm run db:init` | Create fresh SQLite database |
| `npm run db:migrate` | Import books.json into SQLite |
| `npm test` | Run the test suite |

## Architecture

```
bookshelf/
├── data/
│   └── bookshelf.db     # SQLite database (auto-created)
├── public/
│   └── covers/          # Cached cover images
├── server/
│   ├── api.js           # Express API server (port 3001)
│   └── db.js            # Database helpers
├── src/
│   ├── main.js          # Frontend app
│   └── style.css        # Styles
├── scripts/
│   ├── fetch-covers.js  # Download covers
│   ├── add-book.js      # CLI for adding books
│   ├── init-db.js       # Create database
│   └── migrate-json.js  # Import from books.json
└── books.json           # Legacy data (for migration)
```

## Book Data Format

```json
{
  "id": "flow",
  "title": "Flow",
  "author": "Mihaly Csikszentmihalyi",
  "tags": ["psychology", "creativity"],
  "isbn": "9780061339202",
  "coverUrl": "https://...",
  "rating": 4.5,
  "notes": "…",
  "dateRead": "2024-07-04",
  "dateAdded": "2023-01-02",
  "pages": 336,
  "year": 1990
}
```

- `id` - Unique identifier (a title slug; ids created before the shelf field was retired keep their old `s1-` style prefixes)
- `isbn` - Optional, but helps with cover accuracy + links
- `tags` - Array of lowercase tags for filtering
- `coverUrl` - Custom cover URL (from cover picker)
- `rating`, `notes` - Editable in the book drawer
- `dateRead`, `dateAdded`, `pages`, `year` - Populated by Goodreads import; used for sorting

## Cover Images

Covers are fetched from multiple sources and cached in `public/covers/`:

1. **Open Library** - Primary source, searched by title/author
2. **Google Books** - Fallback option
3. **ISBN lookup** - Direct URL if ISBN is known

Run `npm run fetch-covers` to download covers for all books in the database. Cached covers are embedded as base64 in the final HTML build; books with a custom cover URL keep that URL.

## API Endpoints

When running `npm run dev`, an API server runs at `localhost:3001`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books` | List all books |
| GET | `/api/books/:id` | Get single book |
| POST | `/api/books` | Create new book |
| PUT | `/api/books/:id` | Update book |
| PATCH | `/api/books/:id/cover` | Update just the cover |
| DELETE | `/api/books/:id` | Delete book |
| GET | `/api/tags` | List all unique tags |

## Output

After `npm run build`, find your bookshelf at:
```
dist/index.html
```

This single file contains everything - HTML, CSS, JS, and cover images. Open it directly in any browser or host anywhere. The book list and cached covers are embedded at build time straight from the SQLite database.

**Note:** The built HTML file is read-only (no API server). It's a snapshot of your bookshelf at build time; editing controls are hidden automatically.
