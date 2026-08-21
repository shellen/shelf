// ABOUTME: Builds crawler-facing HTML pages with OpenGraph tags for path-style
// ABOUTME: URLs (/title/x, /author/x, ...), redirecting humans to the hash route.

import { parseRoute, resolveRoute, slugify } from '../src/routes.js'

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const MEDIA_LABELS = { book: 'Book', audiobook: 'Audiobook', movie: 'Movie', podcast: 'Podcast', album: 'Album' }

function coverFor(book) {
  if (book.coverUrl) return book.coverUrl
  if (book.isbn) return `https://covers.openlibrary.org/b/isbn/${String(book.isbn).replace(/[^0-9Xx]/g, '')}-L.jpg`
  return null
}

export function buildOgPage(path, books, origin) {
  const route = parseRoute('#' + path)
  if (!route) return null
  const resolved = resolveRoute(route, books)
  if (!resolved.books.length) return null

  const hash = resolved.canonical || `#/${route.kind}/${route.slug}`
  let title, description, image

  if (resolved.open) {
    const b = resolved.open
    title = b.title
    description = [
      MEDIA_LABELS[b.medium] || 'Book',
      b.author,
      b.year,
      b.rating ? `${b.rating}★` : null
    ].filter(Boolean).join(' · ')
    image = coverFor(b)
  } else {
    const count = resolved.books.length
    const label = route.kind === 'author'
      ? [...new Set(resolved.books.map(b => b.author))].join(', ')
      : route.kind === 'medium' ? `${MEDIA_LABELS[route.slug] || route.slug}s`
      : `${route.kind}: ${route.slug}`
    title = `${label} — Shelf`
    description = `${count} title${count === 1 ? '' : 's'} on this shelf`
    image = coverFor(resolved.books[0])
  }

  const url = `${origin}${path}`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Shelf">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<script>location.replace('/${hash}')</script>
<meta http-equiv="refresh" content="0;url=/${hash}">
</head>
<body>
<p><a href="/${hash}">${esc(title)}</a></p>
</body>
</html>`
}
