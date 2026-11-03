// ABOUTME: Tests for choosing and grouping the items the shelf view showcases.
// ABOUTME: Covers group membership, ordering, caps, media filtering, fallbacks and caption text.

import { describe, it, expect } from 'vitest'
import { shelfTabs, captionState, starText, mediumOf, singular } from './showcase.js'

const item = (id, fields = {}) => ({ id, title: id, tags: [], rating: null, dateRead: null, dateAdded: null, medium: 'book', ...fields })
const keys = groups => groups.map(g => g.key)
const ids = group => group.items.map(b => b.id)
const READING = ['currently-reading']

describe('shelfTabs', () => {
  const MEDIA = [
    { key: 'book', label: 'Books' },
    { key: 'movie', label: 'Movies' },
    { key: 'album', label: 'Albums' },
  ]
  const tabs = books => shelfTabs(books, MEDIA)
  const tab = (books, key) => tabs(books).find(t => t.key === key)

  it('lists reading, favorites and recently finished, hiding empty groups, then media and All', () => {
    const books = [item('a', { tags: READING }), item('b', { rating: 5 })]
    expect(keys(tabs(books))).toEqual(['reading', 'favorites', 'book', 'all'])
  })

  it('orders by date newest first, puts missing dates last, and breaks ties by title', () => {
    const books = [
      item('Zed', { tags: READING }),
      item('Old', { tags: READING, dateAdded: '2024-01-01' }),
      item('New', { tags: READING, dateAdded: '2025-06-01' }),
      item('Abe', { tags: READING }),
    ]
    expect(ids(tabs(books)[0])).toEqual(['New', 'Old', 'Abe', 'Zed'])
  })

  it('caps favorites at 30 and recently finished at 20, newest read first', () => {
    const books = Array.from({ length: 35 }, (_, i) => item(`b${i}`, { rating: 5, dateRead: `${2000 + i}-01-01` }))
    const [favorites, finished] = tabs(books)
    expect(favorites.key).toBe('favorites')
    expect(favorites.items).toHaveLength(30)
    expect(favorites.items[0].id).toBe('b34')
    expect(finished.key).toBe('finished')
    expect(finished.items).toHaveLength(20)
    expect(finished.items[19].id).toBe('b15')
  })

  it('treats only a full five stars as a favorite', () => {
    const books = [item('half', { rating: 4.5 }), item('full', { rating: 5 })]
    expect(ids(tabs(books)[0])).toEqual(['full'])
  })

  it('draws the showcase groups from every medium', () => {
    const books = [item('bk', { rating: 5 }), item('al', { rating: 5, medium: 'album' })]
    expect(ids(tab(books, 'favorites'))).toEqual(['al', 'bk'])
  })

  it('gives each medium present a tab, in media order, with every item in title order', () => {
    const books = [
      ...Array.from({ length: 40 }, (_, i) => item(`al${String(39 - i).padStart(2, '0')}`, { medium: 'album' })),
      item('bk'),
    ]
    const media = tabs(books).filter(t => t.medium)
    expect(media.map(t => [t.key, t.label, t.medium])).toEqual([['book', 'Books', 'book'], ['album', 'Albums', 'album']])
    expect(media[1].items).toHaveLength(40)
    expect(media[1].items[0].id).toBe('al00')
  })

  it('files an item without a medium under books', () => {
    const books = [{ id: 'm', title: 'm', tags: [], rating: null }]
    expect(ids(tab(books, 'book'))).toEqual(['m'])
  })

  it('ends with All, every item in title order and uncapped, even with no showcase group', () => {
    const books = Array.from({ length: 40 }, (_, i) => item(`t${String(39 - i).padStart(2, '0')}`, { medium: i % 2 ? 'movie' : 'book' }))
    const all = tabs(books)
    expect(keys(all)).toEqual(['book', 'movie', 'all'])
    expect(all.at(-1).label).toBe('All')
    expect(all.at(-1).items).toHaveLength(40)
    expect(all.at(-1).items[0].id).toBe('t00')
    expect(all.at(-1).medium).toBeUndefined()
  })

  it('returns no tabs for an empty library', () => {
    expect(tabs([])).toEqual([])
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
