// ABOUTME: Tests for hash-route parsing and resolution.
import { describe, it, expect } from 'vitest'
import { slugify, parseRoute, resolveRoute } from './routes.js'

const BOOKS = [
  { id: 'slaughterhouse-five', title: 'Slaughterhouse-Five', author: 'Kurt Vonnegut Jr.', isbn: '9780385333849', tags: ['fiction', 'sci-fi'] },
  { id: 'cat-s-cradle', title: "Cat's Cradle", author: 'Kurt Vonnegut Jr.', isbn: null, tags: ['fiction'] },
  { id: 'switch', title: 'Switch', author: 'Chip Heath & Dan Heath', isbn: '9780385528757', tags: ['business'] },
  { id: 'made-to-stick', title: 'Made to Stick', author: 'Chip Heath & Dan Heath', isbn: null, tags: ['business'] },
  { id: 'dune', title: 'Dune', author: 'Frank Herbert', isbn: '0441172717', tags: ['sci-fi', 'desert planets'] },
]

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Kurt Vonnegut Jr.')).toBe('kurt-vonnegut-jr')
    expect(slugify("Cat's Cradle")).toBe('cat-s-cradle')
  })
})

describe('parseRoute', () => {
  it('parses the four kinds case-insensitively', () => {
    expect(parseRoute('#/author/Kurt-Vonnegut-Jr')).toEqual({ kind: 'author', slug: 'kurt-vonnegut-jr' })
    expect(parseRoute('#/title/DUNE')).toEqual({ kind: 'title', slug: 'dune' })
    expect(parseRoute('#/tags/cycling')).toEqual({ kind: 'tags', slug: 'cycling' })
    expect(parseRoute('#/tag/cycling')).toEqual({ kind: 'tags', slug: 'cycling' })
    expect(parseRoute('#/isbn/978-0385333849')).toEqual({ kind: 'isbn', slug: '9780385333849' })
  })

  it('decodes URI components', () => {
    expect(parseRoute('#/author/kurt%20vonnegut')).toEqual({ kind: 'author', slug: 'kurt-vonnegut' })
  })

  it('rejects unknown or empty routes', () => {
    expect(parseRoute('')).toBeNull()
    expect(parseRoute('#/')).toBeNull()
    expect(parseRoute('#/junk/x')).toBeNull()
    expect(parseRoute('#/author/')).toBeNull()
  })
})

describe('resolveRoute: author', () => {
  it('matches a partial name by token subset and canonicalizes', () => {
    const r = resolveRoute({ kind: 'author', slug: 'vonnegut' }, BOOKS)
    expect(r.books.map(b => b.id).sort()).toEqual(['cat-s-cradle', 'slaughterhouse-five'])
    expect(r.canonical).toBe('#/author/kurt-vonnegut-jr')
  })

  it('matches the full name too', () => {
    const r = resolveRoute({ kind: 'author', slug: 'kurt-vonnegut-jr' }, BOOKS)
    expect(r.books).toHaveLength(2)
  })

  it('returns all books across ambiguous authors without a canonical', () => {
    const r = resolveRoute({ kind: 'author', slug: 'heath' }, BOOKS)
    expect(r.books).toHaveLength(2)
    expect(r.canonical).toBe('#/author/chip-heath-dan-heath')
  })

  it('returns nothing for strangers', () => {
    expect(resolveRoute({ kind: 'author', slug: 'nobody' }, BOOKS).books).toEqual([])
  })
})

describe('resolveRoute: title', () => {
  it('opens a single exact match', () => {
    const r = resolveRoute({ kind: 'title', slug: 'dune' }, BOOKS)
    expect(r.open?.id).toBe('dune')
    expect(r.canonical).toBe('#/title/dune')
  })

  it('falls back to token-subset matching', () => {
    const r = resolveRoute({ kind: 'title', slug: 'made-stick' }, BOOKS)
    expect(r.open?.id).toBe('made-to-stick')
  })

  it('lists multiple matches without opening', () => {
    const r = resolveRoute({ kind: 'title', slug: 'stick' }, [...BOOKS,
      { id: 'stick-2', title: 'Stick Together', author: 'X', isbn: null, tags: [] }])
    expect(r.books).toHaveLength(2)
    expect(r.open).toBeNull()
  })
})

describe('resolveRoute: tags', () => {
  it('matches a tag slug against spaced tags', () => {
    const r = resolveRoute({ kind: 'tags', slug: 'desert-planets' }, BOOKS)
    expect(r.tag).toBe('desert planets')
    expect(r.books.map(b => b.id)).toEqual(['dune'])
  })

  it('matches plain tags', () => {
    expect(resolveRoute({ kind: 'tags', slug: 'business' }, BOOKS).books).toHaveLength(2)
  })
})

describe('resolveRoute: medium', () => {
  const withMedia = BOOKS.map(b => ({ ...b, medium: b.id === 'dune' ? 'movie' : 'book' }))

  it('parses and filters by medium', () => {
    expect(parseRoute('#/medium/Movie')).toEqual({ kind: 'medium', slug: 'movie' })
    const r = resolveRoute({ kind: 'medium', slug: 'movie' }, withMedia)
    expect(r.books.map(b => b.id)).toEqual(['dune'])
    expect(r.canonical).toBe('#/medium/movie')
  })

  it('returns nothing for unknown media', () => {
    expect(resolveRoute({ kind: 'medium', slug: 'vhs' }, withMedia).books).toEqual([])
  })
})

describe('resolveRoute: isbn', () => {
  it('opens the exact isbn', () => {
    const r = resolveRoute({ kind: 'isbn', slug: '9780385333849' }, BOOKS)
    expect(r.open?.id).toBe('slaughterhouse-five')
  })

  it('returns nothing for unknown isbns', () => {
    expect(resolveRoute({ kind: 'isbn', slug: '1111111111' }, BOOKS).books).toEqual([])
  })
})
