// ABOUTME: Tests for finding missing covers: which items need one, the lookup query, matching
// ABOUTME: iTunes results, the update that saves a cover, and the paced, one-at-a-time run.

import { describe, it, expect } from 'vitest'
import { missingCover, canFindCover, coverQuery, matchCover } from './covers.js'

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

describe('matchCover', () => {
  it('takes the first result whose title and creator match once normalised', () => {
    const results = [
      result({ title: 'In Rainbows (Disk 2)', coverUrl: 'https://art.example/disk2.jpg' }),
      result({ title: 'in rainbows!', author: 'RADIOHEAD', coverUrl: 'https://art.example/first.jpg' }),
      result({ coverUrl: 'https://art.example/second.jpg' })
    ]
    expect(matchCover(album(), results).coverUrl).toBe('https://art.example/first.jpg')
  })

  it('skips an album result by another artist', () => {
    expect(matchCover(album(), [result({ author: 'Radiohead Tribute Band' })])).toBeNull()
  })

  it('removes iTunes\' " - Single" and " - EP" from result titles', () => {
    expect(matchCover(album({ title: 'Creep' }), [result({ title: 'Creep - Single' })])).not.toBeNull()
    expect(matchCover(album({ title: 'My Iron Lung' }), [result({ title: 'My Iron Lung - EP' })])).not.toBeNull()
  })

  it('matches a podcast on its title alone', () => {
    expect(matchCover(podcast(), [result({ title: 'Radiolab', author: 'WNYC' })])).not.toBeNull()
  })

  it('never matches on an empty normalised title or creator', () => {
    expect(matchCover(album({ title: '!!!' }), [result({ title: '???' })])).toBeNull()
    expect(matchCover(album({ author: null }), [result({ author: null })])).toBeNull()
    expect(matchCover(podcast({ title: '...' }), [result({ title: '' })])).toBeNull()
  })

  it('skips a matching result that has no artwork', () => {
    expect(matchCover(album(), [result({ coverUrl: null })])).toBeNull()
  })

  it('matches an item whose own title ends in " - EP" or " - Single"', () => {
    const item = album({ title: 'My Iron Lung - EP' })
    expect(matchCover(item, [result({ title: 'My Iron Lung - EP' })])).not.toBeNull()
    expect(matchCover(item, [result({ title: 'My Iron Lung' })])).not.toBeNull()
  })

  it('leaves "Single" and "EP" in the middle of a title alone', () => {
    expect(matchCover(album({ title: 'Single Ladies' }), [result({ title: 'Ladies' })])).toBeNull()
    expect(matchCover(album({ title: 'EP Remixes' }), [result({ title: 'Remixes' })])).toBeNull()
  })

  it('skips a result with no artwork and takes a later matching one that has it', () => {
    const results = [result({ coverUrl: null }), result({ coverUrl: 'https://art.example/later.jpg' })]
    expect(matchCover(album(), results).coverUrl).toBe('https://art.example/later.jpg')
  })

  it('skips an album result with no creator when the album has one', () => {
    expect(matchCover(album(), [result({ author: null })])).toBeNull()
  })

  it('finds nothing in no results', () => {
    expect(matchCover(album(), [])).toBeNull()
  })
})
