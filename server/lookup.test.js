// @vitest-environment node
// ABOUTME: Tests for iTunes Search API query building and result mapping.

import { describe, it, expect } from 'vitest'
import { itunesUrl, mapItunesResults, mapOpenLibraryResults } from './lookup.js'

describe('itunesUrl', () => {
  it('builds per-medium queries', () => {
    expect(itunesUrl('movie', 'Dune')).toContain('media=movie')
    expect(itunesUrl('album', 'Abbey Road')).toContain('entity=album')
    expect(itunesUrl('podcast', 'Radiolab')).toContain('media=podcast')
    expect(itunesUrl('audiobook', 'Dune')).toContain('media=audiobook')
    expect(itunesUrl('movie', 'Dune')).toContain('term=Dune')
  })

  it('rejects unknown media', () => {
    expect(itunesUrl('vhs', 'Dune')).toBeNull()
  })
})

describe('mapOpenLibraryResults', () => {
  it('maps book docs with author, year, isbn, and cover', () => {
    const [r] = mapOpenLibraryResults([{
      title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965,
      cover_i: 12345, isbn: ['9780441172719', '0441172717']
    }])
    expect(r).toEqual({
      title: 'Dune', author: 'Frank Herbert', year: 1965,
      isbn: '9780441172719',
      coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg'
    })
  })

  it('skips docs without titles', () => {
    expect(mapOpenLibraryResults([{ author_name: ['X'] }])).toEqual([])
  })
})

describe('mapItunesResults', () => {
  it('maps movies with director, year, and upscaled artwork', () => {
    const [r] = mapItunesResults('movie', [{
      trackName: 'Dune', artistName: 'Denis Villeneuve',
      releaseDate: '2021-10-22T07:00:00Z',
      artworkUrl100: 'https://x.mzstatic.com/img/100x100bb.jpg'
    }])
    expect(r).toEqual({
      title: 'Dune', author: 'Denis Villeneuve', year: 2021,
      coverUrl: 'https://x.mzstatic.com/img/600x600bb.jpg'
    })
  })

  it('maps albums via collectionName', () => {
    const [r] = mapItunesResults('album', [{
      collectionName: 'Abbey Road', artistName: 'The Beatles',
      releaseDate: '1969-09-26', artworkUrl100: 'https://x/100x100bb.jpg'
    }])
    expect(r.title).toBe('Abbey Road')
    expect(r.author).toBe('The Beatles')
    expect(r.year).toBe(1969)
  })

  it('skips rows without a usable title', () => {
    expect(mapItunesResults('movie', [{ artistName: 'Nobody' }])).toEqual([])
  })
})
