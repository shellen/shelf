// ABOUTME: Reads music library exports into import entries: Spotify's YourLibrary.json
// ABOUTME: and Apple Music's Library.xml, and tells an import file's type from its contents.

import { normKey } from './match.js'

// The fields every import entry carries, as parseGoodreadsCsv's entries do
const BLANK = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }

const entry = fields => ({ ...BLANK, ...fields })
const clean = v => String(v ?? '').trim()
const listOf = v => Array.isArray(v) ? v : []
const albumKey = (title, artist) => `${normKey(title)}|${normKey(artist)}`

export function parseSpotifyLibrary(text) {
  const data = JSON.parse(text)
  const albums = new Map()
  for (const record of [...listOf(data.albums), ...listOf(data.tracks)]) {
    const title = clean(record?.album)
    if (!title) continue
    const author = clean(record.artist) || null
    const key = albumKey(title, author)
    if (!albums.has(key)) albums.set(key, entry({ title, author, medium: 'album', tags: ['spotify'] }))
  }
  const podcasts = listOf(data.shows).flatMap(show => {
    const title = clean(show?.name)
    return title ? [entry({ title, author: clean(show.publisher) || null, medium: 'podcast', tags: ['spotify'] })] : []
  })
  return { books: [...albums.values(), ...podcasts], failed: [] }
}

// Which reader an import file needs, from its contents: 'apple', 'spotify', 'goodreads' or null.
// Only the first 4 KB are read, so a large file is never parsed just to name it, and a
// truncated Spotify file is still recognised (its reader then reports it as damaged).
export function detectImportFile(text) {
  const head = text.slice(0, 4096)
  if (head.includes('<plist') && head.includes('<key>Tracks</key>')) return 'apple'
  if (/^\s*\{/.test(head) && /"(albums|tracks|shows)"\s*:/.test(head)) return 'spotify'
  const header = head.split(/\r?\n/, 1)[0].split(',').map(f => f.trim().replace(/^"(.*)"$/, '$1'))
  if (header.includes('Title')) return 'goodreads'
  return null
}
