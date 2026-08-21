// @vitest-environment node
// ABOUTME: Tests for the OpenGraph page builder used by the /title|author|... crawler pages.

import { describe, it, expect } from 'vitest'
import { buildOgPage } from './og.js'

const BOOKS = [
  { id: 'dune', title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', coverUrl: 'https://img.example/dune.jpg', rating: 5, year: 1965, medium: 'book', tags: ['sci-fi'] },
  { id: 'cat-s-cradle', title: "Cat's Cradle", author: 'Kurt Vonnegut Jr.', isbn: null, coverUrl: null, rating: null, year: 1963, medium: 'book', tags: [] },
]

describe('buildOgPage', () => {
  it('builds a single-book page with cover, creator, and redirect', () => {
    const html = buildOgPage('/title/dune', BOOKS, 'https://shelf.example')
    expect(html).toContain('<meta property="og:title" content="Dune">')
    expect(html).toContain('Frank Herbert')
    expect(html).toContain('1965')
    expect(html).toContain('<meta property="og:image" content="https://img.example/dune.jpg">')
    expect(html).toContain("location.replace('/#/title/dune')")
  })

  it('falls back to Open Library cover art by ISBN', () => {
    const html = buildOgPage('/isbn/9780441172719', [{ ...BOOKS[0], coverUrl: null }], 'https://shelf.example')
    expect(html).toContain('covers.openlibrary.org/b/isbn/9780441172719')
  })

  it('builds an author collection page with a count', () => {
    const html = buildOgPage('/author/vonnegut', BOOKS, 'https://shelf.example')
    expect(html).toContain('Kurt Vonnegut Jr.')
    expect(html).toContain('1 title')
    expect(html).toContain("location.replace('/#/author/kurt-vonnegut-jr')")
  })

  it('escapes hostile titles', () => {
    const hostile = [{ ...BOOKS[0], id: 'x', title: '<script>alert(1)</script>' }]
    const html = buildOgPage('/title/script-alert-1', hostile, 'https://shelf.example')
    expect(html).not.toContain('<script>alert')
  })

  it('returns null for unknown routes', () => {
    expect(buildOgPage('/nope/whatever', BOOKS, 'https://shelf.example')).toBeNull()
  })

  it('uses a configured shelf name as the site name', () => {
    const html = buildOgPage('/author/vonnegut', BOOKS, 'https://shelf.example', "Mary Steiner's Shelf")
    expect(html).toContain('Mary Steiner&#39;s Shelf')
  })
})
