// ABOUTME: Tests for finding missing covers: which items need one, the lookup query, matching
// ABOUTME: iTunes results, the update that saves a cover, and the paced, one-at-a-time run.

import { describe, it, expect } from 'vitest'
import { missingCover, canFindCover, coverQuery } from './covers.js'

const album = (fields = {}) => ({ id: 'in-rainbows', title: 'In Rainbows', author: 'Radiohead', medium: 'album', coverUrl: null, year: null, tags: [], ...fields })
const podcast = (fields = {}) => ({ id: 'radiolab', title: 'Radiolab', author: 'WNYC Studios', medium: 'podcast', coverUrl: null, year: null, tags: [], ...fields })
const result = (fields = {}) => ({ title: 'In Rainbows', author: 'Radiohead', year: 2007, coverUrl: 'https://art.example/in-rainbows.jpg', ...fields })

describe('missingCover', () => {
  it('picks albums and podcasts whose cover is blank, whether or not a lookup could match them', () => {
    expect(missingCover(album())).toBe(true)
    expect(missingCover(album({ author: null }))).toBe(true)
    expect(missingCover(podcast({ coverUrl: '' }))).toBe(true)
    expect(missingCover(album({ coverUrl: 'https://art.example/x.jpg' }))).toBe(false)
    expect(missingCover({ ...album(), medium: 'book' })).toBe(false)
  })
})

describe('canFindCover', () => {
  it('picks albums and podcasts whose cover is blank', () => {
    expect(canFindCover(album())).toBe(true)
    expect(canFindCover(album({ coverUrl: '' }))).toBe(true)
    expect(canFindCover(podcast())).toBe(true)
    expect(canFindCover(podcast({ author: null }))).toBe(true)
  })

  it('leaves items that have a cover, and other media', () => {
    expect(canFindCover(album({ coverUrl: 'https://art.example/x.jpg' }))).toBe(false)
    expect(canFindCover({ ...album(), medium: 'book' })).toBe(false)
    expect(canFindCover({ ...album(), medium: 'movie' })).toBe(false)
  })

  it('leaves items no lookup could ever match, so they cost no lookup', () => {
    expect(canFindCover(album({ author: null }))).toBe(false)
    expect(canFindCover(album({ author: '???' }))).toBe(false)
    expect(canFindCover(album({ title: '!!!' }))).toBe(false)
    expect(canFindCover(podcast({ title: '' }))).toBe(false)
  })
})

describe('coverQuery', () => {
  it('searches an album by title and creator', () => {
    expect(coverQuery(album())).toBe('In Rainbows Radiohead')
  })

  it('searches an album with no creator by its title', () => {
    expect(coverQuery(album({ author: null }))).toBe('In Rainbows')
  })

  it('searches a podcast by its title alone', () => {
    expect(coverQuery(podcast())).toBe('Radiolab')
  })
})
