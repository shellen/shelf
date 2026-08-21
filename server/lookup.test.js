// @vitest-environment node
// ABOUTME: Tests for iTunes Search API query building and result mapping.

import { describe, it, expect } from 'vitest'
import { itunesUrl, mapItunesResults } from './lookup.js'

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
