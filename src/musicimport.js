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

// Track flags that keep a track out of the import; key names confirmed against a real Library.xml
const SKIPPED_TRACK_FLAGS = ['Playlist Only', 'Podcast', 'Movie', 'TV Show', 'Music Video']

// A Kind naming a video or movie file, or a stream, also keeps a track out
const isSkippedKind = kind => /video|movie/i.test(clean(kind)) || clean(kind) === 'HLS media'

// A plist <dict> as an object: its keys, each with its value read by type
function readDict(dict) {
  const out = {}
  for (let key = dict.firstElementChild; key; key = key.nextElementSibling?.nextElementSibling) {
    const value = key.nextElementSibling
    out[key.textContent] = value?.tagName === 'integer' ? Number(value.textContent)
      : value?.tagName === 'true' ? true
      : value?.tagName === 'dict' ? value
      : value?.textContent
  }
  return out
}

// The most frequent value, ties going to the alphabetically first
function mostCommon(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts].sort(([a, m], [b, n]) => n - m || a.localeCompare(b))[0]?.[0]
}

const albumArtist = track => clean(track['Album Artist'])
  || (track.Compilation ? 'Various Artists' : clean(track.Artist))

function appleAlbum(tracks) {
  return entry({
    title: clean(tracks[0].Album),
    author: mostCommon(tracks.map(albumArtist).filter(Boolean)) || null,
    medium: 'album',
    tags: ['apple-music']
  })
}

export function parseAppleLibrary(text) {
  // The Playlists section is ignored and often large, so the text is cut before it and closed again
  const cut = text.indexOf('<key>Playlists</key>')
  const xml = cut === -1 ? text : `${text.slice(0, cut)}</dict></plist>`
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Library.xml is not well-formed')
  const root = doc.documentElement.firstElementChild
  const tracksDict = root && readDict(root).Tracks
  if (!tracksDict) throw new Error('Library.xml has no Tracks')

  const albums = new Map()
  for (const value of Object.values(readDict(tracksDict))) {
    const track = readDict(value)
    if (!clean(track.Album) || SKIPPED_TRACK_FLAGS.some(flag => track[flag]) || isSkippedKind(track.Kind)) continue
    const key = albumKey(track.Album, albumArtist(track))
    if (!albums.has(key)) albums.set(key, [])
    albums.get(key).push(track)
  }
  return { books: [...albums.values()].map(appleAlbum), failed: [] }
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
