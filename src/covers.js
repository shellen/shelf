// ABOUTME: Finds covers for albums and podcasts that have none: picks the items, builds each
// ABOUTME: iTunes query, matches the results, and runs the lookups one at a time, 3 seconds apart.

import { normKey } from './match.js'

const PACE_MS = 3000

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

// The item as saved with a found cover, or null when it is gone or has a cover by now.
// A field that has a value is never overwritten.
export function coverUpdate(current, result) {
  if (!current || current.coverUrl) return null
  return { ...current, coverUrl: result.coverUrl, year: current.year ?? result.year }
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

export function coverProgressText(done, total) {
  const minutes = Math.max(1, Math.round((total - done) * PACE_MS / 60_000))
  return `Finding covers ${done} / ${total} · about ${minutes} min left`
}

export const coversFoundText = found => `Found ${plural(found, 'cover')}`
