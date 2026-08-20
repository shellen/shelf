// ABOUTME: Hash-route parsing and resolution for #/title|author|tags|isbn/<slug> URLs.
// ABOUTME: Case-insensitive slug matching with token-subset fuzziness and canonicalization.

export function slugify(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const tokens = slug => slug.split('-').filter(Boolean)
const isSubset = (a, b) => a.every(t => b.includes(t))
const cleanIsbn = v => String(v ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()

export function parseRoute(hash) {
  const m = String(hash || '').match(/^#\/(title|author|tags?|isbn)\/(.+)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase() === 'tag' ? 'tags' : m[1].toLowerCase()
  const raw = decodeURIComponent(m[2])
  const slug = kind === 'isbn' ? cleanIsbn(raw) : slugify(raw)
  return slug ? { kind, slug } : null
}

export function resolveRoute(route, books) {
  const { kind, slug } = route
  const none = { books: [], open: null, canonical: null }

  if (kind === 'isbn') {
    const match = books.find(b => b.isbn && cleanIsbn(b.isbn) === slug)
    return match ? { books: [match], open: match, canonical: `#/isbn/${slug}` } : none
  }

  if (kind === 'tags') {
    const tag = [...new Set(books.flatMap(b => b.tags || []))].find(t => slugify(t) === slug)
    if (!tag) return none
    return {
      books: books.filter(b => (b.tags || []).includes(tag)),
      open: null,
      canonical: `#/tags/${slugify(tag)}`,
      tag
    }
  }

  if (kind === 'author') {
    const routeTokens = tokens(slug)
    const matches = books.filter(b => b.author && isSubset(routeTokens, tokens(slugify(b.author))))
    const authors = [...new Set(matches.map(b => b.author))]
    return {
      books: matches,
      open: null,
      canonical: authors.length === 1 ? `#/author/${slugify(authors[0])}` : null
    }
  }

  // title: exact slug beats token-subset
  const exact = books.filter(b => slugify(b.title) === slug)
  const matches = exact.length ? exact : books.filter(b => isSubset(tokens(slug), tokens(slugify(b.title))))
  if (matches.length === 1) {
    return { books: matches, open: matches[0], canonical: `#/title/${slugify(matches[0].title)}` }
  }
  return { books: matches, open: null, canonical: null }
}
