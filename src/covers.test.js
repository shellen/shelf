// ABOUTME: Tests for finding missing covers: which items need one, the lookup query, matching
// ABOUTME: iTunes results, the update that saves a cover, and the paced, one-at-a-time run.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { missingCover, canFindCover, coverQuery, matchCover, coverUpdate, findCovers, coverProgressText, coversFoundText } from './covers.js'

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

describe('matchCover editions', () => {
  it('finds a remastered edition of the item, and the plain release of a deluxe item', () => {
    const abbeyRoad = album({ title: 'Abbey Road', author: 'The Beatles' })
    expect(matchCover(abbeyRoad, [result({ title: 'Abbey Road (Remastered)', author: 'The Beatles' })])).not.toBeNull()
    const rumours = album({ title: 'Rumours (Super Deluxe)', author: 'Fleetwood Mac' })
    expect(matchCover(rumours, [result({ title: 'Rumours', author: 'Fleetwood Mac' })])).not.toBeNull()
  })

  it('counts bracketed notes that name an edition, in square or round brackets', () => {
    const edition = (title, note) => matchCover(album({ title }), [result({ title: `${title} ${note}` })])
    expect(edition('In Rainbows', '[Remastered 2009]')).not.toBeNull()
    expect(edition('In Rainbows', '(40th Anniversary Edition)')).not.toBeNull()
    expect(edition('In Rainbows', '(2011 Remaster)')).not.toBeNull()
    expect(edition('In Rainbows', '(Deluxe Version)')).not.toBeNull()
    expect(edition('In Rainbows', "(Collector's Edition)")).not.toBeNull()
    expect(edition('In Rainbows', '(Expanded)')).not.toBeNull()
    expect(edition('In Rainbows', '(Bonus Track Version)')).not.toBeNull()
    expect(edition('In Rainbows', '(Special Edition)')).not.toBeNull()
  })

  it('prefers an exact title even when an edition comes first', () => {
    const results = [
      result({ title: 'In Rainbows (Remastered)', coverUrl: 'https://art.example/remaster.jpg' }),
      result({ coverUrl: 'https://art.example/exact.jpg' })
    ]
    expect(matchCover(album(), results).coverUrl).toBe('https://art.example/exact.jpg')
  })

  it.each(['(Live)', '(Demo)', '(Mono)', '(Disk 2)', "(Taylor's Version)"])('keeps the note %s as part of the title', note => {
    expect(matchCover(album({ title: 'Red', author: 'Taylor Swift' }), [result({ title: `Red ${note}`, author: 'Taylor Swift' })])).toBeNull()
    expect(matchCover(album({ title: `Red ${note}`, author: 'Taylor Swift' }), [result({ title: 'Red', author: 'Taylor Swift' })])).toBeNull()
  })

  it.each(['(Remastered Live)', '[Live / Deluxe Edition]', '(Deluxe Demo)', '(Mono Remaster)'])('keeps the mixed note %s as part of the title', note => {
    expect(matchCover(album({ title: 'A' }), [result({ title: `A ${note}` })])).toBeNull()
    expect(matchCover(album({ title: `A ${note}` }), [result({ title: 'A' })])).toBeNull()
  })

  it('does not give a live album the studio album\'s cover', () => {
    expect(matchCover(album({ title: 'Live at Leeds (Remastered Live)' }), [result({ title: 'Live at Leeds' })])).toBeNull()
  })

  it('counts a collector\'s edition written with a curly apostrophe', () => {
    expect(matchCover(album({ title: 'A' }), [result({ title: 'A (Collector\u2019s Edition)' })])).not.toBeNull()
  })

  it('ignores whitespace after an edition note', () => {
    expect(matchCover(album({ title: 'A' }), [result({ title: 'A (Deluxe Edition) ' })])).not.toBeNull()
  })

  it('leaves a note in the middle of a title alone', () => {
    expect(matchCover(album({ title: 'Abbey (Remastered) Road' }), [result({ title: 'Abbey Road' })])).toBeNull()
  })

  it('still needs the same creator', () => {
    expect(matchCover(album(), [result({ title: 'In Rainbows (Remastered)', author: 'Radiohead Tribute Band' })])).toBeNull()
  })

  it('removes an edition note together with " - Single" or " - EP"', () => {
    expect(matchCover(album({ title: 'My Iron Lung (Deluxe) - EP' }), [result({ title: 'My Iron Lung' })])).not.toBeNull()
    expect(matchCover(album({ title: 'My Iron Lung' }), [result({ title: 'My Iron Lung (Remastered) - EP' })])).not.toBeNull()
  })

  it('never matches on a title that is only an edition note', () => {
    expect(matchCover(album({ title: '(Deluxe)' }), [result({ title: '(Remastered)' })])).toBeNull()
  })

  it('applies to podcasts as well, on title alone', () => {
    expect(matchCover(podcast(), [result({ title: 'Radiolab (Deluxe)', author: 'WNYC' })])).not.toBeNull()
  })
})

describe('coverUpdate', () => {
  it('adds the cover, and the year when the item has none', () => {
    expect(coverUpdate(album(), result())).toEqual({ ...album(), coverUrl: 'https://art.example/in-rainbows.jpg', year: 2007 })
  })

  it('keeps a year the item already has', () => {
    expect(coverUpdate(album({ year: 2008 }), result()).year).toBe(2008)
  })

  it('is null when the item has a cover by now', () => {
    expect(coverUpdate(album({ coverUrl: 'https://art.example/mine.jpg' }), result())).toBeNull()
  })

  it('is null when the item is gone', () => {
    expect(coverUpdate(undefined, result())).toBeNull()
  })
})

describe('progress text', () => {
  it('counts the items tried and estimates the minutes left at 3 seconds each', () => {
    expect(coverProgressText(12, 140)).toBe('Finding covers 12 / 140 · about 6 min left')
  })

  it('never says less than a minute is left', () => {
    expect(coverProgressText(139, 140)).toBe('Finding covers 139 / 140 · about 1 min left')
  })

  it('reports the covers found', () => {
    expect(coversFoundText(131)).toBe('Found 131 covers')
    expect(coversFoundText(1)).toBe('Found 1 cover')
    expect(coversFoundText(0)).toBe('Found 0 covers')
  })
})

describe('findCovers', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // A lookup answering from a table of query → results; a query not in the table finds nothing
  const lookupFrom = table => vi.fn(async item => table[coverQuery(item)] || [])

  it('saves the matching result for each item and counts the covers found', async () => {
    const items = [album(), podcast()]
    const lookup = lookupFrom({ 'In Rainbows Radiohead': [result()], Radiolab: [result({ title: 'Radiolab', author: 'WNYC' })] })
    const save = vi.fn(async () => true)
    const run = findCovers(items, { lookup, save, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 2, stopped: false })
    expect(save.mock.calls.map(([item, match]) => [item.id, match.title])).toEqual([['in-rainbows', 'In Rainbows'], ['radiolab', 'Radiolab']])
  })

  it('saves nothing for an item without a match', async () => {
    const save = vi.fn(async () => true)
    const run = findCovers([album()], { lookup: lookupFrom({}), save, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 0, stopped: false })
    expect(save).not.toHaveBeenCalled()
  })

  it('does not count a cover the save declined', async () => {
    const run = findCovers([album()], { lookup: lookupFrom({ 'In Rainbows Radiohead': [result()] }), save: async () => false, progress: () => {} })
    await vi.runAllTimersAsync()
    expect((await run).found).toBe(0)
  })

  it('looks up one item at a time, 3 seconds apart', async () => {
    let answer
    const lookup = vi.fn(() => new Promise(resolve => { answer = resolve }))
    const run = findCovers([album({ id: 'a' }), album({ id: 'b' })], { lookup, save: async () => true, progress: () => {} })

    await vi.advanceTimersByTimeAsync(0)
    expect(lookup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(lookup).toHaveBeenCalledTimes(1) // still waiting on the first answer

    answer([])
    await vi.advanceTimersByTimeAsync(2999)
    expect(lookup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(lookup).toHaveBeenCalledTimes(2)

    answer([])
    await run
  })

  it('stops after 3 lookups in a row fail', async () => {
    const lookup = vi.fn(async () => { throw new Error('Lookup failed (500)') })
    const items = [1, 2, 3, 4, 5].map(n => album({ id: `a${n}` }))
    const run = findCovers(items, { lookup, save: async () => true, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 0, stopped: true })
    expect(lookup).toHaveBeenCalledTimes(3)
  })

  it('starts counting failures again after a lookup succeeds', async () => {
    const answers = ['fail', 'fail', 'ok', 'fail', 'fail']
    const lookup = vi.fn(async () => {
      if (answers.shift() === 'fail') throw new Error('Lookup failed (500)')
      return []
    })
    const items = [1, 2, 3, 4, 5].map(n => album({ id: `a${n}` }))
    const run = findCovers(items, { lookup, save: async () => true, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 0, stopped: false })
    expect(lookup).toHaveBeenCalledTimes(5)
  })

  it('moves on when a save fails, leaving that item for the next run', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to update book'))
      .mockResolvedValueOnce(true)
    const lookup = lookupFrom({ 'In Rainbows Radiohead': [result()] })
    const run = findCovers([album({ id: 'a' }), album({ id: 'b' })], { lookup, save, progress: () => {} })
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ found: 1, stopped: false })
  })

  it('reports progress before each lookup', async () => {
    const progress = vi.fn()
    const run = findCovers([album({ id: 'a' }), album({ id: 'b' }), album({ id: 'c' })], { lookup: lookupFrom({}), save: async () => true, progress })
    await vi.runAllTimersAsync()
    await run
    expect(progress.mock.calls).toEqual([[0, 3], [1, 3], [2, 3]])
  })
})
