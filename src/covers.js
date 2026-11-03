// ABOUTME: Finds covers for albums and podcasts that have none: picks the items, builds each
// ABOUTME: iTunes query, matches the results, and runs the lookups one at a time, 3 seconds apart.

import { normKey } from './match.js'

const PACE_MS = 3000
const FAILURES_BEFORE_STOPPING = 3

export const COVERS_STOPPED = 'Stopped finding covers: iTunes isn\'t answering. Try Find missing covers later.'

// iTunes names singles and EPs "Title - Single" and "Title - EP"
const releaseTitle = title => String(title || '').replace(/ - (Single|EP)$/, '')

const titleKey = title => normKey(releaseTitle(title))

// Words in a trailing bracketed note that mark a reissue of the same album.
// A note that also says live, demo or mono names a different recording, so it stays part of the title.
const EDITION_NOTE = /\s*[(\[](?![^)\]]*\b(live|demo|mono)\b)[^)\]]*\b(remaster(ed)?|deluxe|expanded|anniversary|collector['\u2019]s|bonus|special edition)\b[^)\]]*[)\]]\s*$/i

const editionlessTitleKey = title => normKey(releaseTitle(title).replace(EDITION_NOTE, ''))

// An empty normalised title, or an album's empty creator, never matches anything
const canMatch = item => titleKey(item.title) !== '' && (item.medium !== 'album' || normKey(item.author) !== '')

// Albums and podcasts whose cover is blank
export const missingCover = item => (item.medium === 'album' || item.medium === 'podcast') && !item.coverUrl

// Albums and podcasts with a blank cover that a lookup could match
export const canFindCover = item => missingCover(item) && canMatch(item)

export const coverQuery = item => item.medium === 'album'
  ? [item.title, item.author].filter(Boolean).join(' ')
  : item.title

// The first result with artwork whose title matches the item's, and for an album whose creator does too.
// Podcasts match on title alone: Spotify's publisher and iTunes' artist often differ.
// Only when no result matches exactly is a trailing edition note ignored in both titles.
export function matchCover(item, results) {
  if (!canMatch(item)) return null
  const creator = normKey(item.author)
  const isAlbum = item.medium === 'album'
  const find = key => {
    const title = key(item.title)
    return title !== '' && results.find(r => r.coverUrl
      && key(r.title) === title
      && (!isAlbum || normKey(r.author) === creator))
  }
  return find(titleKey) || find(editionlessTitleKey) || null
}

// The fields to save for a found cover: the cover, plus the result's year when the item has
// none. Null when the item is gone or has a cover by now. A field that has a value is never overwritten.
export function coverUpdate(current, result) {
  if (!current || current.coverUrl) return null
  const update = { coverUrl: result.coverUrl }
  if (current.year == null && result.year != null) update.year = result.year
  return update
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

export function coverProgressText(done, total) {
  const minutes = Math.max(1, Math.round((total - done) * PACE_MS / 60_000))
  return `Finding covers ${done} / ${total} · about ${minutes} min left`
}

export const coversFoundText = found => `Found ${plural(found, 'cover')}`

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Looks up each item in turn and saves the matches. lookup(item) resolves to results or
// rejects; save(item, match) resolves true when it stored a cover; progress(done, total)
// is told before each lookup. Stops early after 3 lookups in a row fail, or quietly
// before a lookup or a save when keepGoing() says no.
export async function findCovers(items, { lookup, save, progress, keepGoing = () => true }) {
  let found = 0
  let failures = 0
  for (const [done, item] of items.entries()) {
    if (done > 0) await wait(PACE_MS)
    if (!keepGoing()) break
    progress(done, items.length)
    let results
    try {
      results = await lookup(item)
      failures = 0
    } catch (e) {
      failures++
      if (failures === FAILURES_BEFORE_STOPPING) return { found, stopped: true }
      continue
    }
    if (!keepGoing()) break
    const match = matchCover(item, results)
    try {
      if (match && await save(item, match)) found++
    } catch (e) {
      // A failed save leaves the item without a cover for the next run to find
      console.error('Cover not saved:', e)
    }
  }
  return { found, stopped: false }
}
