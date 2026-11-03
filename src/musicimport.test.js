// ABOUTME: Tests for the music library readers (Spotify's YourLibrary.json, Apple Music's Library.xml)
// ABOUTME: and for telling an import file's type from its contents.

import { describe, it, expect } from 'vitest'
import { parseSpotifyLibrary, detectImportFile } from './musicimport.js'

// The fields every import entry carries, as parseGoodreadsCsv's entries do
const BLANK = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }

describe('parseSpotifyLibrary', () => {
  const spotify = data => parseSpotifyLibrary(JSON.stringify(data))

  it('makes an album of each saved album, tagged with its source', () => {
    const { books, failed } = spotify({
      albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }]
    })
    expect(books).toEqual([
      { ...BLANK, title: 'In Rainbows', author: 'Radiohead', medium: 'album', tags: ['spotify'] }
    ])
    expect(failed).toEqual([])
  })

  it('makes an album of each liked song\'s album, so a liked single becomes an album', () => {
    const { books } = spotify({
      tracks: [{ artist: 'Robyn', album: 'Dancing On My Own', track: 'Dancing On My Own', uri: 'spotify:track:1' }]
    })
    expect(books.map(b => [b.title, b.author, b.medium])).toEqual([['Dancing On My Own', 'Robyn', 'album']])
  })

  it('lists an album once however it is spelled across saved albums and liked songs', () => {
    const { books } = spotify({
      albums: [{ artist: 'Björk', album: 'Homogenic', uri: 'spotify:album:2' }],
      tracks: [
        { artist: 'Bjork', album: 'Homogenic', track: 'Jóga', uri: 'spotify:track:2' },
        { artist: 'björk', album: 'HOMOGENIC!', track: 'Bachelorette', uri: 'spotify:track:3' }
      ]
    })
    expect(books.map(b => [b.title, b.author])).toEqual([['Homogenic', 'Björk']])
  })

  it('keeps albums of the same name by different artists apart', () => {
    const { books } = spotify({
      albums: [
        { artist: 'Weezer', album: 'Weezer', uri: 'spotify:album:3' },
        { artist: 'Peter Gabriel', album: 'Weezer', uri: 'spotify:album:4' }
      ]
    })
    expect(books).toHaveLength(2)
  })

  it('makes a podcast of each followed show, with its publisher as the creator', () => {
    const { books } = spotify({
      shows: [{ name: 'Radiolab', publisher: 'WNYC Studios', uri: 'spotify:show:1' }]
    })
    expect(books).toEqual([
      { ...BLANK, title: 'Radiolab', author: 'WNYC Studios', medium: 'podcast', tags: ['spotify'] }
    ])
  })

  it('skips records with no album or show name', () => {
    const { books } = spotify({
      albums: [{ artist: 'Nobody', album: '  ', uri: 'spotify:album:5' }],
      tracks: [{ artist: 'Nobody', track: 'Untitled', uri: 'spotify:track:4' }],
      shows: [{ publisher: 'Nobody', uri: 'spotify:show:2' }]
    })
    expect(books).toEqual([])
  })

  it('treats a missing or malformed section as empty', () => {
    expect(spotify({})).toEqual({ books: [], failed: [] })
    expect(spotify({ albums: 'x', tracks: null, shows: {} })).toEqual({ books: [], failed: [] })
  })

  it('leaves the creator blank when a record names none', () => {
    const { books } = spotify({ albums: [{ album: 'Untitled', uri: 'spotify:album:6' }] })
    expect(books).toEqual([{ ...BLANK, title: 'Untitled', author: null, medium: 'album', tags: ['spotify'] }])
  })

  it('ignores the arrays it does not import', () => {
    const { books } = spotify({
      albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }],
      episodes: [{ name: 'Episode 1', show: 'Radiolab' }],
      bannedTracks: [{ artist: 'X', album: 'Y', track: 'Z' }],
      other: ['anything']
    })
    expect(books.map(b => b.title)).toEqual(['In Rainbows'])
  })
})

describe('detectImportFile', () => {
  const PLIST_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Major Version</key><integer>1</integer>
\t<key>Tracks</key>
\t<dict>`

  it('recognises an Apple Music library by its plist header and Tracks key', () => {
    expect(detectImportFile(`${PLIST_HEAD}</dict></dict></plist>`)).toBe('apple')
  })

  it('looks for the Apple header only in the first 4 KB', () => {
    expect(detectImportFile(`${' '.repeat(4096)}${PLIST_HEAD}</dict></dict></plist>`)).toBe(null)
  })

  it('does not take a plist without Tracks for a music library', () => {
    expect(detectImportFile('<?xml version="1.0"?><plist version="1.0"><dict><key>Name</key><string>x</string></dict></plist>')).toBe(null)
  })

  it('recognises a Spotify library by an albums, tracks or shows key, even when it is cut short', () => {
    expect(detectImportFile('{"albums": []}')).toBe('spotify')
    expect(detectImportFile('\n  {\n  "tracks" : [ {"artist": "Robyn", "album": "Body Ta')).toBe('spotify')
    expect(detectImportFile('{"other": [], "shows": []}')).toBe('spotify')
  })

  it('looks for Spotify\'s keys only in the first 4 KB', () => {
    expect(detectImportFile(`{"other": "${'x'.repeat(4096)}", "albums": []}`)).toBe(null)
  })

  it('recognises a Goodreads export by its Title column', () => {
    expect(detectImportFile('Book Id,Title,Author,My Rating\n1,Dune,Frank Herbert,5')).toBe('goodreads')
  })

  it('still recognises a plain Title,Author CSV as Goodreads', () => {
    expect(detectImportFile('Title,Author\nDune,Frank Herbert')).toBe('goodreads')
    expect(detectImportFile('"Title","Author"\r\n"Dune","Frank Herbert"')).toBe('goodreads')
  })

  it('returns null for unrelated XML, JSON and CSV', () => {
    expect(detectImportFile('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>')).toBe(null)
    expect(detectImportFile('{"playlists": [], "name": "albums"}')).toBe(null)
    expect(detectImportFile('null')).toBe(null)
    expect(detectImportFile('[{"albums": []}]')).toBe(null)
    expect(detectImportFile('Name,Artist\nIn Rainbows,Radiohead')).toBe(null)
    expect(detectImportFile('')).toBe(null)
  })
})
