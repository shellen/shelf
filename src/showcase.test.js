// ABOUTME: Tests for choosing and grouping the items the shelf view showcases.
// ABOUTME: Covers group membership, ordering, caps, media filtering, fallbacks and caption text.

import { describe, it, expect } from 'vitest'
import { showcaseGroups, captionState, starText, mediumOf, singular } from './showcase.js'

const ALL = ['book', 'audiobook', 'movie', 'podcast', 'album']
const item = (id, fields = {}) => ({ id, title: id, tags: [], rating: null, dateRead: null, dateAdded: null, medium: 'book', ...fields })
const keys = groups => groups.map(g => g.key)
const ids = group => group.items.map(b => b.id)
const READING = ['currently-reading']

describe('showcaseGroups', () => {
  it('groups reading, favorites and recently finished, hiding empty groups', () => {
    const books = [item('a', { tags: READING }), item('b', { rating: 5 })]
    expect(keys(showcaseGroups(books, { landing: ALL }))).toEqual(['reading', 'favorites'])
  })

  it('orders by date newest first, puts missing dates last, and breaks ties by title', () => {
    const books = [
      item('Zed', { tags: READING }),
      item('Old', { tags: READING, dateAdded: '2024-01-01' }),
      item('New', { tags: READING, dateAdded: '2025-06-01' }),
      item('Abe', { tags: READING }),
    ]
    expect(ids(showcaseGroups(books, { landing: ALL })[0])).toEqual(['New', 'Old', 'Abe', 'Zed'])
  })

  it('caps favorites at 30 and recently finished at 20, newest read first', () => {
    const books = Array.from({ length: 35 }, (_, i) => item(`b${i}`, { rating: 5, dateRead: `${2000 + i}-01-01` }))
    const [favorites, finished] = showcaseGroups(books, { landing: ALL })
    expect(favorites.key).toBe('favorites')
    expect(favorites.items).toHaveLength(30)
    expect(favorites.items[0].id).toBe('b34')
    expect(finished.key).toBe('finished')
    expect(finished.items).toHaveLength(20)
    expect(finished.items[19].id).toBe('b15')
  })

  it('treats only a full five stars as a favorite', () => {
    const books = [item('half', { rating: 4.5 }), item('full', { rating: 5 })]
    expect(ids(showcaseGroups(books, { landing: ALL })[0])).toEqual(['full'])
  })

  it('includes only landing media when there is no medium filter', () => {
    const books = [item('bk', { rating: 5 }), item('al', { rating: 5, medium: 'album' })]
    expect(ids(showcaseGroups(books, { landing: ['book'] })[0])).toEqual(['bk'])
  })

  it('lets a medium filter bypass the landing config', () => {
    const books = [item('bk', { rating: 5 }), item('al', { rating: 5, medium: 'album' })]
    expect(ids(showcaseGroups(books, { landing: ['book'], medium: 'album' })[0])).toEqual(['al'])
  })

  it('treats a missing medium as a book', () => {
    const books = [{ id: 'm', title: 'm', tags: [], rating: 5 }]
    expect(ids(showcaseGroups(books, { landing: ['book'] })[0])).toEqual(['m'])
  })

  it('falls back to On the shelf in title order, capped at 30, when every group is empty', () => {
    const books = Array.from({ length: 40 }, (_, i) => item(`t${String(39 - i).padStart(2, '0')}`))
    const groups = showcaseGroups(books, { landing: ALL })
    expect(keys(groups)).toEqual(['shelf'])
    expect(groups[0].label).toBe('On the shelf')
    expect(groups[0].items).toHaveLength(30)
    expect(groups[0].items[0].id).toBe('t00')
  })

  it('returns no groups when nothing is included', () => {
    expect(showcaseGroups([], { landing: ALL })).toEqual([])
    expect(showcaseGroups([item('bk')], { landing: ALL, medium: 'album' })).toEqual([])
  })
})

describe('captionState', () => {
  it('says Reading for items being read, even when they have a read date', () => {
    expect(captionState(item('a', { tags: READING, dateRead: '2025-06-01' }))).toBe('Reading')
  })

  it('gives the month and year an item was read', () => {
    expect(captionState(item('a', { dateRead: '2025-06-14' }))).toBe('Read Jun 2025')
  })

  it('is empty otherwise', () => {
    expect(captionState(item('a'))).toBe('')
  })
})

describe('starText', () => {
  it('draws whole and half stars', () => {
    expect(starText(4.5)).toBe('★★★★½')
    expect(starText(5)).toBe('★★★★★')
  })

  it('is empty when unrated', () => {
    expect(starText(null)).toBe('')
    expect(starText(0)).toBe('')
  })
})

describe('medium names', () => {
  it('treats an item without a medium as a book', () => {
    expect(mediumOf({ medium: 'album' })).toBe('album')
    expect(mediumOf({})).toBe('book')
  })

  it('names one item of a medium', () => {
    expect(singular('Books')).toBe('Book')
    expect(singular('Podcasts')).toBe('Podcast')
  })
})
