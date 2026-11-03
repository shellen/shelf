// ABOUTME: Finds covers for albums and podcasts that have none: picks the items, builds each
// ABOUTME: iTunes query, matches the results, and runs the lookups one at a time, 3 seconds apart.

import { normKey } from './match.js'

// An empty normalised title, or an album's empty creator, never matches anything
const canMatch = item => normKey(item.title) !== '' && (item.medium !== 'album' || normKey(item.author) !== '')

// Albums and podcasts whose cover is blank
export const missingCover = item => (item.medium === 'album' || item.medium === 'podcast') && !item.coverUrl

// Albums and podcasts with a blank cover that a lookup could match
export const canFindCover = item => missingCover(item) && canMatch(item)

export const coverQuery = item => item.medium === 'album'
  ? [item.title, item.author].filter(Boolean).join(' ')
  : item.title

// iTunes names singles and EPs "Title - Single" and "Title - EP"
const releaseTitle = title => String(title || '').replace(/ - (Single|EP)$/, '')

// The first result with artwork whose title matches the item's, and for an album whose creator does too.
// Podcasts match on title alone: Spotify's publisher and iTunes' artist often differ.
export function matchCover(item, results) {
  if (!canMatch(item)) return null
  const title = normKey(item.title)
  const creator = normKey(item.author)
  const isAlbum = item.medium === 'album'
  return results.find(r => r.coverUrl
    && normKey(releaseTitle(r.title)) === title
    && (!isAlbum || normKey(r.author) === creator)) || null
}
